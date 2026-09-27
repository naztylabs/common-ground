import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Registry, PillarDefinition, Update, unique, type RegistryRecord, type PillarRecord, type Definition, type UpdateRequest } from './model.js';
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
  async read(): Promise<RegistryRecord> {
    await this.safe('.common-ground/knowledge.json');
    const registry = Registry.parse(JSON.parse(await fs.readFile(this.file('knowledge.json'), 'utf8')));
    unique(registry.pillars.map(p => p.id), 'pillar IDs');
    for (const p of registry.pillars) unique(p.facts.map(f => f.id), 'fact IDs');
    return registry;
  }
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
  async snapshot(pillar: Pick<PillarRecord, 'paths' | 'facts'>) {
    const scan = await this.walk(pillar.paths, 10000);
    if (scan.truncated) throw new Error('Pillar scope exceeds beta scan limit (10,000 entries); narrow its scope.');
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
  async validateFacts(pillar: Pick<PillarRecord,'paths'|'facts'>) {
    unique(pillar.facts.map(f => f.id), 'fact IDs');
    for (const fact of pillar.facts) for (const evidence of fact.evidence) {
      if (!pillar.paths.some(p => evidence.path === p || evidence.path.startsWith(`${p}/`))) throw new Error(`Evidence outside pillar scope: ${evidence.path}`);
      const file = await this.safe(evidence.path);
      if ((await fs.stat(file)).size > 2_000_000) throw new Error('Evidence file too large');
      if (!(await fs.readFile(file, 'utf8')).includes(evidence.quote)) throw new Error(`Evidence quote not found: ${fact.id} in ${evidence.path}`);
    }
  }
  async status(pillar: PillarRecord) {
    try {
      const current = await this.snapshot(pillar);
      const changed = [...new Set([...Object.keys(current), ...Object.keys(pillar.sources)])].filter(p => current[p] !== pillar.sources[p]);
      let locallyReviewed = false;
      try { await this.safe(`.common-ground/local/review-${pillar.id}.json`); const review = JSON.parse(await fs.readFile(this.file(`local/review-${pillar.id}.json`),'utf8')); locallyReviewed = review.pillarHash === hash(stable(pillar)) && same(review.snapshot,current); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
      return { id: pillar.id, revision: pillar.revision, status: !pillar.facts.length ? 'unpopulated' : changed.length && !locallyReviewed ? 'needs-review' : 'evidence-unchanged', locallyReviewed, changedPaths: changed };
    } catch (e: any) { return { id: pillar.id, revision: pillar.revision, status: 'needs-review', error: e.message }; }
  }
  async approveDefinitions(definitions: Definition[], standaloneReason?: string) {
    return this.lock(async () => {
      let registry: RegistryRecord; try { registry = await this.read(); } catch (e: any) { if (e.code !== 'ENOENT') throw e; registry = { schemaVersion: 1, pillars: [] }; }
      if (registry.pillars.length && !standaloneReason?.trim()) throw new Error('New pillars require developer approval and an uncovered standalone responsibility explanation.');
      const defs = definitions.map(d => PillarDefinition.parse(d));
      unique([...registry.pillars, ...defs].map(p => p.id), 'pillar IDs');
      const all = [...registry.pillars, ...defs];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        if (all[i].paths.some(a => all[j].paths.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)))) throw new Error(`Overlapping ownership: ${all[i].id} and ${all[j].id}`);
      }
      for (const def of defs) { for (const p of def.paths) await this.safe(p); registry.pillars.push({ ...def, revision: 1, facts: [], sources: {} }); }
      await this.atomic('knowledge.json', registry); return registry;
    });
  }
  async seed(id: string, facts: unknown) {
    return this.lock(async () => {
      const registry = await this.read(); const pillar = registry.pillars.find(p => p.id === id);
      if (!pillar || pillar.facts.length) throw new Error('Seed is only for an approved, empty pillar.');
      const next = Registry.shape.pillars.element.parse({ ...pillar, facts });
      await this.validateFacts(next); next.sources = await this.snapshot(next);
      registry.pillars[registry.pillars.indexOf(pillar)] = next;
      await this.atomic('knowledge.json', registry); return next;
    });
  }
  async admit(id: string, additions: unknown) {
    return this.lock(async () => {
      const registry = await this.read(); const pillar = registry.pillars.find(p=>p.id===id);
      if (!pillar) throw new Error('Unknown pillar');
      const parsed = Registry.shape.pillars.element.shape.facts.parse(additions);
      if (!parsed.length) return pillar;
      const next = { ...pillar, revision: pillar.revision + 1, facts: [...pillar.facts, ...parsed] };
      await this.validateFacts(next); next.sources = await this.snapshot(next);
      registry.pillars[registry.pillars.indexOf(pillar)] = next;
      await this.atomic('knowledge.json',registry); return next;
    });
  }
  async prepare(input: UpdateRequest) {
    const request = Update.parse(input);
    const registry = await this.read(); const pillar = registry.pillars.find(p => p.id === request.pillarId);
    if (!pillar || pillar.revision !== request.expectedRevision) throw new Error('Pillar missing or revision conflict; reload before updating.');
    unique(request.reviewedFactIds, 'reviewed fact IDs');
    if (!same([...request.reviewedFactIds].sort(), pillar.facts.map(f => f.id).sort())) throw new Error('Every existing fact must be reviewed.');
    if (same([...request.facts].sort((a,b)=>a.id.localeCompare(b.id)), [...pillar.facts].sort((a,b)=>a.id.localeCompare(b.id)))) {
      await this.validateFacts(pillar);
      const snapshot = await this.snapshot(pillar);
      await this.atomic(`local/review-${pillar.id}.json`, { pillarHash: hash(stable(pillar)), snapshot });
      return { noop: true as const };
    }
    if (!request.invalidatedFactIds.length) throw new Error('Changed facts require an invalidation reason.');
    const next = { ...pillar, facts: request.facts };
    await this.validateFacts(next);
    const snapshot = await this.snapshot(next);
    const changed = (p: string) => pillar.sources[p] !== snapshot[p];
    for (const id of request.invalidatedFactIds) {
      const old = pillar.facts.find(f => f.id === id);
      if (!old) throw new Error(`Unknown invalidated fact: ${id}`);
      if (same(old, request.facts.find(f => f.id === id))) throw new Error(`Invalidated fact was not changed: ${id}`);
      if (!old.evidence.some(e => request.touchedPaths.includes(e.path) && changed(e.path))) throw new Error(`No directly touched, changed evidence for invalidated fact: ${id}`);
    }
    for (const old of pillar.facts) if (!same(old, request.facts.find(f => f.id === old.id)) && !request.invalidatedFactIds.includes(old.id)) throw new Error(`Unrelated fact edit: ${old.id}`);
    if (request.facts.some(f => !pillar.facts.some(old => old.id === f.id))) throw new Error('New facts require developer-reviewed bootstrap/admission; routine updates cannot grow knowledge.');
    const id = randomUUID();
    await this.atomic(`local/${id}.json`, { request, registryHash: hash(stable(registry)), snapshot });
    return { noop: false as const, proposalId: id, changes: request.invalidatedFactIds, warning: 'Evidence quotes and source changes are checked; semantic truth and whole-pillar review remain agent/developer responsibilities.' };
  }
  async commit(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid proposal ID');
    return this.lock(async () => {
      await this.safe(`.common-ground/local/${id}.json`);
      const proposal = JSON.parse(await fs.readFile(this.file(`local/${id}.json`), 'utf8'));
      const request = Update.parse(proposal.request); const registry = await this.read();
      if (hash(stable(registry)) !== proposal.registryHash) throw new Error('Knowledge changed; prepare a new proposal.');
      const pillar = registry.pillars.find(p => p.id === request.pillarId)!;
      const next = { ...pillar, facts: request.facts, revision: pillar.revision + 1 };
      await this.validateFacts(next);
      const snapshot = await this.snapshot(next);
      if (!same(snapshot, proposal.snapshot)) throw new Error('Source changed during review; prepare a new proposal.');
      next.sources = snapshot; registry.pillars[registry.pillars.indexOf(pillar)] = next;
      await this.atomic('knowledge.json', registry); await fs.rm(this.file(`local/${id}.json`)); return next;
    });
  }
}
