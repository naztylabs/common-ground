import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {Workflow} from '../dist/workflow.js';
import {knowledgeChanges,reviewKnowledge} from '../dist/review.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../dist/server.js';
const fact={id:'mode',statement:'Application uses the first mode.',sourceScope:['app/source.txt'],evidence:[{path:'app/source.txt',quote:'mode=first'}],dependsOn:[]};
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'});
async function fixture(t,commit=true) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-review-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));git(root,'init','--quiet');
 git(root,'config','user.name','Synthetic Developer');git(root,'config','user.email','developer@example.test');
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/source.txt'),'mode=first\nmode=second\n');
 const store=new Store(root);await store.approveDefinitions([{id:'app',title:'Application',scope:'Application runtime contracts.',excludes:'Other systems.',chapters:[{id:'main',title:'Main chapter',scope:'Application runtime contracts.',excludes:'Other systems.',paths:['app']}]}]);await store.seed('app/main',[fact]);
 if(commit){git(root,'add','.common-ground/knowledge.json','app');git(root,'commit','--quiet','-m','Synthetic baseline');}
 return {root,store,flow:new Workflow(store)};
}
async function correct(store,flow,taskId,replacement) {
 const reg=await store.read();const reviews=[{chapterId:'app/main',expectedRevision:store.chapter(reg,'app/main').revision,reviewedAllFacts:true,replacements:[replacement],reason:'Verified the mode declaration in source.',maintenance:[{factId:'mode',action:'correct',reason:'Updated the assertion from verified source.'}]}];
 const verification=await store.reviewFiles(reg,['app/main'],['app/source.txt']);for(const file of [...verification.sourceFiles,...verification.documentFiles])await fs.readFile(path.join(store.root,file));
 const result=await flow.prepare({taskId,chapterId:'app/main',touchedPaths:['app/source.txt'],reviews,verification});await store.commit(result.proposalId);
}
test('content diff ignores fingerprints/revisions and shows only changed fields at each hierarchy level',async t=>{
 const {store}=await fixture(t);const before=await store.read(),after=structuredClone(before);const p=after.pillars[0],c=p.chapters[0];
 c.revision++;c.sources={noise:'ignored'};c.dependencyFingerprints={noise:'ignored'};assert.deepEqual(knowledgeChanges(before,after),[]);
 p.scope='New application responsibility boundaries.';c.title='Runtime chapter';c.facts[0].statement='Application uses the second mode.';
 const changes=knowledgeChanges(before,after);assert.deepEqual(changes.map(c=>c.kind),['pillar','chapter','fact']);assert.deepEqual(Object.keys(changes[2].fields),['statement']);
 assert.equal(knowledgeChanges(before,after,'mode').length,1);assert.equal(knowledgeChanges(before,after,'app/main').length,2);
 assert.throws(()=>knowledgeChanges(before,after,'missing'),/Unknown/);
});
test('Git review distinguishes staged changes, omits unchanged records, and never writes knowledge/local files',async t=>{
 const {root,store}=await fixture(t);
 const unchanged=spawnSync(process.execPath,[path.resolve('dist/cli.js'),'review','--root',root],{encoding:'utf8'});assert.equal(unchanged.status,0,unchanged.stderr);assert.match(unchanged.stdout,/No knowledge content changes/);assert.doesNotMatch(unchanged.stdout,/Recommended:|coding agent/);
 const registry=await store.read();registry.pillars[0].chapters[0].facts[0].statement='Application uses the staged mode.';await fs.writeFile(store.file('knowledge.json'),JSON.stringify(registry));git(root,'add','.common-ground/knowledge.json');
 registry.pillars[0].chapters[0].facts[0].statement='Application uses the working mode.';await fs.writeFile(store.file('knowledge.json'),JSON.stringify(registry));
 const before=await fs.readFile(store.file('knowledge.json'),'utf8'),local=await fs.readdir(store.file('local'));
 assert.equal((await reviewKnowledge(store)).items[0].fields.statement.after,'Application uses the working mode.');
 assert.equal((await reviewKnowledge(store,'all',true)).items[0].fields.statement.after,'Application uses the staged mode.');
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);assert.deepEqual(await fs.readdir(store.file('local')),local);
 const result=spawnSync(process.execPath,[path.resolve('dist/cli.js'),'review','--root',root],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/first mode.*→.*working mode/);assert.doesNotMatch(result.stdout,/"sources"/);
 assert.match(result.stdout,/Recommended: run this review through your coding agent/);
 const json=spawnSync(process.execPath,[path.resolve('dist/cli.js'),'review','--json','--staged','--root',root],{encoding:'utf8'});assert.equal(JSON.parse(json.stdout).summary.facts,1);
});
test('review handles initial additions, deleted pillars/facts, metadata-only changes and changed pagination',async t=>{
 const {store}=await fixture(t,false);assert.equal((await reviewKnowledge(store)).summary.facts,1);
 const before=await store.read();assert.equal(knowledgeChanges(before,{schemaVersion:2,pillars:[]},'app/main/mode')[0].change,'removed');
 const first=await reviewKnowledge(store,'all',false,false,undefined,1);assert.ok(first.nextCursor);
 const reg=await store.read();reg.pillars[0].title='Another application';await fs.writeFile(store.file('knowledge.json'),JSON.stringify(reg));await assert.rejects(reviewKnowledge(store,'all',false,false,first.nextCursor,1),/Content changed/);
});
test('evidence-only changes are explicit and exact quotes are opt-in',async t=>{
 const {store}=await fixture(t);const before=await store.read(),after=structuredClone(before);after.pillars[0].chapters[0].facts[0].evidence[0].quote='mode=second';
 const compact=knowledgeChanges(before,after)[0];assert.deepEqual(Object.keys(compact.fields),['evidence']);assert.match(compact.evidenceDetails,/changed/);assert.doesNotMatch(JSON.stringify(compact),/mode=second/);
 assert.match(JSON.stringify(knowledgeChanges(before,after,'all',true)),/mode=second/);
});
test('task finish gives net before/after, reason, source links and recommendation without raw JSON review',async t=>{
 const {store,flow}=await fixture(t);const {taskId}=await flow.start();
 await correct(store,flow,taskId,{...fact,statement:'Application uses the second mode.'});
 let result=await flow.finish(taskId);const change=result.items[0];assert.equal(result.notification,'summary');assert.equal(change.fields.statement.before,fact.statement);assert.equal(change.fields.statement.after,'Application uses the second mode.');assert.equal(change.reason,'Updated the assertion from verified source.');assert.deepEqual(change.evidencePaths,['app/source.txt']);assert.equal(change.approvalRequired,false);assert.equal(change.recommendation,'keep-verified-correction');assert.equal(result.reviewPath,undefined);assert.doesNotMatch(result.reviewPrompt,/in knowledge.json/);
 // Same statement, different evidence must still be reported as changed since the task's write.
 const reg=await store.read();reg.pillars[0].chapters[0].facts[0].evidence[0].quote='mode=second';await fs.writeFile(store.file('knowledge.json'),JSON.stringify(reg));result=await flow.finish(taskId);assert.equal(result.notification,'attention');assert.equal(result.items[0].changedSinceUpdate,true);
});
test('reverted task corrections stay silent and stale source requires another review',async t=>{
 const {root,store,flow}=await fixture(t);const {taskId}=await flow.start();await correct(store,flow,taskId,{...fact,statement:'Application uses the second mode.'});await correct(store,flow,taskId,fact);assert.equal((await flow.finish(taskId)).notification,'none');
 const task=await flow.start();await correct(store,flow,task.taskId,{...fact,statement:'Application uses the second mode.'});await fs.writeFile(path.join(root,'app/source.txt'),'mode=third');assert.equal((await flow.finish(task.taskId)).items[0].recommendation,'reverify');
});
test('draft approval summaries include source paths, distinguish pending facts, and never publish them',async t=>{
 const {store,flow}=await fixture(t);const {taskId}=await flow.start();await flow.propose(taskId,'app/main',[{...fact,id:'new'}]);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 const result=await flow.finish(taskId);assert.equal(result.notification,'approval-required');assert.equal(result.items[0].recommendation,'present-for-approval');assert.deepEqual(result.items[0].evidencePaths,['app/source.txt']);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
for(const profile of ['compact','full'])test(`MCP ${profile} exposes read-only review through cground`,async t=>{
 const {store}=await fixture(t,false);const server=createServer(store,profile),client=new Client({name:'synthetic-review-agent',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);t.after(async()=>{await client.close();await server.close();});
 const result=await client.callTool({name:'cground',arguments:{operation:'review',args:{target:'app'}}});assert.equal(result.isError,undefined);assert.equal(JSON.parse(result.content[0].text).summary.facts,1);
});
test('deleting the final fact produces a removal summary instead of asking to approve a missing statement',async t=>{
 const {store,flow}=await fixture(t);const {taskId}=await flow.start();const reg=await store.read();
 const result=await flow.prepare({taskId,chapterId:'app/main',touchedPaths:['app/source.txt'],verification:await store.reviewFiles(reg,['app/main'],['app/source.txt']),reviews:[{chapterId:'app/main',expectedRevision:1,reviewedAllFacts:true,removeFactIds:['mode'],reason:'The recorded claim is superseded.',maintenance:[{factId:'mode',action:'remove',reason:'The recorded behavior is no longer supported.'}]}]});await store.commit(result.proposalId);
 const finish=await flow.finish(taskId);assert.equal(finish.notification,'summary');assert.equal(finish.items[0].change,'removed');assert.equal(finish.items[0].fields.statement.after,null);
});
test('review works for nested project roots with literal pathspec characters and rejects index symlinks',async t=>{
 const {root,store}=await fixture(t);const nested=path.join(root,'project[1]');await fs.mkdir(nested);await fs.mkdir(path.join(nested,'.common-ground'));await fs.writeFile(path.join(nested,'.common-ground/knowledge.json'),JSON.stringify(await store.read()));
 git(root,'add','--','project[[]1]/.common-ground/knowledge.json'); // Git pathspec matching only in this setup command.
 assert.equal((await reviewKnowledge(new Store(nested),'all',true)).summary.facts,1);
 await fs.unlink(store.file('knowledge.json'));await fs.symlink('../outside',store.file('knowledge.json'));git(root,'add','.common-ground/knowledge.json');
 await assert.rejects(reviewKnowledge(store,'all',true),/unsupported file types/);
});
