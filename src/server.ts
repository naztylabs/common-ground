import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './store.js';
import { Update, chapterKey, relativePath } from './model.js';
import { page } from './paging.js';
export { page } from './paging.js';
import { ownershipMap, pillarGraph, startHere, tidyPlan } from './navigation.js';
import { version } from './version.js';
const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data,null,2) }] });
export async function listPillars(store:Store,cursor?:string,limit?:number){return page((await store.read()).pillars.map(({id,title,scope,excludes,chapters})=>({id,title,scope,excludes,chapterCount:chapters.length})),cursor,limit);}
export async function listChapters(store:Store,pillarId:string,cursor?:string,limit?:number){
  const reg=await store.read();const p=reg.pillars.find(p=>p.id===pillarId);if(!p)throw new Error('Unknown pillar');
  return {pillarId,...page(p.chapters.map(c=>({chapterId:`${p.id}/${c.id}`,title:c.title,scope:c.scope,excludes:c.excludes,revision:c.revision,factCount:c.facts.length})),cursor,limit)};
}
export async function readChapter(store:Store,key:string,cursor?:string,limit?:number){
  const reg=await store.read();const c=store.chapter(reg,key);
  return {chapterId:key,title:c.title,scope:c.scope,excludes:c.excludes,paths:c.paths,revision:c.revision,freshness:await store.status(key,reg),facts:page(c.facts.map(({id,statement,evidence})=>({id,statement,evidencePaths:[...new Set(evidence.map(e=>e.path))]})),cursor,limit,String(c.revision))};
}
export async function readFact(store:Store,key:string,id:string){const reg=await store.read();const c=store.chapter(reg,key);const fact=c.facts.find(f=>f.id===id);if(!fact)throw new Error('Unknown fact');return {chapterId:key,revision:c.revision,fact,freshness:await store.status(key,reg)};}
export async function search(store:Store,query:string,limit=8,chapterId?:string){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Search limit must be between 1 and 20');
  const terms=query.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const reg=await store.read();if(chapterId)store.chapter(reg,chapterId);
  const matches=store.chapters(reg).filter(e=>!chapterId||e.key===chapterId).flatMap(({key,pillar,chapter})=>chapter.facts.map(f=>({chapterId:key,fact:{id:f.id,statement:f.statement},score:terms.reduce((n,t)=>n+Number(`${f.statement} ${f.evidence.map(e=>e.path).join(' ')}`.toLocaleLowerCase().includes(t))*3+Number(`${pillar.title} ${chapter.title} ${chapter.scope}`.toLocaleLowerCase().includes(t)),0)}))).filter(m=>m.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  const states=new Map();for(const m of matches)if(!states.has(m.chapterId))states.set(m.chapterId,await store.status(m.chapterId,reg));
  return matches.map(m=>({...m,freshness:states.get(m.chapterId)}));
}
export function createServer(store:Store){
  const server=new McpServer({name:'common-ground',version});
  const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
  const register=(name:string,description:string,inputSchema:any,readOnly:boolean,fn:(args:any)=>Promise<unknown>)=>server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:false}},async(args:any)=>{try{return result(await fn(args));}catch(e:any){return {...result({error:e.message}),isError:true};}});
  const routing={path:relativePath.optional(),signal:z.string().trim().min(1).optional(),...paging};
  register('start_here','Start with a failing command, symptom, or source path. Returns an agent workflow and bounded ownership candidates; it does not diagnose bugs.',routing,true,args=>startHere(store,args));
  register('ownership_map','Map registered paths or keyword signals to owning pillars and chapters. Signal matches are hints; verify code.',routing,true,args=>ownershipMap(store,args));
  register('pillar_graph','Read the recorded pillar dependency graph derived from fact references. Direction is dependent to dependency; missing edges are unknown.',{pillarId:z.string().optional(),...paging},true,({pillarId,cursor,limit})=>pillarGraph(store,pillarId,cursor,limit));
  register('tidy_plan','Preview cleanup scope for a pillar, chapter, or fact. No changes or approval are made; the calling agent must verify source and documentation.',{target:z.string().min(1),...paging},true,({target,cursor,limit})=>tidyPlan(store,target,cursor,limit));
  register('review_checklist','List current source and documentation files to open before review, including no-op outcomes. Attest only after reading them this session; deleted files require a live absence check.',{chapterIds:z.array(chapterKey),touchedPaths:z.array(relativePath),...paging},true,({chapterIds,touchedPaths,cursor,limit})=>reviewChecklist(store,chapterIds,touchedPaths,cursor,limit));
  register('list_pillars','List repository responsibility boundaries without loading facts.',paging,true,({cursor,limit})=>listPillars(store,cursor,limit));
  register('list_chapters','Read a pillar chapter index; skim scopes to select the relevant chapter. Returns no facts.',{pillarId:z.string(),...paging},true,({pillarId,cursor,limit})=>listChapters(store,pillarId,cursor,limit));
  register('read_chapter','Read one chapter in bounded fact pages. Follow nextCursor to review every fact before an update. Use read_fact for evidence.',{chapterId:chapterKey,...paging},true,({chapterId,cursor,limit})=>readChapter(store,chapterId,cursor,limit));
  register('read_fact','Fetch the exact evidence for one fact, with chapter freshness.',{chapterId:chapterKey,factId:z.string()},true,({chapterId,factId})=>readFact(store,chapterId,factId));
  register('search_knowledge','Find relevant fact summaries; optional chapter scope. Fetch evidence with read_fact.',{query:z.string().min(1),limit:paging.limit,chapterId:chapterKey.optional()},true,({query,limit,chapterId})=>search(store,query,limit,chapterId));
  register('review_plan','List required chapter reviews, by tracing fact dependencies and dependents. Select factIds to narrow the impact graph. It does not authorize rewriting valid facts.',{chapterId:chapterKey,factIds:Update.shape.factIds},true,({chapterId,factIds})=>store.reviewPlan(chapterId,factIds));
  register('prepare_update','After authorized work: submit complete reviews for the chapter and every linked chapter from review_plan. Correct invalidated facts in place; explicitly reasoned maintenance may merge, remove, or tighten existing facts. Read source and documentation this session and supply verification. Uncertainty requires developer input.',Update.shape,false,args=>store.prepare(args));
  register('commit_update','Atomically publish changed chapters in a prepared review transaction. Rechecks evidence, source snapshots, and registry revision.',{proposalId:z.string()},false,({proposalId})=>store.commit(proposalId));
  return server;
}
export async function serve(store:Store){await createServer(store).connect(new StdioServerTransport());}

export async function reviewChecklist(store:Store,chapterIds:string[],touchedPaths:string[],cursor?:string,limit?:number) {
  const files=await store.reviewFiles(await store.read(),chapterIds,touchedPaths);
  const entries=[...files.sourceFiles.map(path=>({kind:'sourceFiles',path})),...files.documentFiles.map(path=>({kind:'documentFiles',path}))];
  const selected=page(entries,cursor,limit);
  const snapshots=await store.fileSnapshots(selected.items.map(item=>item.path));
  return {policy:'Open each current file in this session. If it is missing, verify deletion live. Skim whole chapters and relevant sibling, child, and reference documentation; follow additional code references manually. This checklist is bounded discovery, not proof of reading.',...selected,items:selected.items.map(item=>({...item,state:snapshots[item.path]==='missing'?'missing':'present'}))};
}
