import { Lookup, Assess, lookup, assessChanges } from './access.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { reviewKnowledge } from './review.js';
import { ReadKnowledge, readKnowledge, listPillars, listChapters, readChapter, readFact, search, reviewChecklist } from './retrieval.js';
import { z } from 'zod';
import { Store } from './store.js';
import { Fact, PillarDefinition, ChapterDefinition, Update, chapterKey, relativePath } from './model.js';
import { Workflow, Patch, Admission } from './workflow.js';
import { initialize, discover, guidanceStatus, refreshGuidance } from './init.js';
import { checkHook, hookNotifications, installHook } from './hooks.js';
import { startHere, ownershipMap, pillarGraph } from './navigation.js';
import { checkKnowledge, startTidy } from './maintenance.js';
import { refreshKnowledgeExport } from './export.js';
import { version } from './version.js';

const paging={cursor:z.string().optional(),limit:z.number().int().min(1).max(20).optional()};
const target={target:z.string().min(1)};
const task={taskId:z.string().uuid()};
const approval={approved:z.literal(true).describe('Declaration of explicit developer approval of this exact operation and content; never infer approval from this flag.')};
const batch={batches:z.array(z.object({chapterId:chapterKey,facts:z.array(Fact).min(1)}).strict()).min(1),dryRun:z.boolean().default(false),approved:z.literal(true).optional(),preflight:z.string().optional()};
const routing={path:relativePath.optional(),signal:z.string().optional(),...paging};
type Operation={description:string;schema:z.AnyZodObject;run:(args:any)=>Promise<unknown>};
export function operations(store:Store):Record<string,Operation> {
  const flow=new Workflow(store);
  const op=(description:string,shape:z.ZodRawShape,run:Operation['run']):Operation=>({description,schema:z.object(shape).strict(),run});
  const mutation=async(operation:string,args:any,write:()=>Promise<unknown>)=>{
    const result=await write();if(args.verbose)return result;
    const chapterIds=operation==='approve'?args.pillars.flatMap((p:any)=>p.chapters.map((c:any)=>`${p.id}/${c.id}`)):operation==='approve-chapters'?args.chapters.map((c:any)=>`${args.pillarId}/${c.id}`):[args.chapterId];
    const factIds=(args.facts??[]).map((f:any)=>`${args.chapterId}/${f.id}`);
    return {operation,approved:true,chapterCount:chapterIds.length,chapterIds,factCount:factIds.length,factIds,validation:'structure and exact evidence; not semantic verification',outputPath:'.common-ground/knowledge.json',next:operation.startsWith('approve')?'Boundaries approved; facts still require developer review and approval.':'Run validate, then start or continue the task workflow.'};
  };
  const verbose={verbose:z.boolean().default(false)};
  const check=op('Check all or selected knowledge for structure, exact evidence and freshness. Stale results list affected IDs and offer cleanup. cleanup:true requires developer-requested cleanup; it creates a scoped tidyId for the calling agent to verify and submit corrections.',{target:z.string().default('all'),cleanup:z.boolean().default(false),allResults:z.boolean().default(false),...paging},a=>checkKnowledge(store,a.target,a.cleanup,a.cursor,a.limit,undefined,a.allResults));
  return {
    lookup:op('Find up to five relevant facts and source paths without task state or source hashing. verify:true checks selected facts and dependencies; default freshness is not-checked.',Lookup.shape,a=>lookup(store,a)),
    assess:op('Read-only assessment of actual task-touched paths. No task needed. Compare candidate source changes; review:true supplies complete chapters and verification paths before corrections.',Assess.shape,a=>assessChanges(store,a)),
    schema:op('Inspect an operation input schema and CLI payload guidance.',{operation:z.string(),both:z.boolean().default(false)},async a=>{
      const entry=operations(store)[a.operation];if(!entry)throw new Error('Unknown operation.');
      const payload=['seed','admit','propose-facts'].includes(a.operation)?entry.schema.shape.facts
        :a.operation==='approve'?entry.schema.pick({pillars:true})
        :a.operation==='approve-chapters'?entry.schema.pick({chapters:true})
        :a.operation==='accept-facts'?entry.schema.shape.review
        :['bootstrap','seed-batch'].includes(a.operation)?entry.schema.omit({dryRun:true,approved:true,preflight:true}):entry.schema;
      return {operation:a.operation,description:entry.description,...(a.both?{inputSchema:toJsonSchemaCompat(entry.schema)}:{}),cliPayloadSchema:toJsonSchemaCompat(payload)};
    }),
    bootstrap:op('Preflight an initial map and facts together; publication requires developer approval and the matching preflight token.',{pillars:z.array(PillarDefinition).min(1),...batch},a=>{
      if(!a.dryRun && a.approved!==true)throw new Error('Developer approval required for boundaries and facts.');
      return store.bootstrap(a.pillars,a.batches,a.dryRun,a.preflight);
    }),
    'seed-batch':op('Preflight and populate multiple approved empty chapters atomically.',batch,a=>{
      if(!a.dryRun && a.approved!==true)throw new Error('Developer approval required for facts.');
      return store.bootstrap(undefined,a.batches,a.dryRun,a.preflight);
    }),
    init:op('Initialize or refresh repository guidance, MCP configuration, advisory hook and local Markdown.',{},()=>initialize(store)),
    'refresh-guidance':op('Refresh only managed guidance; preserve surrounding content and shared knowledge.',{},()=>refreshGuidance(store)),
    scan:op('Discover a proposed responsibility map; no approval or shared knowledge write.',{exclude:z.array(relativePath).default([])},a=>discover(store,a.exclude)),
    approve:op('Approve the developer-reviewed responsibility map.',{pillars:z.array(PillarDefinition),standaloneReason:z.string().optional(),...approval,...verbose},a=>mutation('approve',a,()=>store.approveDefinitions(a.pillars,a.standaloneReason))),
    migrate:op('Migrate a legacy registry after developer approval.',approval,()=>store.migrate()),
    'approve-chapters':op('Add developer-approved chapters.',{pillarId:z.string(),chapters:z.array(ChapterDefinition),...approval,...verbose},a=>mutation('approve-chapters',a,()=>store.addChapters(a.pillarId,a.chapters))),
    seed:op('Populate an approved empty chapter with developer-approved source-verified facts.',{chapterId:chapterKey,facts:z.array(Fact),...approval,...verbose},a=>mutation('seed',a,()=>store.seed(a.chapterId,a.facts))),
    admit:op('Admit developer-approved facts after reviewing the whole chapter and source.',{chapterId:chapterKey,facts:z.array(Fact),...approval,...verbose},a=>mutation('admit',a,()=>store.admit(a.chapterId,a.facts))),
    'task-start':op('Optional task context for deferred additions or aggregated correction reports; lookup and assess need no task.',{paths:z.array(relativePath).optional(),signal:z.string().optional()},a=>flow.start(a.paths,a.signal)),
    'task-assess':op('Assess actual task-touched paths.',{...task,paths:z.array(relativePath),refresh:z.boolean().optional(),...paging},a=>flow.assess(a.taskId,a.paths,a.cursor,a.limit,a.refresh)),
    'task-finish':op('Finish task; present compact before/after corrections with reasons, sources and recommendations. Only pending additions need approval; never ask the developer to review JSON.',{...task,...paging},a=>flow.finish(a.taskId,a.cursor,a.limit)),
    'read-knowledge':op('Read bounded knowledge; discover read kinds in the read_knowledge tool or help.',ReadKnowledge.shape,a=>readKnowledge(store,a)),
    'prepare-patch':op('Prepare verified existing-fact maintenance after whole chapter and source review. taskId is optional; omitted means no start/finish lifecycle.',Patch.shape,a=>flow.prepare(a)),
    'propose-facts':op('Queue source-verified facts locally for later approval.',{...task,chapterId:chapterKey,facts:z.array(Fact).min(1)},a=>flow.propose(a.taskId,a.chapterId,a.facts)),
    'drop-facts':op('Discard selected local proposal keys.',{...task,factKeys:z.array(z.string()).min(1)},a=>flow.drop(a.taskId,a.factKeys)),
    'accept-facts':op('Admit the explicitly approved finished-task batch after complete linked-chapter and source review.',{...task,review:Admission,...approval},a=>flow.accept(a.taskId,a.review)),
    start:op('Route from a source path or symptom.',routing,a=>startHere(store,a)),
    owners:op('Read ownership routing hints.',routing,a=>ownershipMap(store,a)),
    graph:op('Read the recorded dependency graph.',{pillarId:z.string().optional(),...paging},a=>pillarGraph(store,a.pillarId,a.cursor,a.limit)),
    review:op('Summarize meaningful pillar/chapter/fact changes against Git HEAD, omitting unchanged records and metadata. Present the delta, verified reason, source links and recommendation in chat; no JSON editing. This is a diff, not proof of truth or approval.',{target:z.string().default('all'),staged:z.boolean().default(false),evidence:z.boolean().default(false),...paging},a=>reviewKnowledge(store,a.target,a.staged,a.evidence,a.cursor,a.limit)),
    check,
    validate:check,
    tidy:op('Start developer-requested cleanup for all, pillar, chapter or fact; returns tidyId. Calling agent must verify source and submit corrections. No internal model runs.',{...target,...paging},a=>startTidy(store,a.target,a.cursor,a.limit)),
    'review-checklist':op('List source and documentation to read this session.',{chapterIds:z.array(chapterKey),touchedPaths:z.array(relativePath),...paging},a=>reviewChecklist(store,a.chapterIds,a.touchedPaths,a.cursor,a.limit)),
    list:op('List pillars.',paging,a=>listPillars(store,a.cursor,a.limit)),
    chapters:op('List chapters in a pillar.',{pillarId:z.string(),...paging},a=>listChapters(store,a.pillarId,a.cursor,a.limit)),
    read:op('Read every chapter page before editing; fact retrieves evidence.',{chapterId:chapterKey,...paging},a=>readChapter(store,a.chapterId,a.cursor,a.limit)),
    fact:op('Read a fact and evidence.',{chapterId:chapterKey,factId:z.string()},a=>readFact(store,a.chapterId,a.factId)),
    search:op('Search fact summaries.',{query:z.string().min(1),chapterId:chapterKey.optional(),limit:paging.limit},a=>search(store,a.query,a.limit,a.chapterId)),
    'review-plan':op('Find required linked chapter reviews.',{chapterId:chapterKey,factIds:Update.shape.factIds},a=>store.reviewPlan(a.chapterId,a.factIds)),
    prepare:op('Prepare a complete verified review transaction.',Update.shape,a=>store.prepare(a)),
    commit:op('Publish a prepared transaction after source and revision conflict checks.',{proposalId:z.string().uuid()},a=>store.commit(a.proposalId)),
    'hook-check':op('Run the advisory staged-index hook check without prompting or blocking a commit.',{},async()=>({message:await checkHook(store)})),
    'hook-install':op('Install or inspect integration of the default advisory pre-commit hook.',{},()=>installHook(store)),
    'hook-mute':op('Suppress this checkout\'s hook notifications at developer request.',{},()=>hookNotifications(store,false)),
    'hook-unmute':op('Restore this checkout\'s hook notifications at developer request.',{},()=>hookNotifications(store,true)),
    export:op('Refresh the complete Git-ignored local Markdown reference.',{},()=>refreshKnowledgeExport(store)),
    doctor:op('Check expected files and registry validity; not a complete host diagnostic.',{},async()=>{
      const checks:Record<string,unknown>={node:process.version,root:store.root};let valid=true;
      for(const file of ['AGENTS.md','.github/copilot-instructions.md','.vscode/mcp.json','.common-ground/knowledge.json']){
        try{await store.safe(file);checks[file]='present';}catch{checks[file]='missing';valid=false;}
      }
      try{checks.pillars=(await store.read()).pillars.length;}catch(e:any){checks.registryError=e.message;valid=false;}
      const guidance=await guidanceStatus(store);if(guidance.status!=='current')valid=false;
      return {valid,...checks,guidance};
    }),
    version:op('Read framework version.',{},async()=>({version})),
  };
}
export async function runOperation(store:Store,operation:string,args:unknown={}) {
  const catalog=operations(store);const entry=Object.hasOwn(catalog,operation)?catalog[operation]:undefined;if(!entry)throw new Error(`Unknown operation: ${operation}. Call cground help.`);
  return entry.run(entry.schema.parse(args));
}
