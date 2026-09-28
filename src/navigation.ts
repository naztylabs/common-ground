import type { Store } from './store.js';
import { relativePath } from './model.js';
import { page } from './paging.js';

const words = (text: string) => [...new Set(text.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean))];
const contains = (scope: string, file: string) => scope === file || file.startsWith(`${scope}/`);
export interface RouteOptions { path?: string; signal?: string; cursor?: string; limit?: number }

export async function ownershipMap(store: Store, options: RouteOptions = {}) {
  if (options.path) relativePath.parse(options.path);
  const registry = await store.read();
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
    items: await Promise.all(result.items.map(async item => ({...item, freshness: await store.status(item.chapterId, registry)})))};
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
    steps: [
      'Read the modified directory README and applicable ancestor guidance. Derive branch, submodule checkout, and other point-in-time state live.',
      'Use the failing command or error path to select ownership; signal matches are navigation hints, not a diagnosis.',
      'List the owning pillar chapters, read the relevant chapter pages, then fetch facts and open their source files in this session.',
      'Inspect pillar_graph and fact dependencies when build or deployment crosses subsystem boundaries.',
      'Before changing notes, request review_plan and review_checklist. Verify all facts in each required chapter and relevant sibling, child, and referenced documentation.',
      'Correct contradictions in the same edit. If no fact changes, still verify the modified directory README. Ask when uncertain; do not cache the debugging narrative.',
    ], routes,
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
  }), cursor, limit);
  return {target, writesKnowledge: false, agentActionRequired: true,
    policy: 'Skim every fact page in each required chapter. Read source now, merge verified near duplicates, remove superseded content, tighten narrative, correct in place, and repair references atomically. Similar wording is only a hint. If verification is ambiguous, ask; do not guess.',
    next: 'Use review_checklist for these chapter IDs and touched paths. A developer-requested cground tidy TARGET issues a local tidyId for prepare_update; the MCP tidy_plan only previews scope.',
    requiredChapterCount: required.length, chapters};
}
