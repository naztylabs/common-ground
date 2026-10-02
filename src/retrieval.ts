import { z } from 'zod';
import { Store } from './store.js';
import { chapterKey, relativePath, type RegistryRecord } from './model.js';
import { Workflow } from './workflow.js';
import { page } from './paging.js';
import { ownershipMap, pillarGraph, tidyPlan } from './navigation.js';
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
export async function search(store:Store,query:string,limit=8,chapterId?:string,registry?:RegistryRecord,cache?:Map<string,Promise<string>>){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Search limit must be between 1 and 20');
  const terms=query.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const reg=registry??await store.read();if(chapterId)store.chapter(reg,chapterId);
  const matches=store.chapters(reg).filter(e=>!chapterId||e.key===chapterId).flatMap(({key,pillar,chapter})=>chapter.facts.map(f=>({chapterId:key,fact:{id:f.id,statement:f.statement,evidencePaths:[...new Set(f.evidence.map(e=>e.path))]},score:terms.reduce((n,t)=>n+Number(`${f.statement} ${f.evidence.map(e=>e.path).join(' ')}`.toLocaleLowerCase().includes(t))*3+Number(`${pillar.title} ${chapter.title} ${chapter.scope}`.toLocaleLowerCase().includes(t)),0)}))).filter(m=>m.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  const states=new Map();for(const m of matches)if(!states.has(m.chapterId))states.set(m.chapterId,await store.status(m.chapterId,reg,cache));
  return matches.map(m=>({...m,freshness:states.get(m.chapterId)}));
}
const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
export const ReadKnowledge=z.object({
  kind:z.enum(['pillars','chapters','chapter','fact','search','owners','graph','review','checklist','tidy','proposals','proposal-review']),
  target:z.string().optional(),query:z.string().optional(),paths:z.array(relativePath).optional(),
  taskId:z.string().uuid().optional(),refresh:z.boolean().optional(),evidence:z.boolean().optional(),...paging,
}).strict();
const shortStatus=(status:Awaited<ReturnType<Store['status']>>)=>({status:status.status,...(status.error?{error:status.error}:{})});
export async function readKnowledge(store:Store,input:unknown):Promise<unknown> {
  const args=ReadKnowledge.parse(input), {kind,target,query,paths=[],taskId,refresh,cursor,limit}=args;
  const workflow=new Workflow(store), registry=await store.read(),cache=new Map<string,Promise<string>>();let value:any;let keys:string[]=[];
  const required=()=>{if(!target)throw new Error('target is required for this read kind.');return target;};
  switch(kind){
    case 'pillars':value=await listPillars(store,cursor,limit);break;
    case 'chapters':value=await listChapters(store,required(),cursor,limit);break;
    case 'chapter':{
      const key=required(),c=store.chapter(registry,key);keys=[key];
      value={chapterId:key,revision:c.revision,scope:c.scope,excludes:c.excludes,paths:c.paths,freshness:shortStatus(await store.status(key,registry,cache)),
        facts:page(args.evidence?c.facts:c.facts.map(({id,statement})=>({id,statement})),cursor,limit,String(c.revision),12000)};break;
    }
    case 'fact':{const f=store.fact(registry,required());keys=[f.chapterId];value={chapterId:f.chapterId,revision:f.chapter.revision,fact:f.fact,freshness:shortStatus(await store.status(f.chapterId,registry,cache))};break;}
    case 'search':{if(!query)throw new Error('query is required.');const matches=await search(store,query,limit,target,registry,cache);keys=[...new Set(matches.map(m=>m.chapterId))];value={items:matches.map(m=>({...m,freshness:shortStatus(m.freshness)}))};break;}
    case 'owners':{const {basis,...routes}=await ownershipMap(store,{path:paths[0],signal:query,cursor,limit},registry,cache);keys=routes.items.map(r=>r.chapterId);value={...routes,items:routes.items.map(({matchedTerms,paths,score,...r})=>({...r,freshness:shortStatus(r.freshness)}))};break;}
    case 'graph':{const {basis,...graph}=await pillarGraph(store,target,cursor,limit);value=graph;break;}
    case 'review':{
      const key=required();let chapterId=key, factIds:string[]|undefined;
      if(key.split('/').length===3){const f=store.fact(registry,key);chapterId=f.chapterId;factIds=[f.fact.id];}
      keys=store.related(registry,chapterId,factIds);
      value=page(keys.map(chapterId=>({chapterId,revision:store.chapter(registry,chapterId).revision,factCount:store.chapter(registry,chapterId).facts.length})),cursor,limit,JSON.stringify(registry));break;
    }
    case 'checklist':{
      const key=required();keys=key.split('/').length===3?store.related(registry,store.fact(registry,key).chapterId,[store.fact(registry,key).fact.id]):store.resolveTarget(registry,key).flatMap(k=>store.related(registry,k));
      const {policy,...checklist}=await reviewChecklist(store,[...new Set(keys)],paths,cursor,limit);value=checklist;break;
    }
    case 'tidy':{const {policy,next,...plan}=await tidyPlan(store,required(),cursor,limit);value=plan;break;}
    case 'proposals':if(!taskId)throw new Error('taskId required.');return workflow.proposals(taskId,cursor,limit);
    case 'proposal-review':if(!taskId)throw new Error('taskId required.');return workflow.proposalReview(taskId,cursor,limit);
  }
  if(!taskId)return value;
  let context:unknown=registry;
  if(keys.length){try{context=await store.context(registry,[...new Set(keys.flatMap(k=>store.related(registry,k)))],cache);}catch{return value;}}
  if(kind==='checklist')context={context,documents:await store.fileSnapshots((await store.reviewFiles(registry,[...new Set(keys)],paths)).documentFiles)};
  return workflow.reuse(taskId,{kind,target,query,paths,cursor,limit,evidence:args.evidence},value,context,refresh);
}

export async function reviewChecklist(store:Store,chapterIds:string[],touchedPaths:string[],cursor?:string,limit?:number) {
  const files=await store.reviewFiles(await store.read(),chapterIds,touchedPaths);
  const entries=[...files.sourceFiles.map(path=>({kind:'sourceFiles',path})),...files.documentFiles.map(path=>({kind:'documentFiles',path}))];
  const selected=page(entries,cursor,limit);
  const snapshots=await store.fileSnapshots(selected.items.map(item=>item.path));
  return {policy:'Open each current file in this session. If it is missing, verify deletion live. Skim whole chapters and relevant sibling, child, and reference documentation; follow additional code references manually. This checklist is bounded discovery, not proof of reading.',...selected,items:selected.items.map(item=>({...item,state:snapshots[item.path]==='missing'?'missing':'present'}))};
}
