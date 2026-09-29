import { operations, runOperation } from './operations.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { ReadKnowledge, readKnowledge, listPillars, listChapters, readChapter, readFact, search, reviewChecklist } from './retrieval.js';
export { ReadKnowledge, readKnowledge, listPillars, listChapters, readChapter, readFact, search, reviewChecklist } from './retrieval.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './store.js';
import { Update, Fact, chapterKey, relativePath } from './model.js';
import { Workflow, Patch } from './workflow.js';
import { page } from './paging.js';
export { page } from './paging.js';
import { ownershipMap, pillarGraph, startHere, tidyPlan } from './navigation.js';
import { version } from './version.js';
const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
export function createFullServer(store:Store){
  const server=new McpServer({name:'common-ground',version});
  const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
  const register=(name:string,description:string,inputSchema:any,readOnly:boolean,fn:(args:any)=>Promise<unknown>)=>server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:name==='commit_update',openWorldHint:false}},async(args:any)=>{try{return result(await fn(args));}catch(e:any){return {...result({error:e.message}),isError:true};}});
  const routing={path:relativePath.optional(),signal:z.string().trim().min(1).optional(),...paging};
  register('start_here','Start with a failing command, symptom, or source path. Returns an agent workflow and bounded ownership candidates; it does not diagnose bugs.',routing,true,args=>startHere(store,args));
  register('ownership_map','Map registered paths or keyword signals to owning pillars and chapters. Signal matches are hints; verify code.',routing,true,args=>ownershipMap(store,args));
  register('pillar_graph','Read the recorded pillar dependency graph derived from fact references. Direction is dependent to dependency; missing edges are unknown.',{pillarId:z.string().optional(),...paging},true,({pillarId,cursor,limit})=>pillarGraph(store,pillarId,cursor,limit));
  register('tidy_plan','Preview cleanup scope for all knowledge, a pillar, chapter, or fact. No changes or approval are made; the calling agent must verify source and documentation.',{target:z.string().min(1),...paging},true,({target,cursor,limit})=>tidyPlan(store,target,cursor,limit));
  register('review_checklist','List current source and documentation files to open before review, including no-op outcomes. Attest only after reading them this session; deleted files require a live absence check.',{chapterIds:z.array(chapterKey),touchedPaths:z.array(relativePath),...paging},true,({chapterIds,touchedPaths,cursor,limit})=>reviewChecklist(store,chapterIds,touchedPaths,cursor,limit));
  register('list_pillars','List repository responsibility boundaries without loading facts.',paging,true,({cursor,limit})=>listPillars(store,cursor,limit));
  register('list_chapters','Read a pillar chapter index; skim scopes to select the relevant chapter. Returns no facts.',{pillarId:z.string(),...paging},true,({pillarId,cursor,limit})=>listChapters(store,pillarId,cursor,limit));
  register('read_chapter','Read one chapter in bounded fact pages. Follow nextCursor to review every fact before an update. Use read_fact for evidence.',{chapterId:chapterKey,...paging},true,({chapterId,cursor,limit})=>readChapter(store,chapterId,cursor,limit));
  register('read_fact','Fetch the exact evidence for one fact, with chapter freshness.',{chapterId:chapterKey,factId:z.string()},true,({chapterId,factId})=>readFact(store,chapterId,factId));
  register('search_knowledge','Find relevant fact summaries; optional chapter scope. Fetch evidence with read_fact.',{query:z.string().min(1),limit:paging.limit,chapterId:chapterKey.optional()},true,({query,limit,chapterId})=>search(store,query,limit,chapterId));
  register('review_plan','List required chapter reviews, by tracing fact dependencies and dependents. Select factIds to narrow the impact graph. It does not authorize rewriting valid facts.',{chapterId:chapterKey,factIds:Update.shape.factIds},true,({chapterId,factIds})=>store.reviewPlan(chapterId,factIds));
  register('prepare_update','After authorized work: submit complete reviews for the chapter and every linked chapter from review_plan. Correct invalidated facts in place; explicitly reasoned maintenance may merge, remove, or tighten existing facts. Read source and documentation this session and supply verification. Uncertainty requires developer input.',Update.shape,false,args=>store.prepare(args));
  register('commit_update','Atomically publish changed chapters in a prepared review transaction. Rechecks evidence, source snapshots, and registry revision.',{proposalId:z.string()},false,({proposalId})=>store.commit(proposalId));
  registerOperations(server,store);
  return server;
}
export async function serve(store:Store,profile='compact'){await createServer(store,profile).connect(new StdioServerTransport());}

export function createServer(store:Store,profile='compact') {
  if(profile==='full')return createFullServer(store);
  if(profile!=='compact')throw new Error('Unknown MCP profile; use compact or full.');
  const server=new McpServer({name:'common-ground',version}), workflow=new Workflow(store);
  const register=(name:string,description:string,inputSchema:any,readOnly:boolean,fn:(args:any)=>Promise<unknown>)=>server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:name==='commit_update',openWorldHint:false}},async(args:any)=>{try{return result(await fn(args));}catch(e:any){return {...result({error:e.message}),isError:true};}});
  register('task_context','Start once per coding task; assess touched paths after edits; finish once for a quiet summary and pending approvals. Without a taskId, follow returned setup guidance and continue from source. Local state only.',{
    action:z.enum(['start','assess','finish']),taskId:z.string().uuid().optional(),paths:z.array(relativePath).optional(),signal:z.string().optional(),refresh:z.boolean().optional(),...paging,
  },false,async({action,taskId,paths,signal,cursor,limit,refresh})=>{
    if(action==='start')return workflow.start(paths,signal);
    if(!taskId)throw new Error('taskId is required.');
    if(action==='finish')return workflow.finish(taskId,cursor,limit);
    if(!paths)throw new Error('Supply actual task-touched paths (including new/deleted files).');
    return workflow.assess(taskId,paths,cursor,limit,refresh);
  });
  register('read_knowledge','Read bounded knowledge. target is a pillar/chapter/fact ID. chapter + evidence:true batches full facts; read every page before editing. refresh:true resends cached context.',ReadKnowledge.shape,false,args=>readKnowledge(store,args));
  register('prepare_patch','Quiet existing-fact maintenance only. Read POLICY.md, all required chapter pages and source first. reviewedAllFacts attests the whole revision. Send only changed records; unchanged records are preserved.',Patch.shape,false,args=>workflow.prepare(args));
  register('commit_update','Write a prepared correction to the Git working tree after rechecking revisions, source and documentation. Report at task completion.',{proposalId:z.string().uuid()},false,({proposalId})=>store.commit(proposalId));
  register('propose_facts','Queue verified new facts locally; no shared write. Batch for developer approval after task_context finish. Dependencies must already be admitted.',{taskId:z.string().uuid(),chapterId:chapterKey,facts:z.array(Fact).min(1)},false,({taskId,chapterId,facts})=>workflow.propose(taskId,chapterId,facts));
  registerOperations(server,store);
  return server;
}


const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
export function registerOperations(server:McpServer,store:Store) {
  const catalog=operations(store);
  server.registerTool('cground',{
    description:'All Common Ground CLI workflows via structured MCP, no shell needed. Call operation:help for a paginated catalog or help with args.operation for its exact input schema. Supports check/validate/tidy, onboarding, approved admission, task workflows, hooks and export. Host approval settings apply. approved:true declares actual developer approval, never grants it. Cleanup verifies existing facts only; the calling agent reads source and submits reviewed corrections.',
    inputSchema:{operation:z.enum(['help',...Object.keys(catalog)] as [string,...string[]]),args:z.record(z.unknown()).default({})},
    annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},
  },async({operation,args})=>{
    try {
      let value:unknown;
      if(operation==='help') {
        const request=z.object({operation:z.string().optional(),...paging}).strict().parse(args);
        if(request.operation){const entry=catalog[request.operation];if(!entry)throw new Error('Unknown operation.');value={operation:request.operation,description:entry.description,inputSchema:toJsonSchemaCompat(entry.schema)};}
        else {value={...page(Object.entries(catalog).map(([operation,entry])=>({operation,description:entry.description})),request.cursor,request.limit),transport:'serve is the process entry point, not a nested operation. Repository root is fixed by the host configuration.'};}
      } else value=await runOperation(store,operation,args);
      return {content:[{type:'text' as const,text:JSON.stringify(value)}]};
    }catch(e:any){return {content:[{type:'text' as const,text:JSON.stringify({error:e.message})}],isError:true};}
  });
}
