#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { checkKnowledge, staleMessage, startTidy } from './maintenance.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkHook, hookNotifications, installHook } from './hooks.js';
import { Store } from './store.js';
import { initialize, discover } from './init.js';
import { search, serve, listPillars, listChapters, readChapter, readFact, reviewChecklist, readKnowledge } from './server.js';
import { Workflow } from './workflow.js';
import { version } from './version.js';
import { ownershipMap, pillarGraph, startHere } from './navigation.js';
const args = process.argv.slice(2);
function option(name: string) { const i=args.indexOf(name); if(i<0)return undefined; const v=args[i+1];if(!v||v.startsWith('--'))throw new Error(`Missing value for ${name}`);args.splice(i,2);return v; }
async function main() {
 const root=option('--root')??process.cwd();const cursor=option('--cursor');const limitText=option('--limit');const limit=limitText===undefined?undefined:Number(limitText);const chapterFilter=option('--chapter');const factIds=option('--facts')?.split(',');const standalone=option('--standalone-reason');const approved=args.includes('--approve');if(approved)args.splice(args.indexOf('--approve'),1);
 const routePath=option('--path');const signal=option('--signal');const touched=option('--touched');const profile=option('--profile');
 const cleanup=option('--cleanup');if(cleanup!==undefined&&!['y','n'].includes(cleanup.toLowerCase()))throw new Error('Use --cleanup y or --cleanup n.');
 const jsonOutput=args.includes('--json');if(jsonOutput)args.splice(args.indexOf('--json'),1);
 const [command,...rest]=args; const store=new Store(root); let output:unknown;
 const json=async(file:string)=>JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
 switch(command) {
 case 'init': {
   const result=await initialize(store);
   if(jsonOutput) {output=result;break;}
   const link=(file:string)=>`[${file}](${path.resolve(store.root,file)})`;
   output=['Common Ground initialized.',result.hook,
     'existingRegistry' in result
       ? `Review the knowledge before sharing: ${link('.common-ground/knowledge.json')}`
       : `Review the proposed map with your agent: ${link('.common-ground/local/bootstrap.json')}\nAfter approval and population, review ${link('.common-ground/knowledge.json')} before sharing (not created yet).`,
     `Local Markdown: ${link(result.markdown.path)}`,
   ].join('\n');break;
 }
 case 'hook': {
   switch(rest[0]) {
     case 'check': {const message=await checkHook(store);if(message)console.error(message);return;}
     case 'mute': output=await hookNotifications(store,false);break;
     case 'unmute': output=await hookNotifications(store,true);break;
     case 'install': output=await installHook(store);break;
     default: throw new Error('Use cground hook check, install, mute, or unmute.');
   }break;
 }
 case 'scan': output=await discover(store);break;
 case 'approve': if(!approved)throw new Error('Developer approval required: inspect the proposal, then pass --approve.');output=await store.approveDefinitions((await json(rest[0])).pillars,standalone);break;
 case 'migrate': if(!approved)throw new Error('Developer approval required for migration: --approve.');output=await store.migrate();break;
 case 'approve-chapters': if(!approved)throw new Error('Developer approval required for new chapters: --approve.');output=await store.addChapters(rest[0],(await json(rest[1])).chapters);break;
 case 'seed': if(!approved)throw new Error('Developer approval required to populate an empty pillar: --approve.');output=await store.seed(rest[0],await json(rest[1]));break;
 case 'admit': if(!approved)throw new Error('Developer approval and whole-chapter review required: --approve.');output=await store.admit(rest[0],await json(rest[1]));break;
 case 'serve': await serve(store,profile);return;
 case 'task': {const flow=new Workflow(store);switch(rest[0]){
   case 'start':output=await flow.start(touched?.split(',')??[],signal);break;
   case 'assess':if(touched===undefined)throw new Error('Supply --touched for actual task paths.');output=await flow.assess(rest[1],touched? touched.split(','):[],cursor,limit);break;
   case 'finish':output=await flow.finish(rest[1],cursor,limit);break;
   default:throw new Error('Use task start, assess, or finish.');
 }break;}
 case 'read-knowledge': output=await readKnowledge(store,await json(rest[0]));break;
 case 'prepare-patch': output=await new Workflow(store).prepare(await json(rest[0]));break;
 case 'propose-facts': output=await new Workflow(store).propose(rest[0],rest[1],await json(rest[2]));break;
 case 'drop-facts': output=await new Workflow(store).drop(rest[0],rest.slice(1));break;
 case 'accept-facts': if(!approved)throw new Error('Explicit developer approval of the finished task batch required: --approve.');output=await new Workflow(store).accept(rest[0],await json(rest[1]));break;
 case 'start': output=await startHere(store,{path:routePath,signal:signal??(rest.join(' ')||undefined),cursor,limit});break;
 case 'owners': output=await ownershipMap(store,{path:routePath,signal:signal??(rest.join(' ')||undefined),cursor,limit});break;
 case 'graph': output=await pillarGraph(store,rest[0],cursor,limit);break;
 case 'check':
 case 'validate': {
   if(rest.length>1)throw new Error('Use cground check|validate [PILLAR_OR_CHAPTER_OR_FACT_OR_ALL] [--cleanup y|n].');
   let result=await checkKnowledge(store,rest[0]??'all',cleanup?.toLowerCase()==='y',cursor,limit);
   if(result.cleanupPrompt) {
     console.error(staleMessage(result));
     console.error('Source drift requires review; it does not prove the stored claim is false.');
     if(cleanup===undefined && process.stdin.isTTY && process.stderr.isTTY && !jsonOutput) {
       const prompt=createInterface({input:process.stdin,output:process.stderr});
       let answer:string;try{answer=await prompt.question('Start automatic cleanup? [y/N] ');}finally{prompt.close();}
       if(['y','yes'].includes(answer.trim().toLowerCase()))result=await checkKnowledge(store,rest[0]??'all',true,cursor,limit,result.affected);
     } else if(cleanup===undefined)console.error('Start automatic cleanup? Use --cleanup y or --cleanup n (agent verification required).');
   }
   output=result;if(!result.valid)process.exitCode=1;break;
 }
 case 'tidy': if(rest.length!==1)throw new Error('Use cground tidy PILLAR_OR_CHAPTER_OR_FACT_OR_ALL.');output=await startTidy(store,rest[0],cursor,limit);break;
 case 'review-checklist': output=await reviewChecklist(store,rest,touched?.split(',')??[],cursor,limit);break;
 case 'list': output=await listPillars(store,cursor,limit);break;
 case 'chapters': output=await listChapters(store,rest[0],cursor,limit);break;
 case 'read': output=await readChapter(store,rest[0],cursor,limit);break;
 case 'fact': output=await readFact(store,rest[0],rest[1]);break;
 case 'review-plan': output=await store.reviewPlan(rest[0],factIds);break;
 case 'search': output=await search(store,rest.join(' '),limit,chapterFilter);break;
 case 'prepare': output=await store.prepare(await json(rest[0]));break;
 case 'commit': output=await store.commit(rest[0]);break;
 case 'doctor': {const checks:Record<string,unknown>={node:process.version,root:store.root};for(const file of ['AGENTS.md','.github/copilot-instructions.md','.vscode/mcp.json','.common-ground/knowledge.json']){try{await store.safe(file);checks[file]='present';}catch{checks[file]='missing';process.exitCode=1;}}try{checks.pillars=(await store.read()).pillars.length;}catch(e:any){checks.registryError=e.message;process.exitCode=1;}output=checks;break;}
 case '--version': output=version;break;
 default: console.log(`Common Ground — an open-source framework for shared codebase knowledge\n\ncground init [--root PATH] [--json]\ncground hook check | install | mute | unmute\ncground scan\ncground start [SIGNAL] [--path PATH]\ncground owners [--path PATH] [--signal TEXT]\ncground graph [PILLAR]\ncground check|validate [PILLAR_OR_CHAPTER_OR_FACT_OR_ALL] [--cleanup y|n] [--json]\ncground tidy PILLAR_OR_CHAPTER_OR_FACT_OR_ALL\ncground review-checklist [CHAPTER ...] [--touched PATH1,PATH2]\ncground approve PLAN.json --approve [--standalone-reason TEXT]\ncground migrate --approve\ncground approve-chapters PILLAR PLAN.json --approve\ncground seed PILLAR/CHAPTER FACTS.json --approve\ncground admit PILLAR/CHAPTER NEW_FACTS.json --approve\ncground list | chapters PILLAR | read PILLAR/CHAPTER | fact PILLAR/CHAPTER FACT\ncground search QUERY | review-plan PILLAR/CHAPTER | check | doctor\nUse --cursor TOKEN and --limit 1..20 for paginated reads.\ncground prepare UPDATE.json | commit PROPOSAL_ID\ncground task start | assess TASK_ID --touched PATH1,PATH2 | finish TASK_ID\ncground read-knowledge REQUEST.json | prepare-patch PATCH.json\ncground propose-facts TASK_ID CHAPTER FACTS.json\ncground drop-facts TASK_ID FACT_KEY...\ncground accept-facts TASK_ID REVIEW.json --approve\ncground serve [--profile compact|full]\n\nApproval commands are developer-directed, not autonomous agent operations.\nAll commands accept --root PATH. Node 22+ required.`);if(command&&command!=='--help')process.exitCode=1;return;
 }
 console.log(typeof output==='string'?output:JSON.stringify(output,null,2));
}
main().catch(e=>{console.error(`Common Ground: ${e.message}`);process.exitCode=1;});
