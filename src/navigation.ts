import { same, type Store } from './store.js';
import { relativePath, type RegistryRecord } from './model.js';
import { page } from './paging.js';

const words = (text: string) => [...new Set(text.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean))];
const contains = (scope: string, file: string) => scope === file || file.startsWith(`${scope}/`);
export interface RouteOptions { path?: string; signal?: string; cursor?: string; limit?: number }

export async function ownershipMap(store: Store, options: RouteOptions = {}, suppliedRegistry?:RegistryRecord, cache?:Map<string,Promise<string>>) {
  if (options.path) options={...options,path:relativePath.parse(options.path)};
  const registry = suppliedRegistry??await store.read();
  const terms = words(options.signal ?? '').filter(t => !['a','an','the','is','my','this','what','do','failed','failing'].includes(t));
  const entries = store.chapters(registry).map(({key, pillar, chapter}) => {
    const paths = options.path ? chapter.paths.filter(p => contains(p, options.path!)) : chapter.paths;
    const boundary = words(`${pillar.title} ${pillar.scope} ${chapter.title} ${chapter.scope} ${chapter.paths.join(' ')}`);
    const matchingFacts = chapter.facts.map(f => {
      const tokens = words(`${f.statement} ${f.evidence.map(e => `${e.path} ${e.quote}`).join(' ')}`);
      return {factId: f.id, terms: terms.filter(t => tokens.includes(t))};
    }).filter(f => f.terms.length);
    const boundaryTerms = terms.filter(t => boundary.includes(t));
    const matchedTerms = [...new Set([...boundaryTerms, ...matchingFacts.flatMap(f => f.terms)])];
    return {pillarId: pillar.id, chapterId: key, title: chapter.title, scope: chapter.scope,
      paths, match: paths.length && options.path ? 'registered-path' : terms.length ? 'keyword-hint' : 'index',
      score: (options.path && paths.length ? 1000 : 0) + matchedTerms.length,
      matchedTerms, matchingFactCount: matchingFacts.length,
      factHints: matchingFacts.slice(0, 3).map(f => `${key}/${f.factId}`), revision: chapter.revision};
  }).filter(entry => options.path ? entry.paths.length > 0 : options.signal ? entry.matchedTerms.length > 0 : true)
    .sort((a,b) => b.score - a.score || a.chapterId.localeCompare(b.chapterId));
  const result = page(entries, options.cursor, options.limit, JSON.stringify(options.path ?? '') + (options.signal ?? ''));
  return {basis: 'Registered chapter paths define ownership. Signal matches are keyword hints from boundaries, facts, and evidence; verify source before diagnosing.',
    ambiguous: entries.length > 1, ...result,
    items: await Promise.all(result.items.map(async item => ({...item, freshness: await store.status(item.chapterId, registry,cache)})))};
}

export async function pillarGraph(store: Store, pillarId?: string, cursor?: string, limit?: number) {
  const registry = await store.read();
  if (pillarId && !registry.pillars.some(p => p.id === pillarId)) throw new Error('Unknown pillar');
  const edges = new Map<string, {from: string; to: string; factLinkCount: number; examples: {from: string; to: string}[]; chapters: Set<string>}>();
  for (const entry of store.facts(registry)) for (const dependency of entry.fact.dependsOn) {
    const from = entry.key.split('/')[0], to = dependency.split('/')[0];
    if (from === to || (pillarId && from !== pillarId && to !== pillarId)) continue;
    const key = `${from}/${to}`;
    const edge = edges.get(key) ?? {from, to, factLinkCount: 0, examples: [], chapters: new Set<string>()};
    edge.factLinkCount++;
    if (edge.examples.length < 3) edge.examples.push({from: entry.key, to: dependency});
    edge.chapters.add(entry.chapterId); edge.chapters.add(dependency.slice(0, dependency.lastIndexOf('/')));
    edges.set(key, edge);
  }
  const selected = page([...edges.values()].sort((a,b) => `${a.from}/${a.to}`.localeCompare(`${b.from}/${b.to}`))
    .map(({chapters, ...edge}) => ({...edge, chapterIds: [...chapters].sort()})), cursor, limit);
  const states = new Map<string, Awaited<ReturnType<Store['status']>>>();
  for (const edge of selected.items) for (const key of edge.chapterIds) if (!states.has(key)) states.set(key, await store.status(key, registry));
  return {direction: 'dependent pillar -> dependency pillar',
    basis: 'Derived from recorded cross-pillar fact dependencies. Missing edges mean unrecorded relationships, not proven independence. Cycles are allowed.',
    ...selected, items: selected.items.map(({chapterIds, ...edge}) => ({...edge,
      freshness: chapterIds.some(k => states.get(k)!.status !== 'evidence-unchanged') ? 'needs-review' : 'evidence-unchanged'}))};
}

export async function startHere(store: Store, options: RouteOptions = {}) {
  let routes;
  try { routes = await ownershipMap(store, options); }
  catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    return {guide:'.common-ground/START_HERE.md',state:'awaiting-bootstrap',
      principle:'Code is the source of truth. Common Ground is a cache that supplements source reading.',
      next:'Run cground init if needed, read directory READMEs and source, then refine the local bootstrap proposal with the developer before approving boundaries and seeding verified facts.'};
  }
  return {guide: '.common-ground/START_HERE.md',
    principle: 'Code is the source of truth. Common Ground is a cache that supplements source reading.',
    policy:'.common-ground/POLICY.md', routes,
    next: routes.total === 0 ? 'No recorded owner matched. Inspect directory READMEs and code; ask the developer about ownership. Do not invent a pillar or diagnosis.'
      : routes.ambiguous ? 'Multiple candidates matched. Narrow with a repository-relative path and read their scopes before choosing.'
        : 'Call list_chapters for the matched pillar, then read_chapter and read_fact; verify their source.'};
}

export async function tidyPlan(store: Store, target: string, cursor?: string, limit?: number) {
  const registry = await store.read();
  const keys = store.resolveTarget(registry, target);
  const required = [...new Set(keys.flatMap(key => store.related(registry, key)))].sort();
  const chapters = page(required.map(key => {
    const c = store.chapter(registry, key);
    const groups = new Map<string, string[]>();
    for (const f of c.facts) {
      const normalized = words(f.statement).sort().join(' ');
      groups.set(normalized, [...(groups.get(normalized) ?? []), f.id]);
    }
    const duplicates = [...groups.values()].filter(ids => ids.length > 1);
    return {chapterId: key, revision: c.revision, factCount: c.facts.length,
      duplicateGroupCount: duplicates.length, duplicateHints: duplicates.slice(0, 3).map(ids => ids.slice(0, 5))};
  }), cursor, limit, JSON.stringify(registry));
  return {target, writesKnowledge: false, agentActionRequired: true,
    policy: 'Skim every fact page in each required chapter. Read source now, merge verified near duplicates, remove superseded content, tighten narrative, correct in place, and repair references atomically. Similar wording is only a hint. If verification is ambiguous, ask; do not guess.',
    next: 'Use review_checklist for these chapter IDs and touched paths. A developer-requested cground tidy TARGET or MCP cground operation tidy issues a local tidyId for prepare_update or prepare_patch; tidy_plan itself only previews scope.',
    requiredChapterCount: required.length, chapters};
}


/** Read-only mechanical validation. Evidence presence never proves semantic truth. */
export async function validateKnowledge(store: Store, target = 'all', cursor?: string, limit?: number, allResults=true) {
  const registry = await store.read(); // Schema, ownership and dependency references are checked globally.
  const chapters = store.resolveTarget(registry, target);
  const allFacts = store.facts(registry), index = new Map(allFacts.map(f => [f.key, f]));
  const factTarget = target === 'all' ? undefined : allFacts.find(f => f.key === target || f.fact.id === target);
  const selected = factTarget ? [factTarget] : allFacts.filter(f => chapters.includes(f.chapterId));
  const required = [...new Set(selected.flatMap(f => [f.key, ...store.upstreamFacts(registry, f.key, index)]))];
  const checked = new Map<string, {changedPaths:string[]; errors:string[]}>();
  const states = new Map<string, Awaited<ReturnType<Store['status']>>>();
  const fingerprints = new Map<string, Record<string,string>>();
  for (const key of required) {
    const {chapterId,chapter,fact} = index.get(key)!;
    const errors: string[] = [];
    try { await store.validateFacts({paths:chapter.paths,facts:[fact]}); }
    catch (e: any) { errors.push(e.message); }
    let changedPaths: string[] = [];
    try {
      const current = await store.snapshot({paths:chapter.paths,facts:[fact]});
      const baseline = Object.fromEntries(Object.entries(chapter.sources).filter(([file]) => fact.sourceScope.some(scope => contains(scope,file)) || fact.evidence.some(e=>e.path===file)));
      changedPaths = [...new Set([...Object.keys(current),...Object.keys(baseline)])].filter(file => current[file] !== baseline[file]).sort();
    } catch (e: any) { if (!errors.includes(e.message)) errors.push(e.message); }
    checked.set(key,{changedPaths,errors});
    if (!states.has(chapterId)) {
      states.set(chapterId,await store.status(chapterId,registry));
      fingerprints.set(chapterId,store.dependencyFingerprints(registry,chapterId));
    }
  }
  const items = selected.map(({key,chapterId,chapter}) => {
    const own = checked.get(key)!;
    const dependencies = store.upstreamFacts(registry,key,index);
    const dependencyIssues = dependencies.filter(dep => {
      const state = checked.get(dep)!;
      return state.errors.length || state.changedPaths.length || chapter.dependencyFingerprints[dep] !== fingerprints.get(chapterId)![dep];
    }).map(factId => ({factId,...checked.get(factId)!,recordChanged:chapter.dependencyFingerprints[factId] !== fingerprints.get(chapterId)![factId]}));
    const locallyReviewed = states.get(chapterId)!.locallyReviewed === true;
    const invalidEvidence = own.errors.length > 0 || dependencyIssues.some(d => d.errors.length > 0);
    const drift = own.changedPaths.length > 0 || dependencyIssues.length > 0;
    return {factId:key,chapterId,status:invalidEvidence || (drift && !locallyReviewed) ? 'needs-review' : 'evidence-unchanged',
      ...own,dependencyIssues,locallyReviewed};
  });
  const unpopulatedChapters = chapters.filter(key => !store.chapter(registry,key).facts.length);
  const stale = items.filter(item => item.status === 'needs-review');
  const affected = {pillars:[...new Set(stale.map(item=>item.chapterId.split('/')[0]))].sort(), chapters:[...new Set(stale.map(item=>item.chapterId))].sort(), facts:stale.map(item=>item.factId).sort()};
  const needsReview = items.filter(item => item.status === 'needs-review').length;
  // Do not return success for a registry that changed during a potentially long scan.
  if (!same(registry,await store.read())) throw new Error('Knowledge changed during validation; rerun validate.');
  return {target,writesKnowledge:false,valid:items.length > 0 && needsReview === 0 && unpopulatedChapters.length === 0,
    basis:'Checks registry structure, exact evidence, source scopes and upstream dependencies. This does not prove the assertions are true.',
    affected,
    cleanupPrompt:needsReview ? "Start automatic cleanup?" : null,
    summary:{selectedFacts:items.length,checkedFacts:required.length,needsReview,unpopulatedChapters},
    ...page(allResults?items:stale,cursor,limit,JSON.stringify({target,registry,allResults}),12000)};
}
