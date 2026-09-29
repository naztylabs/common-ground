import { factReview, type FactChange } from './review.js';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bootstrapNext } from './guidance.js';
import { Store, same } from './store.js';
import { Fact, Maintenance, Verification, Update, chapterKey, relativePath, unique, type RegistryRecord } from './model.js';
import { page } from './paging.js';
import { ownershipMap } from './navigation.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const within = (file: string, scope: string) => file === scope || file.startsWith(`${scope}/`);
const overlaps = (a: string, b: string) => within(a,b) || within(b,a);
const revisionReview = z.object({chapterId:chapterKey, expectedRevision:z.number().int().positive(), reviewedAllFacts:z.literal(true)}).strict();
export const Patch = z.object({
  taskId:z.string().uuid(), chapterId:chapterKey, factIds:Update.shape.factIds,
  touchedPaths:z.array(relativePath), tidyId:z.string().uuid().optional(), verification:Verification,
  reviews:z.array(revisionReview.extend({
    replacements:z.array(Fact).default([]), removeFactIds:z.array(z.string()).default([]),
    reason:z.string().trim().min(12).max(1000), maintenance:z.array(Maintenance).optional(),
  }).strict()).min(1),
}).strict();
export const Admission = z.object({reviews:z.array(revisionReview).min(1), verification:Verification}).strict();
type Draft = {chapterId:string; fact:z.infer<typeof Fact>; fingerprint:string};
type Task = {
  phase:'active'|'awaiting-approval'; paths:string[]; cache:Record<string,string>;
  changes:Record<string,string>; changeDetails?:Record<string,FactChange>; pending:string[]; drafts:Draft[];
};

/** Ignored, task-scoped bookkeeping. No prompt history or model calls; only changed fact records and task metadata. */
export class Workflow {
  constructor(readonly store:Store) {}
  name(id:string) { return `local/task-${z.string().uuid().parse(id)}.json`; }
  async task(id:string):Promise<Task> {
    const name=this.name(id); await this.store.safe(`.common-ground/${name}`);
    return JSON.parse(await fs.readFile(this.store.file(name),'utf8'));
  }
  async save(id:string,task:Task) { await this.store.atomic(this.name(id),task); }
  async reuse(id:string|undefined,key:unknown,value:unknown,context:unknown,refresh=false) {
    if(!id)return value;
    return this.store.lock(async()=>{
      const task=await this.task(id), reference=digest(key).slice(0,16), fingerprint=digest({value,context});
      if(!refresh && task.cache[reference]===fingerprint)return {unchanged:true,reference};
      task.cache[reference]=fingerprint;await this.save(id,task);
      return {...value as object,reference};
    });
  }
  async start(paths:string[]=[],signal?:string) {
    paths=z.array(relativePath).parse(paths);
    // Pending setup is expected after init; never fabricate knowledge or task state.
    let registry:RegistryRecord;
    try { registry=await this.store.read(); }
    catch (e:any) {
      if(e.code!=='ENOENT')throw e;
      try { await this.store.safe('.common-ground/local/bootstrap.json'); }
      catch (setupError:any) {
        if(setupError.code!=='ENOENT')throw setupError;
        return {state:'not-initialized',next:'Run cground init from the repository root, then review its bootstrap proposal with the developer. Continue the main task from source; no task was started, so do not assess, propose facts or finish.'};
      }
      return {state:'bootstrap-required',proposalPath:'.common-ground/local/bootstrap.json',next:bootstrapNext};
    }
    const taskId=randomUUID();
    const owners=this.store.chapters(registry).filter(({chapter})=>paths.some(p=>chapter.paths.some(s=>overlaps(p,s))));
    const matches=paths.length?undefined:await ownershipMap(this.store,{signal,limit:5});
    const routes=matches?{items:matches.items.map(({chapterId,title})=>({chapterId,title})),total:matches.total,nextCursor:matches.nextCursor}:
      page(owners.map(({key,chapter})=>({chapterId:key,title:chapter.title})),undefined,5);
    await this.store.lock(()=>this.save(taskId,{phase:'active',paths:[...new Set(paths)].sort(),cache:{},changes:{},pending:[],drafts:[]}));
    return {taskId,routes:{items:routes.items,total:routes.total,hasMore:routes.nextCursor!==null},next:'Read relevant chapters and source. Use read_knowledge owners for more routes. Finish the developer task first; batch additions at finish.'};
  }
  async assess(id:string,paths:string[],cursor?:string,limit?:number,refresh=false) {
    paths=[...new Set(z.array(relativePath).parse(paths))].sort();
    const registry=await this.store.read();const affected=this.store.facts(registry).filter(({fact})=>paths.some(p=>fact.sourceScope.some(s=>overlaps(p,s))));
    const byChapter=new Map<string,string[]>();
    for(const entry of affected){const ids=byChapter.get(entry.chapterId)??[];ids.push(entry.fact.id);byChapter.set(entry.chapterId,ids);}
    const keys=[...new Set([...byChapter].flatMap(([key,ids])=>this.store.related(registry,key,ids)))].sort();
    const files=await this.store.reviewFiles(registry,keys,paths);
    const entries=[...keys.map(chapterId=>({kind:'chapter',chapterId,revision:this.store.chapter(registry,chapterId).revision})),
      ...files.sourceFiles.map(path=>({kind:'source',path})),...files.documentFiles.map(path=>({kind:'document',path}))];
    await this.store.lock(async()=>{const task=await this.task(id);if(task.phase!=='active')throw new Error('Task is finished; start a new task for more code work.');task.paths=paths;await this.save(id,task);});
    const value={state:keys.length?'review-required':'no-fact-review',affectedFactCount:affected.length,...page(entries,cursor,limit,digest(registry))};
    // Recompute live source and documentation state; unchanged status labels are not fingerprints.
    let context;try{context={registry,chapters:await this.store.context(registry,keys),files:await this.store.fileSnapshots([...files.sourceFiles,...files.documentFiles,...paths])};}
    catch{return value;} // Missing evidence still needs attention; do not reuse a cached result.
    return this.reuse(id,{assess:paths,cursor,limit},value,context,refresh);
  }
  async prepare(input:unknown) {
    const patch=Patch.parse(input), task=await this.task(patch.taskId);
    if(task.phase!=='active')throw new Error('Task is finished; start a new task before maintenance.');
    const registry=await this.store.read();
    const reviews=patch.reviews.map(({reviewedAllFacts,replacements,removeFactIds,...review})=>{
      const old=this.store.chapter(registry,review.chapterId);
      if(old.revision!==review.expectedRevision)throw new Error('Chapter revision conflict; reload.');
      unique([...replacements.map(f=>f.id),...removeFactIds],'patch fact IDs');
      if([...replacements.map(f=>f.id),...removeFactIds].some(id=>!old.facts.some(f=>f.id===id)))throw new Error('Patches only edit existing facts; queue additions with propose_facts.');
      const facts=old.facts.filter(f=>!removeFactIds.includes(f.id)).map(f=>replacements.find(r=>r.id===f.id)??f);
      return {...review,facts,reviewedFactIds:old.facts.map(f=>f.id),invalidatedFactIds:old.facts.filter(f=>!same(f,facts.find(n=>n.id===f.id))).map(f=>f.id)};
    });
    const {taskId,...rest}=patch;
    const result=await this.store.prepare({...rest,reviews});
    if(!result.noop)await this.store.lock(async()=>{
      const current=await this.task(taskId);
      if(current.phase!=='active')throw new Error('Task finished during preparation; prepare in a new task.');
      const file=`local/${result.proposalId}.json`;
      await this.store.safe(`.common-ground/${file}`);
      const proposal=JSON.parse(await fs.readFile(this.store.file(file),'utf8'));
      // Persist pending first. If interrupted, finish reports attention instead of false silence.
      current.pending.push(result.proposalId);await this.save(taskId,current);
      await this.store.atomic(file,{...proposal,taskId});
    });
    return result;
  }
  async draftFingerprint(registry:RegistryRecord,chapterId:string,fact:z.infer<typeof Fact>) {
    const candidate=structuredClone(registry), chapter=this.store.chapter(candidate,chapterId);
    if(chapter.facts.some(f=>f.id===fact.id))throw new Error(`Fact already exists: ${chapterId}/${fact.id}`);
    chapter.facts.push(fact);this.store.validateRegistry(candidate);
    await this.store.validateFacts({paths:chapter.paths,facts:[fact]});
    const dependencies=this.store.upstreamFacts(candidate,`${chapterId}/${fact.id}`);
    const sources=await this.store.snapshot({paths:chapter.paths,facts:[fact]});
    const upstream=[];
    for(const key of dependencies){const dep=this.store.fact(candidate,key);upstream.push({key,fact:dep.fact,sources:await this.store.snapshot({paths:dep.chapter.paths,facts:[dep.fact]})});}
    return digest({chapter:this.store.chapter(registry,chapterId),fact,sources,upstream});
  }
  async propose(id:string,chapterId:string,values:unknown) {
    const facts=z.array(Fact).min(1).parse(values);unique(facts.map(f=>f.id),'proposed fact IDs');
    return this.store.lock(async()=>{
      const task=await this.task(id);
      if(task.phase!=='active')throw new Error('Task is finished. Start a new task to propose or reverify additions.');
      const registry=await this.store.read(),drafts=[...task.drafts];
      for(const fact of facts){
        const draft={chapterId,fact,fingerprint:await this.draftFingerprint(registry,chapterId,fact)};
        const index=drafts.findIndex(d=>d.chapterId===chapterId&&d.fact.id===fact.id);
        if(index<0)drafts.push(draft);else drafts[index]=draft;
      }
      task.drafts=drafts;await this.save(id,task);
      return {queued:facts.length,total:task.drafts.length,sharedKnowledgeChanged:false};
    });
  }
  async draftStates(task:Task,registry:RegistryRecord) {
    const states=[];
    for(const draft of task.drafts){let stale=false;
      try{stale=draft.fingerprint!==await this.draftFingerprint(registry,draft.chapterId,draft.fact);}catch{stale=true;}
      states.push({kind:'new-fact',factId:`${draft.chapterId}/${draft.fact.id}`,statement:draft.fact.statement,evidencePaths:[...new Set(draft.fact.evidence.map(e=>e.path))],stale,recommendation:stale?'reverify':'present-for-approval'});
    }return states;
  }
  async finish(id:string,cursor?:string,limit?:number) {
    return this.store.lock(async()=>{
      const task=await this.task(id),registry=await this.store.read();
      const additions=await this.draftStates(task,registry);
      task.phase='awaiting-approval';await this.save(id,task);
      const changes=[];
      const states=new Map<string,string>();
      for(const [factId,statement] of Object.entries(task.changes)) {
        let current=null;try{current=this.store.fact(registry,factId).fact;}catch{}
        const detail=task.changeDetails?.[factId];
        const changedSinceUpdate=detail?!same(current,detail.after):(current?.statement??'(removed)')!==statement;
        const delta=detail?factReview(detail.before,detail.after):undefined;
        if(detail&&!delta&&!changedSinceUpdate)continue; // A correction reverted in this task has no net change.
        let evidenceValid=false;
        if(detail)try {
          const key=factId.slice(0,factId.lastIndexOf('/'));
          await this.store.validateFacts({paths:this.store.chapter(registry,key).paths,facts:current?[current]:[]});
          if(!states.has(key))states.set(key,(await this.store.status(key,registry)).status);
          evidenceValid=current===null&&detail.after===null||states.get(key)==='evidence-unchanged';
        }catch{}
        changes.push({kind:'updated-fact',factId,...(!delta||!delta.fields.statement?{statement}:{}),...(delta??{}),
          reason:detail?.reason??'Older task receipt has no before/after detail; use cground review.',
          changedSinceUpdate,evidenceStatus:evidenceValid?'mechanically-current':'needs-review',
          recommendation:changedSinceUpdate||!evidenceValid?'reverify':'keep-verified-correction',approvalRequired:false});
      }
      const entries=[...changes,...additions,
        ...task.pending.map(proposalId=>({kind:'uncommitted-review',proposalId}))];
      const attention=task.pending.length||additions.some(a=>a.stale)||changes.some(c=>c.recommendation==='reverify');
      const reviewPrompt=attention
        ? 'Resolve pending reviews or changed evidence before sharing these facts with the team.'
        : additions.length
          ? 'Ready to make the following facts available to the team? Review the proposed facts and evidence before approving admission.'
          : 'Summarize applied corrections: before → after, reason, source links, and your recommendation. The developer does not need to open or edit JSON.';
      return {notification:attention?'attention':additions.length?'approval-required':entries.length?'summary':'none',
        ...page(entries,cursor,limit,'',12000),...(entries.length?{reviewPrompt,reviewFormat:'Present changed items only, grouped by pillar/chapter. Include before → after, why, source links, and keep/approve/reverify recommendation. Corrections are applied; additions still await explicit approval. Mechanical checks do not prove semantic truth; state uncertainty.'}:{})};
    });
  }
  async proposals(id:string,cursor?:string,limit?:number) {
    const task=await this.task(id);return page(task.drafts.map(({fingerprint,...draft})=>draft),cursor,limit,'',12000);
  }
  async drop(id:string,keys:string[]) {
    if(!keys.length)throw new Error('Supply fully qualified fact IDs to discard.');
    return this.store.lock(async()=>{
      const task=await this.task(id);
      if(keys.some(key=>!task.drafts.some(d=>`${d.chapterId}/${d.fact.id}`===key)))throw new Error('Unknown queued fact.');
      task.drafts=task.drafts.filter(d=>!keys.includes(`${d.chapterId}/${d.fact.id}`));await this.save(id,task);
      return {remaining:task.drafts.length,sharedKnowledgeChanged:false};
    });
  }
  async admissionPlan(id:string) {
    const task=await this.task(id),registry=await this.store.read(),candidate=structuredClone(registry);
    if(task.phase!=='awaiting-approval')throw new Error('Finish the developer task before admitting new facts.');
    if(!task.drafts.length)throw new Error('No queued facts.');
    if((await this.draftStates(task,registry)).some(d=>d.stale))throw new Error('Queued evidence or knowledge changed; reverify and propose in a new task.');
    for(const d of task.drafts)this.store.chapter(candidate,d.chapterId).facts.push(d.fact);
    this.store.validateRegistry(candidate);
    const keys=[...new Set(task.drafts.flatMap(d=>this.store.related(candidate,d.chapterId)))].sort();
    return {task,registry,candidate,keys};
  }
  async proposalReview(id:string,cursor?:string,limit?:number) {
    const {task,registry,candidate,keys}=await this.admissionPlan(id);
    const files=await this.store.reviewFiles(registry,keys,task.paths,candidate);
    return page([...keys.map(chapterId=>({kind:'chapter',chapterId,expectedRevision:this.store.chapter(registry,chapterId).revision})),
      ...files.sourceFiles.map(path=>({kind:'source',path})),...files.documentFiles.map(path=>({kind:'document',path}))],cursor,limit,digest({candidate,files}));
  }
  async accept(id:string,input:unknown) {
    const review=Admission.parse(input);
    return this.store.lock(async()=>{
      const {task,registry,candidate,keys}=await this.admissionPlan(id);
      if(task.pending.length)throw new Error('Resolve uncommitted maintenance before admitting new facts.');
      unique(review.reviews.map(r=>r.chapterId),'chapter reviews');
      if(!same(keys,review.reviews.map(r=>r.chapterId).sort()))throw new Error(`Review every linked chapter: ${keys.join(', ')}`);
      for(const item of review.reviews)if(this.store.chapter(registry,item.chapterId).revision!==item.expectedRevision)throw new Error('Chapter revision conflict; reload.');
      const files=await this.store.reviewFiles(registry,keys,task.paths,candidate);
      for(const kind of ['sourceFiles','documentFiles'] as const){unique(review.verification[kind],'verified files');for(const file of files[kind])if(!review.verification[kind].includes(file))throw new Error(`Session verification required for ${kind}: ${file}`);}
      const snapshots:Record<string,Record<string,string>>={};
      for(const key of keys){const chapter=this.store.chapter(candidate,key);await this.store.validateFacts(chapter);snapshots[key]=await this.store.snapshot(chapter);}
      await this.store.fileSnapshots([...review.verification.sourceFiles,...review.verification.documentFiles]);
      const changed=[...new Set(task.drafts.map(d=>d.chapterId))];
      for(const key of changed){const c=this.store.chapter(candidate,key);c.revision++;c.sources=snapshots[key];c.dependencyFingerprints=this.store.dependencyFingerprints(candidate,key);}
      if(!same(await this.store.read(),registry)||(await this.draftStates(task,registry)).some(d=>d.stale))throw new Error('Source or knowledge changed during admission; reverify.');
      // Validate the entire batch before the one shared registry write.
      await this.store.persist(candidate);
      const admitted=task.drafts.length;task.drafts=[];await this.save(id,task);
      await this.store.markReviewed(candidate,keys,snapshots);
      return {admitted,changedChapters:changed};
    });
  }
}
