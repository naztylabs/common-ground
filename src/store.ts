import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Registry, LegacyRegistry, PillarDefinition, ChapterDefinition, Chapter, Fact, Update, relativePath, unique, type RegistryRecord, type ChapterRecord, type Definition, type UpdateRequest } from './model.js';
import { reviewDocuments } from './review-files.js';
const ignored = new Set(['.git','node_modules','.common-ground','dist','build','target','.nx','.next','coverage','.env']);
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const stable = (v: unknown): string => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a],[b]) => a.localeCompare(b))) : x);
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);
export class Store {
  root: string;
  constructor(root: string) { this.root = path.resolve(root); }
  file(name: string) { return path.join(this.root, '.common-ground', name); }
  async safe(relative: string, allowMissing = false) {
    if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => p === '..' || !p)) throw new Error('Unsafe repository path');
    let current = this.root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlinks are not supported: ${relative}`); }
      catch (e: any) { if (e.code === 'ENOENT' && allowMissing) return current; throw e; }
    }
    return current;
  }
  chapters(registry: RegistryRecord) {
    return registry.pillars.flatMap(p => p.chapters.map(chapter => ({ key: `${p.id}/${chapter.id}`, pillar: p, chapter })));
  }
  chapter(registry: RegistryRecord, key: string): ChapterRecord {
    const entry = this.chapters(registry).find(c => c.key === key);
    if (!entry) throw new Error(`Unknown chapter: ${key}. Use list_chapters first.`);
    return entry.chapter;
  }
  validateRegistry(value: unknown): RegistryRecord {
    const registry = Registry.parse(value);
    unique(registry.pillars.map(p=>p.id), 'pillar IDs');
    const entries = this.chapters(registry);
    unique(entries.map(e=>e.key), 'chapter IDs');
    const factKeys=new Set(entries.flatMap(e=>e.chapter.facts.map(f=>`${e.key}/${f.id}`)));
    for (const {key, chapter} of entries) {
      unique(chapter.facts.map(f=>f.id), 'fact IDs');
      for (const fact of chapter.facts) {
        unique(fact.dependsOn, 'fact dependencies');
        for (const dependency of fact.dependsOn) {
          if (dependency === `${key}/${fact.id}` || !factKeys.has(dependency)) throw new Error(`Invalid dependency ${dependency} in ${key}/${fact.id}`);
        }
      }
    }
    for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) {
      if (entries[i].chapter.paths.some(a=>entries[j].chapter.paths.some(b=>a===b||a.startsWith(`${b}/`)||b.startsWith(`${a}/`)))) throw new Error(`Overlapping ownership: ${entries[i].key} and ${entries[j].key}`);
    }
    return registry;
  }
  async read(): Promise<RegistryRecord> {
    await this.safe('.common-ground/knowledge.json');
    const raw = JSON.parse(await fs.readFile(this.file('knowledge.json'),'utf8'));
    if (raw.schemaVersion === 1) throw new Error('Schema v1 requires migration: cground migrate --approve, then cground init.');
    return this.validateRegistry(raw);
  }
  async persist(registry: RegistryRecord) { await this.atomic('knowledge.json',this.validateRegistry(registry)); }
  async atomic(name: string, value: unknown) {
    await this.safe(`.common-ground/${name}`, true);
    await fs.mkdir(path.dirname(this.file(name)), { recursive: true });
    const tmp = this.file(`${name}.${randomUUID()}.tmp`);
    try { await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await fs.rename(tmp, this.file(name)); }
    finally { await fs.rm(tmp, { force: true }); }
  }
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    await this.safe('.common-ground', true);
    await fs.mkdir(this.file('local'), { recursive: true });
    await this.safe('.common-ground/local');
    const lock = this.file('local/write.lock');
    try { await fs.mkdir(lock); } catch { throw new Error('Another writer holds the lock. If it crashed, remove .common-ground/local/write.lock after checking no writer is active.'); }
    try { return await fn(); } finally { await fs.rmdir(lock); }
  }
  async walk(scopes: string[] = [], limit = 3000): Promise<{ files: string[]; truncated: boolean }> {
    const files = new Set<string>(); let visited = 0; let truncated = false;
    const visit = async (rel: string) => {
      if (++visited > limit) { truncated = true; return; }
      if (rel.split('/').some(p => ignored.has(p) || p.startsWith('.env'))) return;
      let stat; try { stat = await fs.lstat(path.join(this.root, rel)); } catch (e: any) { if (e.code === 'ENOENT') return; throw e; }
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) { for (const name of (await fs.readdir(path.join(this.root, rel))).sort()) { if (visited > limit) { truncated = true; break; } await visit(rel ? `${rel}/${name}` : name); } }
      else if (stat.isFile()) files.add(rel);
    };
    for (const scope of scopes.length ? scopes : ['']) { if (scope) await this.safe(scope, true); await visit(scope); }
    return { files: [...files].sort(), truncated };
  }
  async snapshot(pillar: Pick<ChapterRecord, 'paths' | 'facts'>) {
    const scopes = pillar.facts.flatMap(f=>f.sourceScope);
    const scan = scopes.length ? await this.walk([...new Set(scopes)], 10000) : {files:[],truncated:false};
    if (scan.truncated) throw new Error('Chapter scope exceeds beta scan limit (10,000 entries); narrow its scope.');
    const sources: Record<string,string> = {};
    for (const rel of [...new Set([...scan.files, ...pillar.facts.flatMap(f => f.evidence.map(e => e.path))])].sort()) {
      if (rel.split('/').some(p => ignored.has(p) || p.startsWith('.env'))) throw new Error(`Excluded evidence path: ${rel}`);
      const file = await this.safe(rel);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 2_000_000) throw new Error(`Evidence/scope file exceeds beta limits: ${rel}`);
      sources[rel] = hash(await fs.readFile(file));
    }
    return sources;
  }
  async validateFacts(pillar: Pick<ChapterRecord,'paths'|'facts'>) {
    unique(pillar.facts.map(f => f.id), 'fact IDs');
    for (const fact of pillar.facts) {
      for (const scope of fact.sourceScope) if (!pillar.paths.some(p=>scope===p||scope.startsWith(`${p}/`))) throw new Error(`Fact source scope outside chapter: ${scope}`);
      for (const evidence of fact.evidence) {
      if (!fact.sourceScope.some(p=>evidence.path===p||evidence.path.startsWith(`${p}/`))) throw new Error(`Evidence outside fact source scope: ${evidence.path}`);
      if (!pillar.paths.some(p => evidence.path === p || evidence.path.startsWith(`${p}/`))) throw new Error(`Evidence outside chapter scope: ${evidence.path}`);
      const file = await this.safe(evidence.path);
      if ((await fs.stat(file)).size > 2_000_000) throw new Error('Evidence file too large');
      if (!(await fs.readFile(file, 'utf8')).includes(evidence.quote)) throw new Error(`Evidence quote not found: ${fact.id} in ${evidence.path}`);
      }
    }
  }
  facts(registry: RegistryRecord) {
    return this.chapters(registry).flatMap(({key,chapter})=>chapter.facts.map(fact=>({key:`${key}/${fact.id}`,chapterId:key,chapter,fact})));
  }
  fact(registry:RegistryRecord,key:string){const result=this.facts(registry).find(f=>f.key===key);if(!result)throw new Error(`Unknown fact: ${key}`);return result;}
  impact(registry:RegistryRecord,key:string,factIds?:string[]) {
    const chapter=this.chapter(registry,key);const all=this.facts(registry);
    const byKey=new Map(all.map(entry=>[entry.key,entry]));const dependents=new Map<string,string[]>();
    for(const entry of all)for(const dep of entry.fact.dependsOn)dependents.set(dep,[...(dependents.get(dep)??[]),entry.key]);
    const ids=new Set(chapter.facts.map(f=>f.id));
    const visited=new Set((factIds??[...ids]).filter(id=>ids.has(id)).map(id=>`${key}/${id}`));
    for(const current of visited){
      for(const dep of byKey.get(current)!.fact.dependsOn)visited.add(dep);
      for(const dependent of dependents.get(current)??[])visited.add(dependent);
    }
    return [...visited].sort();
  }
  related(registry:RegistryRecord,key:string,factIds?:string[]){return [...new Set([key,...this.impact(registry,key,factIds).map(k=>k.slice(0,k.lastIndexOf('/')))])].sort();}
  upstreamFacts(registry:RegistryRecord,key:string,index=new Map(this.facts(registry).map(e=>[e.key,e]))) {
    const visited=new Set<string>();const pending=[key];
    while(pending.length){const current=pending.pop()!;for(const dep of index.get(current)!.fact.dependsOn)if(dep!==key&&!visited.has(dep)){visited.add(dep);pending.push(dep);}}
    return [...visited];
  }
  dependencyFingerprints(registry:RegistryRecord,key:string){
    const index=new Map(this.facts(registry).map(e=>[e.key,e]));
    const keys=new Set(this.chapter(registry,key).facts.flatMap(f=>this.upstreamFacts(registry,`${key}/${f.id}`,index)));
    return Object.fromEntries([...keys].sort().map(k=>[k,hash(stable(index.get(k)!.fact))]));
  }
  async context(registry: RegistryRecord, keys: string[]) {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const chapter=this.chapter(registry,key);
      result[key]={chapterHash:hash(stable(chapter)),snapshot:await this.snapshot(chapter)};
    }
    return result;
  }
  async status(key: string, registry?: RegistryRecord) {
    const reg=registry??await this.read(); const chapter=this.chapter(reg,key);
    try {
      const current=await this.snapshot(chapter);
      const changed=[...new Set([...Object.keys(current),...Object.keys(chapter.sources)])].filter(p=>current[p]!==chapter.sources[p]);
      const dependencies=Object.keys(this.dependencyFingerprints(reg,key));
      let dependencyDrift=!same(chapter.dependencyFingerprints,this.dependencyFingerprints(reg,key));
      for(const dep of dependencies) {
        const entry=this.fact(reg,dep);const current=await this.snapshot({paths:entry.fact.sourceScope,facts:[entry.fact]});
        const baseline=Object.fromEntries(Object.entries(entry.chapter.sources).filter(([p])=>entry.fact.sourceScope.some(s=>p===s||p.startsWith(`${s}/`))));
        if(!same(current,baseline))dependencyDrift=true;
      }
      let locallyReviewed=false;
      const reviewName=`local/review-${key.replace('/','--')}.json`;
      try {
        await this.safe(`.common-ground/${reviewName}`);
        const review=JSON.parse(await fs.readFile(this.file(reviewName),'utf8'));
        locallyReviewed=same(review.context,await this.context(reg,Object.keys(review.context))) && this.related(reg,key).every(k=>Object.hasOwn(review.context,k));
      } catch(e:any) { if(e.code!=='ENOENT')throw e; }
      return {chapterId:key,revision:chapter.revision,status:!chapter.facts.length?'unpopulated':(changed.length||dependencyDrift)&&!locallyReviewed?'needs-review':'evidence-unchanged',locallyReviewed,changedPaths:changed,dependencyDrift};
    } catch(e:any) {return {chapterId:key,revision:chapter.revision,status:'needs-review',error:e.message};}
  }
  async migrate() {
    return this.lock(async()=>{
      await this.safe('.common-ground/knowledge.json');
      const raw=JSON.parse(await fs.readFile(this.file('knowledge.json'),'utf8'));
      if(raw.schemaVersion===2)return {migrated:false};
      const legacy=LegacyRegistry.parse(raw);
      const registry:RegistryRecord={schemaVersion:2,pillars:legacy.pillars.map(({paths,facts,sources,revision,...p})=>({...p,chapters:[{id:'overview',title:'Overview',scope:p.scope,excludes:p.excludes,paths,facts:facts.map(f=>({...f,sourceScope:[...new Set(f.evidence.map(e=>e.path))],dependsOn:[]})),sources,revision,dependencyFingerprints:{}}]}))};
      this.validateRegistry(registry);
      await this.atomic('local/pre-v2-migration.json',raw);
      await this.persist(registry);
      return {migrated:true,pillars:registry.pillars.length,backup:'.common-ground/local/pre-v2-migration.json'};
    });
  }
  async approveDefinitions(definitions: Definition[], standaloneReason?: string) {
    return this.lock(async()=>{
      let registry:RegistryRecord;
      try {registry=await this.read();}catch(e:any){if(e.code!=='ENOENT')throw e;registry={schemaVersion:2,pillars:[]};}
      if(registry.pillars.length&&!standaloneReason?.trim())throw new Error('New pillars require developer approval and an uncovered standalone responsibility explanation.');
      for(const input of definitions) {
        const def=PillarDefinition.parse(input);
        for(const chapter of def.chapters)for(const p of chapter.paths)await this.safe(p);
        registry.pillars.push({...def,chapters:def.chapters.map(c=>({...c,revision:1,facts:[],sources:{},dependencyFingerprints:{}}))});
      }
      await this.persist(registry);return registry;
    });
  }
  async addChapters(pillarId: string, definitions: unknown[]) {
    return this.lock(async()=>{
      const registry=await this.read();const pillar=registry.pillars.find(p=>p.id===pillarId);
      if(!pillar)throw new Error('Unknown pillar');
      for(const input of definitions){const def=ChapterDefinition.parse(input);for(const p of def.paths)await this.safe(p);pillar.chapters.push({...def,revision:1,facts:[],sources:{},dependencyFingerprints:{}});}
      await this.persist(registry);return pillar;
    });
  }
  async seed(key: string, facts: unknown) {
    return this.lock(async()=>{
      const registry=await this.read();const chapter=this.chapter(registry,key);
      if(chapter.facts.length)throw new Error('Seed is only for an approved, empty chapter.');
      const next=Chapter.parse({...chapter,facts});
      await this.validateFacts(next);next.sources=await this.snapshot(next);
      Object.assign(chapter,next);this.validateRegistry(registry);
      chapter.dependencyFingerprints=this.dependencyFingerprints(registry,key);
      await this.persist(registry);return chapter;
    });
  }
  async admit(key: string, additions: unknown) {
    return this.lock(async()=>{
      const registry=await this.read();const chapter=this.chapter(registry,key);
      const parsed=Chapter.shape.facts.parse(additions);if(!parsed.length)return chapter;
      const next=Chapter.parse({...chapter,revision:chapter.revision+1,facts:[...chapter.facts,...parsed]});
      await this.validateFacts(next);next.sources=await this.snapshot(next);
      Object.assign(chapter,next);this.validateRegistry(registry);
      chapter.dependencyFingerprints=this.dependencyFingerprints(registry,key);
      await this.persist(registry);return chapter;
    });
  }
  async reviewPlan(key: string, factIds?: string[]) {
    const registry=await this.read();
    if(factIds?.some(id=>!this.chapter(registry,key).facts.some(f=>f.id===id)))throw new Error('Unknown initiating fact');
    return {chapterId:key,factIds,policy:'Trace fact dependencies and dependents; fully review the chapters containing those facts. Read source this session and use review_checklist for directory, sibling, child, and referenced documentation. Corrections and explicit maintenance require reasons; unchanged facts need no rewrite.',affectedFacts:this.impact(registry,key,factIds),chapters:await Promise.all(this.related(registry,key,factIds).map(async chapterId=>{const c=this.chapter(registry,chapterId);return {chapterId,title:c.title,revision:c.revision,factCount:c.facts.length,freshness:await this.status(chapterId,registry)};}))};
  }
  resolveTarget(registry: RegistryRecord, target: string) {
    const matches: string[][] = [];
    const pillar = registry.pillars.find(p => p.id === target);
    if (pillar) matches.push(pillar.chapters.map(c => `${pillar.id}/${c.id}`));
    const chapter = this.chapters(registry).find(c => c.key === target);
    if (chapter) matches.push([chapter.key]);
    for (const fact of this.facts(registry)) if (fact.key === target || fact.fact.id === target) matches.push([fact.chapterId]);
    if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous tidy target; use pillar/chapter/fact or pillar/chapter.' : 'Unknown tidy target');
    return matches[0];
  }
  async requestTidy(target: string) {
    return this.lock(async () => {
      const registry = await this.read();
      const roots = this.resolveTarget(registry, target);
      const chapters = [...new Set(roots.flatMap(key => this.related(registry, key)))].sort();
      const tidyId = randomUUID();
      await this.atomic(`local/tidy-${tidyId}.json`, {registryHash:hash(stable(registry)), roots, chapters});
      return {tidyId, instruction:'Developer-requested cleanup only. The calling agent must read and verify source and documentation, then submit prepare_update with this tidyId. No facts have been changed.'};
    });
  }
  async tidyScope(id: string, registry: RegistryRecord): Promise<string[]> {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid tidy ID');
    await this.safe(`.common-ground/local/tidy-${id}.json`);
    const ticket = JSON.parse(await fs.readFile(this.file(`local/tidy-${id}.json`), 'utf8'));
    if (ticket.registryHash !== hash(stable(registry))) throw new Error('Knowledge changed; request a new tidy plan.');
    if (!Array.isArray(ticket.chapters) || !ticket.chapters.length) throw new Error('Invalid tidy scope');
    for (const key of ticket.chapters) this.chapter(registry, key);
    return ticket.chapters;
  }
  async reviewFiles(registry: RegistryRecord, keys: string[], touchedPaths: string[], candidate = registry) {
    for (const file of touchedPaths) relativePath.parse(file);
    const sourceFiles = [...new Set(keys.flatMap(key => [this.chapter(registry,key), this.chapter(candidate,key)]
      .flatMap(c => c.facts.flatMap(f => f.evidence.map(e => e.path)))))].sort();
    const documentFiles = await reviewDocuments(this, [...sourceFiles, ...touchedPaths]);
    return {sourceFiles, documentFiles};
  }
  async fileSnapshots(files: string[]) {
    const snapshots: Record<string,string> = {};
    for (const file of files) {
      relativePath.parse(file);
      if(file.split('/').some(p=>ignored.has(p)||p.startsWith('.env')))throw new Error(`Excluded review path: ${file}`);
      try {
        const safe = await this.safe(file);
        const stat = await fs.stat(safe);
        if (!stat.isFile() || stat.size > 2_000_000) throw new Error(`Review file exceeds beta limits: ${file}`);
        snapshots[file] = hash(await fs.readFile(safe));
      } catch (error: any) { if (error.code !== 'ENOENT') throw error; snapshots[file] = 'missing'; }
    }
    return snapshots;
  }
  async evaluate(input: UpdateRequest, registry: RegistryRecord) {
    const request=Update.parse(input);
    unique(request.reviews.map(r=>r.chapterId),'chapter reviews');
    if(request.factIds?.some(id=>!this.chapter(registry,request.chapterId).facts.some(f=>f.id===id)))throw new Error('Unknown initiating fact');
    const candidate=structuredClone(registry);
    for(const review of request.reviews)this.chapter(candidate,review.chapterId).facts=review.facts;
    this.validateRegistry(candidate);
    const tidyScope=request.tidyId?await this.tidyScope(request.tidyId,registry):[];
    if(request.tidyId&&!tidyScope.includes(request.chapterId))throw new Error('Initiating chapter is outside the tidy scope');
    if(!request.tidyId&&!request.touchedPaths.length)throw new Error('Routine updates need touched paths; developer-requested cleanup needs a tidyId.');
    const maintenanceReviews=request.reviews.filter(r=>r.maintenance?.length);
    const initialScope=new Set([...tidyScope,...this.related(registry,request.chapterId,request.factIds),...this.related(candidate,request.chapterId,request.factIds)]);
    if(maintenanceReviews.some(r=>!initialScope.has(r.chapterId)))throw new Error('Maintenance is outside the affected review scope; request a separate developer-directed tidy.');
    const roots=[...new Set(maintenanceReviews.map(r=>r.chapterId))];
    const required=[...new Set([...tidyScope,...this.related(registry,request.chapterId,request.factIds),...this.related(candidate,request.chapterId,request.factIds),...roots.flatMap(key=>[...this.related(registry,key),...this.related(candidate,key)])])].sort();
    const affected=new Set([...this.impact(registry,request.chapterId,request.factIds),...this.impact(candidate,request.chapterId,request.factIds)]);
    if(!same(required,request.reviews.map(r=>r.chapterId).sort()))throw new Error(`Review every linked chapter: ${required.join(', ')}`);
    const snapshots:Record<string,Record<string,string>>={};
    const changed=new Set<string>();
    for(const review of request.reviews){
      const old=this.chapter(registry,review.chapterId);
      if(old.revision!==review.expectedRevision)throw new Error('Chapter revision conflict; reload.');
      unique(review.reviewedFactIds,'reviewed fact IDs');unique(review.invalidatedFactIds,'invalidated fact IDs');
      unique((review.maintenance??[]).map(m=>m.factId),'maintenance fact IDs');
      if(!same([...review.reviewedFactIds].sort(),old.facts.map(f=>f.id).sort()))throw new Error('Every existing fact must be reviewed.');
      const next=Chapter.parse({...old,facts:review.facts});
      await this.validateFacts(next);snapshots[review.chapterId]=await this.snapshot(next);
      if(!same([...old.facts].sort((a,b)=>a.id.localeCompare(b.id)),[...next.facts].sort((a,b)=>a.id.localeCompare(b.id))))changed.add(review.chapterId);
    }
    for(const review of request.reviews){
      const old=this.chapter(registry,review.chapterId);
      for(const item of review.maintenance??[]) {
        const before=old.facts.find(f=>f.id===item.factId),after=review.facts.find(f=>f.id===item.factId);
        if(!before||same(before,after)||!review.invalidatedFactIds.includes(item.factId))throw new Error('Maintenance must identify an existing changed fact as invalidated.');
        if((item.action==='merge'||item.action==='remove')&&after)throw new Error('Merged or removed facts must be deleted in place.');
        if((item.action==='correct'||item.action==='tighten')&&!after)throw new Error('Corrections must preserve the existing fact ID.');
        if(item.action==='merge') {
          if(!item.replacement||item.replacement===`${review.chapterId}/${item.factId}`)throw new Error('Merge requires a different surviving replacement fact.');
          this.fact(candidate,item.replacement);
        } else if(item.replacement)throw new Error('Only merge maintenance accepts a replacement fact.');
      }
      if(!changed.has(review.chapterId)){if(review.invalidatedFactIds.length)throw new Error('Unchanged facts cannot be marked invalidated');continue;}
      if(request.tidyId&&!tidyScope.includes(review.chapterId))throw new Error('Changed chapter is outside the tidy scope; request a broader tidy plan.');
      if(!review.invalidatedFactIds.length)throw new Error('Changed facts require an invalidation reason.');
      if(review.facts.some(f=>!old.facts.some(o=>o.id===f.id)))throw new Error('New facts require developer-reviewed admission.');
      for(const fact of old.facts)if(!same(fact,review.facts.find(f=>f.id===fact.id))&&!review.invalidatedFactIds.includes(fact.id))throw new Error(`Unrelated fact edit: ${fact.id}`);
      for(const id of review.invalidatedFactIds){
        const fact=old.facts.find(f=>f.id===id);
        if(!fact||same(fact,review.facts.find(f=>f.id===id)))throw new Error(`Invalid invalidated fact: ${id}`);
        const maintenance=review.maintenance?.find(m=>m.factId===id);
        if(maintenance) {
          const anchored=request.touchedPaths.some(p=>required.some(key=>this.chapter(registry,key).paths.some(s=>p===s||p.startsWith(`${s}/`))));
          if(!request.tidyId&&!anchored)throw new Error('Maintenance requires relevant touched paths or a developer-requested tidyId.');
          continue;
        }
        if(request.tidyId)throw new Error('Every tidy edit requires an explicit maintenance action and reason.');
        const direct=fact.evidence.some(e=>request.touchedPaths.includes(e.path)&&old.sources[e.path]!==snapshots[review.chapterId][e.path]);
        if(!affected.has(`${review.chapterId}/${id}`))throw new Error(`Fact is outside the selected dependency review: ${id}`);
        const upstreamChanged=this.upstreamFacts(registry,`${review.chapterId}/${id}`).some(dep=>{
          const entry=this.fact(registry,dep);const depReview=request.reviews.find(r=>r.chapterId===entry.chapterId);
          return depReview?.invalidatedFactIds.includes(entry.fact.id)&&request.touchedPaths.some(p=>entry.fact.sourceScope.some(s=>p===s||p.startsWith(`${s}/`))&&entry.chapter.sources[p]!==snapshots[entry.chapterId][p]);
        });
        if(!direct&&!upstreamChanged)throw new Error(`No directly touched, changed evidence or changed dependency for fact: ${id}`);
      }
    }
    const files=await this.reviewFiles(registry,required,request.touchedPaths,candidate);
    unique(request.verification.sourceFiles,'verified source files');unique(request.verification.documentFiles,'verified documentation files');
    for(const kind of ['sourceFiles','documentFiles'] as const)for(const file of files[kind]) {
      if(!request.verification[kind].includes(file))throw new Error(`Session verification required for ${kind}: ${file}. Read the file (or verify its deletion) before attesting; use review_checklist.`);
    }
    // A declaration is not proof that an external agent read a file; snapshots detect subsequent drift.
    const reviewSnapshots=await this.fileSnapshots([...new Set([...request.verification.sourceFiles,...request.verification.documentFiles])]);
    return {request,required,snapshots,reviewSnapshots,changed:[...changed].sort()};
  }
  async markReviewed(registry: RegistryRecord, keys: string[], snapshots: Record<string,Record<string,string>>) {
    const context=Object.fromEntries(keys.map(key=>[key,{chapterHash:hash(stable(this.chapter(registry,key))),snapshot:snapshots[key]}]));
    for(const key of keys)await this.atomic(`local/review-${key.replace('/','--')}.json`,{context});
  }
  async prepare(input: UpdateRequest) {
    const registry=await this.read();const result=await this.evaluate(input,registry);
    if(!result.changed.length){await this.markReviewed(registry,result.required,result.snapshots);return {noop:true as const};}
    const id=randomUUID();await this.atomic(`local/${id}.json`,{request:result.request,registryHash:hash(stable(registry)),snapshots:result.snapshots,reviewSnapshots:result.reviewSnapshots});
    return {noop:false as const,proposalId:id,changedChapters:result.changed,reviewedChapters:result.required};
  }
  async commit(id: string) {
    if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid proposal ID');
    return this.lock(async()=>{
      await this.safe(`.common-ground/local/${id}.json`);
      const proposal=JSON.parse(await fs.readFile(this.file(`local/${id}.json`),'utf8'));const registry=await this.read();
      if(hash(stable(registry))!==proposal.registryHash)throw new Error('Knowledge changed; prepare a new proposal.');
      const evaluated=await this.evaluate(proposal.request,registry);
      if(!same(evaluated.snapshots,proposal.snapshots))throw new Error('Source changed during review; prepare a new proposal.');
      if(!same(evaluated.reviewSnapshots,proposal.reviewSnapshots))throw new Error('Reviewed source or documentation changed; prepare a new proposal.');
      for(const key of evaluated.changed){const c=this.chapter(registry,key);c.facts=evaluated.request.reviews.find(r=>r.chapterId===key)!.facts;c.revision++;c.sources=evaluated.snapshots[key];}
      for(const key of evaluated.changed)this.chapter(registry,key).dependencyFingerprints=this.dependencyFingerprints(registry,key);
      await this.persist(registry);await this.markReviewed(registry,evaluated.required,evaluated.snapshots);await fs.rm(this.file(`local/${id}.json`));
      return {changedChapters:evaluated.changed,reviewedChapters:evaluated.required};
    });
  }
}
