import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../dist/store.js';
import { Workflow } from '../dist/workflow.js';
import { createServer, readKnowledge } from '../dist/server.js';
import { rules } from '../dist/guidance.js';

const fact=(id='format',version='v1',dependsOn=[])=>({id,statement:`Application ${id} uses ${version} records.`,evidence:[{path:'app/contract.txt',quote:`format=${version}`}],sourceScope:['app/contract.txt'],dependsOn});
async function fixture(t,count=1){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-workflow-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1');await fs.writeFile(path.join(root,'app/README.md'),'Application contract.');
  const store=new Store(root);await store.approveDefinitions([{id:'app',title:'Application',scope:'Owns the application contracts.',excludes:'Other subsystems.',chapters:[{id:'overview',title:'Overview',scope:'Application format contracts.',excludes:'Other subsystems.',paths:['app']}]}]);
  await store.seed('app/overview',Array.from({length:count},(_,i)=>fact(i?`format-${i}`:'format')));
  const flow=new Workflow(store);const {taskId}=await flow.start(['app/contract.txt']);return {root,store,flow,taskId};
}
async function patch(store,taskId,replacements=[],removeFactIds=[]){
  const registry=await store.read();const c=store.chapter(registry,'app/overview');
  const verification=await store.reviewFiles(registry,['app/overview'],['app/contract.txt']);
  for(const file of [...verification.sourceFiles,...verification.documentFiles])await fs.readFile(path.join(store.root,file));
  return {taskId,chapterId:'app/overview',touchedPaths:['app/contract.txt'],verification,reviews:[{
    chapterId:'app/overview',expectedRevision:c.revision,reviewedAllFacts:true,replacements,removeFactIds,reason:'Reviewed the entire chapter and current application source.',
    maintenance:[...replacements.map(f=>({factId:f.id,action:'correct',reason:'Corrected the statement against source read in this session.'})),...removeFactIds.map(factId=>({factId,action:'remove',reason:'Removed a superseded fact after verifying the whole chapter.'}))],
  }]};
}
async function approval(flow,taskId){
  const {registry,candidate,keys,task}=await flow.admissionPlan(taskId);
  const verification=await flow.store.reviewFiles(registry,keys,task.paths,candidate);
  for(const file of [...verification.sourceFiles,...verification.documentFiles])await fs.readFile(path.join(flow.store.root,file));
  return {reviews:keys.map(chapterId=>({chapterId,expectedRevision:flow.store.chapter(registry,chapterId).revision,reviewedAllFacts:true})),verification};
}
async function addDependent(store){
  await fs.mkdir(path.join(store.root,'ci'));await fs.writeFile(path.join(store.root,'ci/build.txt'),'run=app');
  await store.approveDefinitions([{id:'ci',title:'CI pipeline',scope:'CI execution contracts and steps.',excludes:'Application formats.',chapters:[{id:'overview',title:'Overview',scope:'CI execution contracts and steps.',excludes:'Application formats.',paths:['ci']}]}],'A standalone pipeline responsibility.');
  const dependent={id:'build',statement:'CI runs the application build.',sourceScope:['ci/build.txt'],evidence:[{path:'ci/build.txt',quote:'run=app'}],dependsOn:['app/overview/format']};
  await store.seed('ci/overview',[dependent]);return dependent;
}

test('unrelated edits return no fact review, still include README, and finish silently',async t=>{
  const {root,store,flow,taskId}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  await fs.writeFile(path.join(root,'app/new-component.ts'),'export const x = 1;');
  const assessment=await flow.assess(taskId,['app/new-component.ts']);
  assert.equal(assessment.state,'no-fact-review');assert.ok(assessment.items.some(i=>i.path==='app/README.md'));
  assert.ok(!assessment.items.some(i=>i.kind==='chapter'));
  assert.equal((await flow.finish(taskId)).notification,'none');assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
test('patch preserves unchanged records without echoing them and reports committed corrections only',async t=>{
  const {store,flow,taskId}=await fixture(t,300);const before=store.chapter(await store.read(),'app/overview').facts;
  const changed={...before[0],statement:'The application contract specifies v1 records.'};
  const input=await patch(store,taskId,[changed]);
  const full={...input,reviews:[{...input.reviews[0],reviewedFactIds:before.map(f=>f.id),facts:before.map((f,i)=>i?f:changed)}]};
  assert.ok(JSON.stringify(input).length<JSON.stringify(full).length/20);
  const prepared=await flow.prepare(input);assert.equal((await flow.task(taskId)).changes['app/overview/format'],undefined);
  await store.commit(prepared.proposalId);const after=store.chapter(await store.read(),'app/overview');
  assert.equal(after.facts.length,300);assert.deepEqual(after.facts.slice(1),before.slice(1));
  const finish=await flow.finish(taskId);assert.equal(finish.notification,'summary');assert.equal(finish.total,1);assert.equal(finish.items[0].factId,'app/overview/format');
});
test('patch rejects growth, false whole-chapter attestation, missing docs and revision drift',async t=>{
  const {store,flow,taskId}=await fixture(t);
  let input=await patch(store,taskId,[fact('new')]);await assert.rejects(()=>flow.prepare(input),/only edit existing/);
  input=await patch(store,taskId);input.reviews[0].reviewedAllFacts=false;await assert.rejects(()=>flow.prepare(input),/true/);
  input=await patch(store,taskId);input.verification.documentFiles=[];await assert.rejects(()=>flow.prepare(input),/documentFiles/);
  input=await patch(store,taskId);input.reviews[0].expectedRevision++;await assert.rejects(()=>flow.prepare(input),/revision conflict/);
});
test('no-op review never becomes a completion notification',async t=>{
  const {store,flow,taskId}=await fixture(t);assert.deepEqual(await flow.prepare(await patch(store,taskId)),{noop:true});
  assert.equal((await flow.finish(taskId)).notification,'none');
});
test('read reuse is task-local, refreshable, and invalidated by every live source change',async t=>{
  const {root,store,flow,taskId}=await fixture(t);const args={kind:'chapter',target:'app/overview',evidence:true,taskId};
  const first=await readKnowledge(store,args);assert.ok(first.facts);const repeated=await readKnowledge(store,args);assert.equal(repeated.unchanged,true);
  assert.ok(JSON.stringify(repeated).length<JSON.stringify(first).length/3);
  assert.ok((await readKnowledge(store,{...args,refresh:true})).facts);
  await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1\nchanged=one');assert.ok((await readKnowledge(store,args)).facts);
  await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1\nchanged=two');assert.ok((await readKnowledge(store,args)).facts);
  const second=await flow.start();assert.ok((await readKnowledge(store,{...args,taskId:second.taskId})).facts);
});
test('README edits and new documentation invalidate assessment and checklist reuse',async t=>{
  const {root,store,flow,taskId}=await fixture(t);
  await flow.assess(taskId,['app/contract.txt']);assert.equal((await flow.assess(taskId,['app/contract.txt'])).unchanged,true);
  const args={kind:'checklist',target:'app/overview',paths:['app/contract.txt'],taskId};await readKnowledge(store,args);assert.equal((await readKnowledge(store,args)).unchanged,true);
  await fs.writeFile(path.join(root,'app/README.md'),'An updated contract.');
  assert.ok((await flow.assess(taskId,['app/contract.txt'])).items);assert.ok((await readKnowledge(store,args)).items);
  await fs.writeFile(path.join(root,'app/child.md'),'A new related contract.');assert.ok((await readKnowledge(store,args)).items.some(i=>i.path==='app/child.md'));
});
test('new facts stay local, cannot be accepted mid-task, and require a complete admission review',async t=>{
  const {store,flow,taskId}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  await flow.propose(taskId,'app/overview',[fact('new'),fact('second')]);await flow.propose(taskId,'app/overview',[fact('new')]);
  assert.equal((await flow.proposals(taskId)).total,2);assert.equal((await readKnowledge(store,{kind:'chapter',target:'app/overview'})).facts.total,1);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
  await assert.rejects(()=>flow.accept(taskId,{reviews:[],verification:{sourceFiles:[],documentFiles:[]}}));
  await assert.rejects(()=>flow.admissionPlan(taskId),/Finish/);
  const finish=await flow.finish(taskId);assert.equal(finish.notification,'approval-required');assert.match(finish.reviewPrompt,/Ready to make the following facts available to the team/);assert.equal(finish.total,2);
  const review=await approval(flow,taskId);await assert.rejects(()=>flow.accept(taskId,{...review,verification:{sourceFiles:[],documentFiles:[]}}),/verification required/);
  assert.equal((await flow.accept(taskId,review)).admitted,2);assert.equal(store.chapter(await store.read(),'app/overview').facts.length,3);
});
test('queued facts reject source drift even when their evidence quote survives',async t=>{
  const {root,store,flow,taskId}=await fixture(t);await flow.propose(taskId,'app/overview',[fact('new')]);
  await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1\nadditional behavior changed');
  assert.equal((await flow.finish(taskId)).notification,'attention');await assert.rejects(()=>flow.admissionPlan(taskId),/reverify/);
  assert.equal(store.chapter(await store.read(),'app/overview').facts.length,1);
});
test('discarding drafts changes no shared knowledge and completion pages cover every proposal',async t=>{
  const {store,flow,taskId}=await fixture(t);await flow.propose(taskId,'app/overview',[fact('new'),fact('second')]);
  const first=await flow.finish(taskId,undefined,1);const next=await flow.finish(taskId,first.nextCursor,1);
  assert.notEqual(first.items[0].factId,next.items[0].factId);assert.equal(next.nextCursor,null);
  await flow.drop(taskId,['app/overview/new','app/overview/second']);assert.equal((await flow.finish(taskId)).notification,'none');
  assert.equal(store.chapter(await store.read(),'app/overview').facts.length,1);
});
test('failed commits remain visible and another task cannot claim their corrections',async t=>{
  const {root,store,flow,taskId}=await fixture(t);const changed={...fact(),statement:'Application contracts specify v1 records.'};
  const prepared=await flow.prepare(await patch(store,taskId,[changed]));await fs.writeFile(path.join(root,'app/README.md'),'Changed during review.');
  await assert.rejects(()=>store.commit(prepared.proposalId),/documentation changed/);
  const finish=await flow.finish(taskId);assert.equal(finish.notification,'attention');assert.equal(finish.items[0].kind,'uncommitted-review');
  const next=await flow.start();assert.equal((await flow.finish(next.taskId)).notification,'none');
});
test('evidence-heavy chapters paginate by payload as well as count, without dropping records',async t=>{
  const {root,store}=await fixture(t);const quote='x'.repeat(1200);await fs.writeFile(path.join(root,'app/large.txt'),quote);
  await store.admit('app/overview',Array.from({length:6},(_,i)=>({...fact(`large-${i}`),sourceScope:['app/large.txt'],evidence:Array.from({length:8},()=>({path:'app/large.txt',quote}))})));
  const seen=[];let cursor;
  do{const response=await readKnowledge(store,{kind:'chapter',target:'app/overview',evidence:true,limit:20,cursor});assert.ok(JSON.stringify(response).length<14000);seen.push(...response.facts.items.map(f=>f.id));cursor=response.facts.nextCursor??undefined;}while(cursor);
  assert.equal(seen.length,7);assert.equal(new Set(seen).size,7);
});
test('compact MCP startup is smaller and exposes no admission tool',async t=>{
  const {store}=await fixture(t);const manifests={};
  for(const profile of ['compact','full']){
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();const server=createServer(store,profile);await server.connect(serverTransport);
    const client=new Client({name:'context-budget',version:'1'});await client.connect(clientTransport);manifests[profile]=await client.listTools();await client.close();await server.close();
  }
  assert.equal(manifests.compact.tools.length,5);assert.equal(manifests.full.tools.length,13);
  assert.ok(JSON.stringify(manifests.compact).length<JSON.stringify(manifests.full).length*0.8);
  assert.ok(Buffer.byteLength(rules)<1600);assert.ok(!manifests.compact.tools.some(t=>/accept|admit|approve|seed/.test(t.name)));
  assert.ok(manifests.compact.tools.filter(t=>t.name!=='commit_update').every(t=>t.annotations.destructiveHint===false));
});
test('default CLI stdio profile runs a quiet end-to-end task',async t=>{
  const {root}=await fixture(t);const client=new Client({name:'workflow-smoke',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/cli.js'),'serve','--root',root],stderr:'pipe'});await client.connect(transport);t.after(()=>client.close());
  const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.equal(r.isError,undefined);return JSON.parse(r.content[0].text);};
  const {taskId}=await call('task_context',{action:'start',paths:['app/contract.txt']});
  assert.equal((await call('read_knowledge',{kind:'chapter',target:'app/overview',taskId,evidence:true})).facts.total,1);
  await call('propose_facts',{taskId,chapterId:'app/overview',facts:[fact('new')]});
  assert.equal((await call('task_context',{action:'finish',taskId})).notification,'approval-required');
});
test('assessment includes reverse dependents and patch omission still fails',async t=>{
  const {store,flow,taskId}=await fixture(t);await addDependent(store);
  const assessment=await flow.assess(taskId,['app/contract.txt']);
  assert.deepEqual(assessment.items.filter(i=>i.kind==='chapter').map(i=>i.chapterId),['app/overview','ci/overview']);
  const input=await patch(store,taskId,[{...fact(),statement:'Application records follow the verified v1 format.'}]);
  await assert.rejects(()=>flow.prepare(input),/Review every linked chapter/);
  input.reviews.push({chapterId:'ci/overview',expectedRevision:1,reviewedAllFacts:true,reason:'Reviewed all pipeline facts and their current evidence.'});
  input.verification=await store.reviewFiles(await store.read(),['app/overview','ci/overview'],input.touchedPaths);
  for(const file of [...input.verification.sourceFiles,...input.verification.documentFiles])await fs.readFile(path.join(store.root,file));
  const p=await flow.prepare(input);await store.commit(p.proposalId);
  assert.equal(store.chapter(await store.read(),'ci/overview').revision,1);
});
test('dependency source changes invalidate both read reuse and staged admission',async t=>{
  const {root,store,flow,taskId}=await fixture(t);const dependent=await addDependent(store);
  const args={kind:'chapter',target:'ci/overview',evidence:true,taskId};await readKnowledge(store,args);
  assert.equal((await readKnowledge(store,args)).unchanged,true);
  await flow.propose(taskId,'ci/overview',[{...dependent,id:'new-build'}]);
  await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1\nextra=one');assert.ok((await readKnowledge(store,args)).facts);
  await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1\nextra=two');assert.ok((await readKnowledge(store,args)).facts);
  assert.equal((await flow.finish(taskId)).notification,'attention');await assert.rejects(()=>flow.admissionPlan(taskId),/reverify/);
});
test('admission batches chapters atomically and cannot omit linked reviews',async t=>{
  const {root,store,flow,taskId}=await fixture(t);const dependent=await addDependent(store);
  await flow.propose(taskId,'app/overview',[fact('new')]);await flow.propose(taskId,'ci/overview',[{...dependent,id:'new-build'}]);
  await flow.finish(taskId);const input=await approval(flow,taskId);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  await assert.rejects(()=>flow.accept(taskId,{...input,reviews:input.reviews.slice(0,1)}),/every linked chapter/);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
  await fs.writeFile(path.join(root,'ci/build.txt'),'run=changed');await assert.rejects(()=>flow.accept(taskId,input),/reverify/);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
  await fs.writeFile(path.join(root,'ci/build.txt'),'run=app');await fs.readFile(path.join(root,'ci/build.txt'));
  assert.equal((await flow.accept(taskId,input)).admitted,2);const registry=await store.read();
  assert.equal(store.chapter(registry,'app/overview').revision,2);assert.equal(store.chapter(registry,'ci/overview').revision,2);
});
