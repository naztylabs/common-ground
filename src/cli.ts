#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';
import { initialize, discover } from './init.js';
import { search, serve, listPillars, listChapters, readChapter, readFact } from './server.js';
import { version } from './version.js';
const args = process.argv.slice(2);
function option(name: string) { const i=args.indexOf(name); if(i<0)return undefined; const v=args[i+1];if(!v||v.startsWith('--'))throw new Error(`Missing value for ${name}`);args.splice(i,2);return v; }
async function main() {
 const root=option('--root')??process.cwd();const cursor=option('--cursor');const limitText=option('--limit');const limit=limitText===undefined?undefined:Number(limitText);const chapterFilter=option('--chapter');const factIds=option('--facts')?.split(',');const standalone=option('--standalone-reason');const approved=args.includes('--approve');if(approved)args.splice(args.indexOf('--approve'),1);
 const [command,...rest]=args; const store=new Store(root); let output:unknown;
 const json=async(file:string)=>JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
 switch(command) {
 case 'init': output=await initialize(store);break;
 case 'scan': output=await discover(store);break;
 case 'approve': if(!approved)throw new Error('Developer approval required: inspect the proposal, then pass --approve.');output=await store.approveDefinitions((await json(rest[0])).pillars,standalone);break;
 case 'migrate': if(!approved)throw new Error('Developer approval required for migration: --approve.');output=await store.migrate();break;
 case 'approve-chapters': if(!approved)throw new Error('Developer approval required for new chapters: --approve.');output=await store.addChapters(rest[0],(await json(rest[1])).chapters);break;
 case 'seed': if(!approved)throw new Error('Developer approval required to populate an empty pillar: --approve.');output=await store.seed(rest[0],await json(rest[1]));break;
 case 'admit': if(!approved)throw new Error('Developer approval and whole-chapter review required: --approve.');output=await store.admit(rest[0],await json(rest[1]));break;
 case 'serve': await serve(store);return;
 case 'list': output=await listPillars(store,cursor,limit);break;
 case 'chapters': output=await listChapters(store,rest[0],cursor,limit);break;
 case 'read': output=await readChapter(store,rest[0],cursor,limit);break;
 case 'fact': output=await readFact(store,rest[0],rest[1]);break;
 case 'review-plan': output=await store.reviewPlan(rest[0],factIds);break;
 case 'search': output=await search(store,rest.join(' '),limit,chapterFilter);break;
 case 'prepare': output=await store.prepare(await json(rest[0]));break;
 case 'commit': output=await store.commit(rest[0]);break;
 case 'check': output=await Promise.all(store.chapters(await store.read()).map(c=>store.status(c.key)));if((output as any[]).some(s=>s.status!=='evidence-unchanged'))process.exitCode=1;break;
 case 'doctor': {const checks:Record<string,unknown>={node:process.version,root:store.root};for(const file of ['AGENTS.md','.github/copilot-instructions.md','.vscode/mcp.json','.common-ground/knowledge.json']){try{await store.safe(file);checks[file]='present';}catch{checks[file]='missing';process.exitCode=1;}}try{checks.pillars=(await store.read()).pillars.length;}catch(e:any){checks.registryError=e.message;process.exitCode=1;}output=checks;break;}
 case '--version': output=version;break;
 default: console.log(`Common Ground — shared codebase knowledge for every agent\n\ncground init [--root PATH]\ncground scan\ncground approve PLAN.json --approve [--standalone-reason TEXT]\ncground migrate --approve\ncground approve-chapters PILLAR PLAN.json --approve\ncground seed PILLAR/CHAPTER FACTS.json --approve\ncground admit PILLAR/CHAPTER NEW_FACTS.json --approve\ncground list | chapters PILLAR | read PILLAR/CHAPTER | fact PILLAR/CHAPTER FACT\ncground search QUERY | review-plan PILLAR/CHAPTER | check | doctor\nUse --cursor TOKEN and --limit 1..20 for paginated reads.\ncground prepare UPDATE.json | commit PROPOSAL_ID\ncground serve\n\nApproval commands are developer-directed, not autonomous agent operations.\nAll commands accept --root PATH. Node 22+ required.`);if(command&&command!=='--help')process.exitCode=1;return;
 }
 console.log(typeof output==='string'?output:JSON.stringify(output,null,2));
}
main().catch(e=>{console.error(`Common Ground: ${e.message}`);process.exitCode=1;});
