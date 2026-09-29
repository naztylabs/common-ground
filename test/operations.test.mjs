import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Store } from '../dist/store.js';
import { createServer } from '../dist/server.js';
import { checkKnowledge } from '../dist/maintenance.js';

async function fixture(t,profile='compact') {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-operations-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/source.txt'),'mode=first\n');
 const store=new Store(root),server=createServer(store,profile),client=new Client({name:'synthetic-agent',version:'1'});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);t.after(async()=>{await client.close();await server.close();});
 const call=async(operation,args={})=>{const result=await client.callTool({name:'cground',arguments:{operation,args}});return {error:result.isError===true,value:JSON.parse(result.content[0].text)};};
 return {root,store,call};
}
const pillars=[{id:'app',title:'Application',scope:'Application runtime behavior.',excludes:'Other systems.',chapters:[{id:'main',title:'Main chapter',scope:'Application runtime behavior.',excludes:'Other systems.',paths:['app']}]}];
const fact={id:'mode',statement:'The application uses the first mode.',sourceScope:['app/source.txt'],evidence:[{path:'app/source.txt',quote:'mode=first'}],dependsOn:[]};
for(const profile of ['compact','full'])test(`${profile} MCP discovers schemas, gates approval and completes stale correction without shell`,async t=>{
 const {root,store,call}=await fixture(t,profile);
 const catalog=[];let cursor;
 do {const response=await call('help',{cursor,limit:20});assert.equal(response.error,false);catalog.push(...response.value.items);cursor=response.value.nextCursor;}while(cursor);
 for(const name of ['init','scan','approve','seed','admit','accept-facts','drop-facts','check','validate','tidy','export','hook-mute','hook-unmute','doctor','prepare-patch','task-start','read-knowledge'])assert.ok(catalog.some(op=>op.operation===name),name);
 assert.equal((await call('help',{operation:'approve'})).value.inputSchema.properties.approved.const,true);
 assert.equal((await call('approve',{pillars})).error,true);await assert.rejects(fs.access(store.file('knowledge.json')));
 assert.equal((await call('approve',{pillars,approved:true})).error,false);
 assert.equal((await call('seed',{chapterId:'app/main',facts:[fact],approved:true})).error,false);
 assert.equal((await call('validate',{target:'app'})).value.valid,true);
 await fs.writeFile(path.join(root,'app/source.txt'),'mode=second\n');
 const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 const stale=(await call('check',{target:'app',limit:1})).value;
 assert.deepEqual(stale.affected,{pillars:['app'],chapters:['app/main'],facts:['app/main/mode']});assert.equal(stale.cleanupPrompt,'Start automatic cleanup?');assert.equal(stale.cleanup,null);
 assert.equal((await fs.readdir(store.file('local'))).some(f=>f.startsWith('tidy-')),false);
 const cleanup=(await call('validate',{target:'app',cleanup:true})).value.cleanup;assert.ok(cleanup.tidyId);
 assert.deepEqual(await store.tidyScope(cleanup.tidyId,await store.read()),['app/main']);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
 const task=(await call('task-start',{})).value;
 const chapter=(await call('read-knowledge',{kind:'chapter',target:'app/main',evidence:true})).value;
 const checklist=(await call('review-checklist',{chapterIds:['app/main'],touchedPaths:[]})).value;
 const verification={sourceFiles:[],documentFiles:[]};for(const entry of checklist.items){await fs.readFile(path.join(root,entry.path),'utf8');verification[entry.kind].push(entry.path);}
 const patch=await call('prepare-patch',{taskId:task.taskId,chapterId:'app/main',touchedPaths:[],tidyId:cleanup.tidyId,verification,reviews:[{chapterId:'app/main',expectedRevision:chapter.revision,reviewedAllFacts:true,replacements:[{...fact,statement:'The application uses the second mode.',evidence:[{path:'app/source.txt',quote:'mode=second'}]}],reason:'Verified the current source mode.',maintenance:[{factId:'mode',action:'correct',reason:'The source now declares the second mode.'}]}]});
 assert.equal(patch.error,false,JSON.stringify(patch));
 assert.equal((await call('commit',{proposalId:patch.value.proposalId})).error,false);
 assert.equal((await call('validate',{target:'app'})).value.valid,true);
 assert.match(await fs.readFile(store.file('local/knowledge.md'),'utf8'),/second mode/);
});
test('CLI stale prompts are nonblocking for pipes; yes creates scoped receipt, no does not',async t=>{
 const {root,store}=await fixture(t);await store.approveDefinitions(pillars);await store.seed('app/main',[fact]);await fs.writeFile(path.join(root,'app/source.txt'),'mode=second');
 const cli=(...args)=>spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root],{encoding:'utf8',timeout:10000});
 const no=cli('check','app','--cleanup','n');assert.equal(no.status,1);assert.equal(JSON.parse(no.stdout).cleanup,null);assert.match(no.stderr,/following PILLAR is out of date/);assert.match(no.stderr,/following CHAPTER is out of date/);assert.match(no.stderr,/following FACT is out of date/);
 const prompt=cli('validate','app');assert.equal(prompt.status,1);assert.match(prompt.stderr,/Start automatic cleanup\?/);
 const yes=cli('check','app','--cleanup','y');assert.ok(JSON.parse(yes.stdout).cleanup.tidyId);assert.equal(yes.status,1);
 assert.equal(cli('check','app','--cleanup','maybe').status,1);
});
test('confirmation rejects changed affected scope and does not issue a tidy receipt',async t=>{
 const {store}=await fixture(t);await store.approveDefinitions(pillars);await store.seed('app/main',[fact]);
 await assert.rejects(checkKnowledge(store,'all',true,undefined,undefined,{pillars:['different'],chapters:[],facts:[]}),/Affected knowledge changed/);
 assert.equal((await fs.readdir(store.file('local'))).some(f=>f.startsWith('tidy-')),false);
});
test('every CLI command has an MCP operation or explicit transport/group mapping',async()=>{
 const {operations}=await import('../dist/operations.js');const names=new Set(Object.keys(operations(new Store('/tmp'))));
 const cli=await fs.readFile('src/cli.ts','utf8');
 const mappings={serve:[],hook:['hook-check','hook-install','hook-mute','hook-unmute'],task:['task-start','task-assess','task-finish'],'--version':['version']};
 for(const match of cli.matchAll(/^ case '([^']+)'/gm))for(const name of mappings[match[1]]??[match[1]])assert.ok(names.has(name),`CLI ${match[1]} lacks MCP operation ${name}`);
});
