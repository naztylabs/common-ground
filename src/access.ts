import { createHash } from 'node:crypto';
import { z } from 'zod';
import { relativePath, type RegistryRecord } from './model.js';
import { Store, same } from './store.js';
import { page } from './paging.js';
import { reviewDocuments } from './review-files.js';

const within=(file:string,scope:string)=>file===scope||file.startsWith(`${scope}/`);
const overlaps=(a:string,b:string)=>within(a,b)||within(b,a);
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tracks=(fact:ReturnType<Store['facts']>[number]['fact'],file:string)=>fact.sourceScope.some(s=>within(file,s))||fact.evidence.some(e=>e.path===file);
const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
export const Lookup=z.object({path:relativePath.optional(),query:z.string().trim().min(1).optional(),verify:z.boolean().default(false),cursor:paging.cursor,limit:z.number().int().min(1).max(5).default(5)}).strict();
export const Assess=z.object({paths:z.array(relativePath),review:z.boolean().default(false),...paging}).strict();

async function registryOrSetup(store:Store){
  try{return await store.read();}catch(error:any){if(error.code!=='ENOENT')throw error;return undefined;}
}
const setup={state:'knowledge-unavailable',items:[],next:'Continue from source. Run cground init and review setup when appropriate; lookup requires no task context.'};

/** Explicit verification is fact-scoped. A cache lives for this call only, never across reads/publication. */
async function verifySelected(store:Store,registry:RegistryRecord,selected:string[]){
  const index=new Map(store.facts(registry).map(entry=>[entry.key,entry]));
  const required=[...new Set(selected.flatMap(key=>[key,...store.upstreamFacts(registry,key,index)]))];
  const cache=new Map<string,Promise<string>>();
  const checked=new Map<string,{changedPaths:string[];errors:string[]}>();
  for(const key of required){
    const {chapter,fact}=index.get(key)!;const errors:string[]=[];let changedPaths:string[]=[];
    try{await store.validateFacts({paths:chapter.paths,facts:[fact]});}catch(error:any){errors.push(error.message);}
    try{
      const current=await store.snapshot({paths:chapter.paths,facts:[fact]},cache);
      const baseline=Object.fromEntries(Object.entries(chapter.sources).filter(([file])=>tracks(fact,file)));
      changedPaths=[...new Set([...Object.keys(current),...Object.keys(baseline)])].filter(file=>current[file]!==baseline[file]).sort();
    }catch(error:any){errors.push(error.message);}
    checked.set(key,{changedPaths,errors});
  }
  return new Map(selected.map(key=>{
    const {chapter,chapterId}=index.get(key)!,own=checked.get(key)!;
    const fingerprints=store.dependencyFingerprints(registry,chapterId);
    const dependencyIssues=store.upstreamFacts(registry,key,index).filter(dep=>{
      const check=checked.get(dep)!;return check.errors.length||check.changedPaths.length||chapter.dependencyFingerprints[dep]!==fingerprints[dep];
    });
    return [key,{status:own.errors.length||own.changedPaths.length||dependencyIssues.length?'needs-review':'evidence-unchanged',changedPaths:own.changedPaths.slice(0,10),changedPathCount:own.changedPaths.length,errors:own.errors.slice(0,3),errorCount:own.errors.length,dependencyIssues:dependencyIssues.slice(0,5),dependencyIssueCount:dependencyIssues.length}];
  }));
}

/** Cheap navigation: registry reads only unless live verification is explicitly requested. */
export async function lookup(store:Store,input:unknown){
  const args=Lookup.parse(input);
  if(!args.path&&!args.query)throw new Error('Supply a lookup query or --path.');
  const registry=await registryOrSetup(store);if(!registry)return setup;
  const terms=[...new Set((args.query??'').toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean))];
  const matches=store.facts(registry).map(entry=>{
    const {fact,chapter}=entry;
    const pathScore=!args.path?0:fact.evidence.some(e=>overlaps(args.path!,e.path))?100:fact.sourceScope.some(s=>overlaps(args.path!,s))?50:chapter.paths.some(s=>overlaps(args.path!,s))?1:0;
    const text=`${fact.statement} ${fact.evidence.map(e=>e.path).join(' ')}`.toLocaleLowerCase();
    const score=pathScore+terms.reduce((n,t)=>n+Number(text.includes(t))*3,0);
    return {entry,score,pathScore,matchedTerms:terms.filter(t=>text.includes(t))};
  }).filter(m=>args.path?m.pathScore>0:m.score>0).sort((a,b)=>b.score-a.score||a.entry.key.localeCompare(b.entry.key));
  const records=matches.map(({entry,pathScore,matchedTerms})=>({factId:entry.key,chapterId:entry.chapterId,statement:entry.fact.statement,sourcePaths:[...new Set(entry.fact.evidence.map(e=>e.path))],
    matchReason:pathScore===100?'direct-evidence':pathScore===50?'source-scope':pathScore===1?'ownership-suggestion':'query-terms',
    matchedTerms,unmatchedTerms:terms.filter(t=>!matchedTerms.includes(t)),
    queryCoverage:terms.length?{matched:matchedTerms.length,total:terms.length}:null,
    matchedPaths:args.path?(pathScore===100?entry.fact.evidence.map(e=>e.path):pathScore===50?entry.fact.sourceScope:entry.chapter.paths).filter(p=>overlaps(args.path!,p)):[],
    relevance:pathScore===1?'ownership-only':terms.length&&matchedTerms.length<terms.length?'partial-query':'matched',
  }));
  const selected=page(records,args.cursor,args.limit,digest({registry,path:args.path,query:args.query,verify:args.verify}),6000);
  const verified=args.verify?await verifySelected(store,registry,selected.items.map(item=>item.factId)):undefined;
  if(args.verify&&!same(registry,await store.read()))throw new Error('Knowledge changed during lookup; retry.');
  return {state:records.length?'matches':'no-matches',writesKnowledge:false,...selected,
    coverage:'Lexical and path matches only; neither a match nor its absence establishes topic coverage. Ownership suggestions do not establish what the cited fact says about the requested path.',
    next:records.length?'Use matchReason and matched terms to assess relevance. If these facts do not answer the question, read source rather than repeatedly broadening the query.':'No recorded match. Read source; missing knowledge does not imply missing behavior.',
    items:selected.items.map(item=>({...item,freshness:verified?.get(item.factId)??{status:'not-checked'}})),
    basis:args.verify?'Compares selected facts and upstream sources with stored baselines; ignores local review receipts. Not semantic verification.':'Stored navigation hints; freshness not checked. Open the source before relying on a claim.'};
}

/** Compare only task-touched portions of candidate fact scopes, including additions/deletions. */
export async function changedFacts(store:Store,registry:RegistryRecord,paths:string[]){
  const candidates=store.facts(registry).filter(({fact})=>paths.some(p=>fact.sourceScope.some(s=>overlaps(p,s))||fact.evidence.some(e=>overlaps(p,e.path))));
  const cache=new Map<string,Promise<string>>(),observations:unknown[]=[];
  const changed: {entry:ReturnType<Store['facts']>[number];changedPaths:string[];errors:string[]}[]=[];
  for(const entry of candidates){
    const {fact,chapter}=entry;const errors:string[]=[];let changedPaths:string[]=[];
    const sourceScope=[...new Set(fact.sourceScope.flatMap(scope=>paths.filter(p=>overlaps(p,scope)).map(p=>within(p,scope)?p:scope)))];
    const evidence=fact.evidence.filter(e=>paths.some(p=>overlaps(p,e.path)));
    try{
      const current=await store.snapshot({paths:chapter.paths,facts:[{...fact,sourceScope,evidence}]},cache);
      const baseline=Object.fromEntries(Object.entries(chapter.sources).filter(([file])=>tracks(fact,file)&&paths.some(p=>overlaps(p,file))));
      changedPaths=[...new Set([...Object.keys(current),...Object.keys(baseline)])].filter(p=>current[p]!==baseline[p]).sort();
      observations.push({key:entry.key,current});
    }catch(error:any){errors.push(error.message);observations.push({key:entry.key,errors});}
    if(changedPaths.length||errors.length)changed.push({entry,changedPaths,errors});
  }
  return {candidates,candidateFactCount:candidates.length,changed,fingerprint:digest(observations)};
}

/** Read-only change assessment. Review records are created only by subsequent preparation. */
export async function assessChanges(store:Store,input:unknown){
  const {paths:raw,cursor,limit,review}=Assess.parse(input),paths=[...new Set(raw)].sort();
  const registry=await registryOrSetup(store);if(!registry)return setup;
  const impact=await changedFacts(store,registry,paths);
  const scopes=review?[...new Set(impact.candidates.map(entry=>entry.chapterId))].sort().map(chapterId=>({kind:'review-scope',chapterId,requiredChapterIds:store.related(registry,chapterId)})):[];
  const keys=[...new Set(scopes.flatMap(scope=>scope.requiredChapterIds))].sort();
  // Whole chapters are required only on the branch that might revise knowledge.
  const files=keys.length?await store.reviewFiles(registry,keys,paths):{sourceFiles:[],documentFiles:await reviewDocuments(store,paths,'focused')};
  const entries:object[]=[...impact.changed.map(({entry,changedPaths,errors})=>({kind:'affected-fact',factId:entry.key,statement:entry.fact.statement,sourcePaths:[...new Set(entry.fact.evidence.map(e=>e.path))],changedPaths:changedPaths.slice(0,10),changedPathCount:changedPaths.length,errors})),
    ...scopes,...keys.flatMap(chapterId=>{
      const chapter=store.chapter(registry,chapterId);
      return [{kind:'chapter',chapterId,expectedRevision:chapter.revision,factCount:chapter.facts.length},
        ...chapter.facts.map(fact=>({kind:'fact',chapterId,fact}))];
    }),...files.sourceFiles.map(path=>({kind:'source',path})),...files.documentFiles.map(path=>({kind:'document',path}))];
  if(!same(registry,await store.read()))throw new Error('Knowledge changed during assessment; retry.');
  return {state:keys.length?'review-required':impact.changed.length?'source-review-required':'no-fact-review',writesKnowledge:false,createsTask:false,
    candidateFactCount:impact.candidateFactCount,affectedFactCount:impact.changed.length,
    ...page(entries,cursor,limit,digest({registry,paths,review,observations:impact.fingerprint}),12000),
    next:keys.length?'Read every package page and its source/documentation. Prepare each initiating review-scope with its exact required chapters; do not combine unrelated scopes. prepare-patch accepts no taskId; commit only after verification. Source drift alone does not prove a claim false.':impact.changed.length?'Verify affected claims against source. If a correction is needed, rerun assess with --review for the complete chapter/source package. No task start or finish is needed.':'Review the listed local documentation and source relevant to the edit. No task start or finish is needed. Path matching cannot rule out semantic connections discovered in source.'};
}
