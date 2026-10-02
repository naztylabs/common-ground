import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {Workflow} from '../dist/workflow.js';
import {lookup,assessChanges} from '../dist/access.js';
import {readKnowledge,search} from '../dist/retrieval.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../dist/server.js';
const definition=id=>({id,title:`${id} subsystem`,scope:'Synthetic runtime responsibility.',excludes:'Other subsystems.',chapters:[{id:'main',title:'Main chapter',scope:'Synthetic runtime contracts.',excludes:'Other subsystems.',paths:[id]}]});
const fact=(id='mode',scope='app/contract.txt')=>({id,statement:`Application ${id} uses mode one.`,evidence:[{path:'app/contract.txt',quote:'mode=one'}],sourceScope:[scope],dependsOn:[]});
async function fixture(t,count=2){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-access-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/contract.txt'),'mode=one');await fs.writeFile(path.join(root,'app/README.md'),'Local documentation.');
 const store=new Store(root),flow=new Workflow(store);await store.approveDefinitions([definition('app')]);await store.seed('app/main',Array.from({length:count},(_,i)=>fact(`mode-${i}`)));
 const call=(...args)=>spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root],{encoding:'utf8',timeout:10000});
 return {root,store,flow,call};
}
async function allPages(store,paths,review=true){let cursor;const items=[];do{const result=await assessChanges(store,{paths,review,limit:20,cursor});items.push(...result.items);cursor=result.nextCursor;}while(cursor);return items;}
async function correction(store){
 const items=await allPages(store,['app/contract.txt']);
 for(const item of items.filter(i=>['source','document'].includes(i.kind)))await fs.readFile(path.join(store.root,item.path));
 return {chapterId:'app/main',touchedPaths:['app/contract.txt'],verification:{sourceFiles:items.filter(i=>i.kind==='source').map(i=>i.path),documentFiles:items.filter(i=>i.kind==='document').map(i=>i.path)},reviews:items.filter(i=>i.kind==='chapter').map(i=>({chapterId:i.chapterId,expectedRevision:i.expectedRevision,reviewedAllFacts:true,reason:'Read every chapter fact and verified the current source.',replacements:items.filter(f=>f.kind==='fact'&&f.chapterId===i.chapterId&&f.fact.id==='mode-0').map(({fact})=>({...fact,statement:'Application mode zero uses mode two.',evidence:[{path:'app/contract.txt',quote:'mode=two'}]}))}))};
}
test('lookup reads the registry once, returns source locations and performs no hashing or writes',async t=>{
 const {store}=await fixture(t,8);let reads=0;const read=store.read.bind(store);store.read=async()=>{reads++;return read();};
 store.snapshot=async()=>assert.fail('lookup must not hash');store.atomic=async()=>assert.fail('lookup must not write');
 const result=await lookup(store,{query:'mode'});assert.equal(result.items.length,5);assert.equal(result.total,8);assert.equal(reads,1);
 assert.equal(result.items[0].freshness.status,'not-checked');assert.deepEqual(result.items[0].sourcePaths,['app/contract.txt']);assert.ok(result.nextCursor);
 assert.equal((await lookup(store,{path:'app/contract.txt',limit:1})).items.length,1);
 assert.equal((await lookup(store,{path:'unowned/file.ts'})).state,'no-matches');
 await assert.rejects(lookup(store,{}),/query or --path/);await assert.rejects(lookup(store,{query:'mode',limit:6}));
});
test('lookup handles absent knowledge without creating setup or suppressing invalid registries',async t=>{
 const {root,store}=await fixture(t);await fs.rm(store.file('knowledge.json'));
 const before=await fs.readdir(store.file('local'));assert.equal((await lookup(store,{query:'mode'})).state,'knowledge-unavailable');assert.deepEqual(await fs.readdir(store.file('local')),before);
 await fs.writeFile(store.file('knowledge.json'),'invalid');await assert.rejects(lookup(store,{query:'mode'}),/JSON/);
 await assert.rejects(lookup(new Store(root),{path:'../secret'}),/traversal/);
});
test('verified lookup checks selected facts and upstream evidence, hashes each file once, and ignores stale siblings',async t=>{
 const {root,store}=await fixture(t);await fs.writeFile(path.join(root,'app/other.txt'),'other=one');
 await store.admit('app/main',[{...fact('unrelated'),evidence:[{path:'app/other.txt',quote:'other=one'}],sourceScope:['app/other.txt']}]);
 await fs.writeFile(path.join(root,'app/other.txt'),'other=changed');
 let hashes=0;const hash=store.sourceHash.bind(store);store.sourceHash=async file=>{hashes++;return hash(file);};
 const result=await lookup(store,{query:'mode',limit:2,verify:true});assert.equal(hashes,1);assert.ok(result.items.every(i=>i.freshness.status==='evidence-unchanged'));
 await fs.mkdir(path.join(root,'base'));await fs.writeFile(path.join(root,'base/contract.txt'),'base=one');
 await store.approveDefinitions([definition('base')],'Independent synthetic upstream responsibility.');
 await store.seed('base/main',[{...fact('base'),evidence:[{path:'base/contract.txt',quote:'base=one'}],sourceScope:['base/contract.txt']}]);
 await fs.writeFile(path.join(root,'app/other.txt'),'other=one');
 await store.admit('app/main',[{...fact('dependent'),dependsOn:['base/main/base']}]);
 await fs.writeFile(path.join(root,'base/contract.txt'),'base=two');
 const changed=await lookup(store,{query:'dependent',verify:true});assert.equal(changed.items[0].freshness.status,'needs-review');assert.deepEqual(changed.items[0].freshness.dependencyIssues,['base/main/base']);
});
test('ordinary search includes evidence paths and skips unused task fingerprints; task hashing is deduplicated per request',async t=>{
 const {root,store,flow}=await fixture(t);let hashes=0;const hash=store.sourceHash.bind(store);store.sourceHash=async file=>{hashes++;return hash(file);};
 const result=await readKnowledge(store,{kind:'search',query:'mode'});assert.equal(hashes,1);assert.deepEqual(result.items[0].fact.evidencePaths,['app/contract.txt']);
 const originalContext=store.context.bind(store);store.context=async()=>assert.fail('no task means no cache context');await readKnowledge(store,{kind:'chapter',target:'app/main'});store.context=originalContext;
 const {taskId}=await flow.start(['app/contract.txt']);const args={kind:'search',query:'mode',taskId};hashes=0;await readKnowledge(store,args);assert.equal(hashes,1);
 hashes=0;assert.equal((await readKnowledge(store,args)).unchanged,true);assert.equal(hashes,1);
 await fs.appendFile(path.join(root,'app/contract.txt'),'\nchanged');assert.ok((await readKnowledge(store,args)).items);
 assert.deepEqual((await search(store,'mode'))[0].fact.evidencePaths,['app/contract.txt']);
});
test('stateless assessment has no bookkeeping, ignores unchanged content and keeps documents focused',async t=>{
 const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'other'));await fs.writeFile(path.join(root,'other/README.md'),'Unrelated documentation.');
 await fs.writeFile(path.join(root,'README.md'),'[Remote chapter](other/README.md)');
 store.atomic=async()=>assert.fail('assessment must not write');
 assert.deepEqual((await assessChanges(store,{paths:[]})).items,[]);
 const same=await assessChanges(store,{paths:['app/contract.txt']});assert.equal(same.state,'no-fact-review');assert.equal(same.affectedFactCount,0);assert.equal(same.candidateFactCount,2);
 assert.ok(same.items.some(i=>i.path==='app/README.md'));assert.ok(!same.items.some(i=>i.path==='other/README.md'));
 await fs.writeFile(path.join(root,'app/unrecorded.ts'),'export {};');assert.equal((await assessChanges(store,{paths:['app/unrecorded.ts']})).state,'no-fact-review');
 await fs.appendFile(path.join(root,'app/contract.txt'),'\nchanged');const changed=await assessChanges(store,{paths:['app/contract.txt']});assert.equal(changed.state,'source-review-required');assert.equal(changed.affectedFactCount,2);assert.ok(!changed.items.some(i=>i.kind==='chapter'||i.kind==='fact'));
 assert.equal(changed.items[0].statement,'Application mode-0 uses mode one.');
});
test('assessment hashes only touched scope portions, including new files and deletions',async t=>{
 const {root,store}=await fixture(t,0);await store.seed('app/main',[fact('broad','app')]);await fs.writeFile(path.join(root,'app/new.txt'),'new');
 const hashed=[];const hash=store.sourceHash.bind(store);store.sourceHash=async file=>{hashed.push(file);return hash(file);};
 assert.equal((await assessChanges(store,{paths:['app/new.txt']})).affectedFactCount,1);assert.deepEqual(hashed,['app/new.txt']);
 hashed.length=0;await fs.rm(path.join(root,'app/README.md'));const deleted=await assessChanges(store,{paths:['app/README.md']});assert.deepEqual(deleted.items[0].changedPaths,['app/README.md']);assert.deepEqual(hashed,[]);
 await fs.rm(path.join(root,'app/contract.txt'));assert.equal((await assessChanges(store,{paths:['app/contract.txt']})).state,'source-review-required');
 await fs.symlink('/etc/passwd',path.join(root,'app/contract.txt'));await assert.rejects(assessChanges(store,{paths:['app/contract.txt']}),/Symlinks/);
});
test('review packages include every fact and linked chapter and reject changed pagination',async t=>{
 const {root,store}=await fixture(t,25);await fs.mkdir(path.join(root,'dependent'));await fs.writeFile(path.join(root,'dependent/a.txt'),'uses=app');
 await store.approveDefinitions([definition('dependent')],'Independent dependent subsystem.');await store.seed('dependent/main',[{...fact('dependent'),sourceScope:['dependent'],evidence:[{path:'dependent/a.txt',quote:'uses=app'}],dependsOn:['app/main/mode-0']}]);
 const items=await allPages(store,['app/contract.txt']);assert.equal(items.filter(i=>i.kind==='fact').length,26);assert.deepEqual(items.filter(i=>i.kind==='chapter').map(i=>i.chapterId),['app/main','dependent/main']);
 assert.ok(items.some(i=>i.kind==='source'&&i.path==='dependent/a.txt'));
 const first=await assessChanges(store,{paths:['app/contract.txt'],review:true,limit:1});assert.ok(first.nextCursor);
 await fs.appendFile(path.join(root,'app/contract.txt'),'\nchanged');await assert.rejects(assessChanges(store,{paths:['app/contract.txt'],review:true,limit:1,cursor:first.nextCursor}),/Content changed/);
});
test('standalone corrections preserve complete review, growth, revision, and source-conflict safeguards',async t=>{
 const {root,store,flow}=await fixture(t);await fs.writeFile(path.join(root,'app/contract.txt'),'mode=one\nmode=two');
 const input=await correction(store);assert.equal(input.taskId,undefined);
 await assert.rejects(flow.prepare({...input,reviews:input.reviews.map(r=>({...r,reviewedAllFacts:false}))}));
 await assert.rejects(flow.prepare({...input,reviews:input.reviews.map(r=>({...r,expectedRevision:99}))}),/revision conflict/);
 await assert.rejects(flow.prepare({...input,reviews:input.reviews.map(r=>({...r,replacements:[fact('new')]}))}),/only edit existing/);
 await assert.rejects(flow.prepare({...input,verification:{sourceFiles:[],documentFiles:[]}}),/verification required/);
 const pending=await flow.prepare(input);await fs.appendFile(path.join(root,'app/contract.txt'),'\nchanged');await assert.rejects(store.commit(pending.proposalId),/Source changed/);
 const prepared=await flow.prepare(await correction(store));await store.commit(prepared.proposalId);
 assert.match(store.chapter(await store.read(),'app/main').facts[0].statement,/mode two/);
 assert.equal((await fs.readdir(store.file('local'))).some(f=>f.startsWith('task-')),false);
});
test('CLI lookup and assessment support simple paths and queries with strict usage',async t=>{
 const {call}=await fixture(t);let result=call('lookup','mode');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).items[0].freshness.status,'not-checked');
 result=call('lookup','--path','app/contract.txt','--verify');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).items[0].freshness.status,'evidence-unchanged');
 result=call('assess','--touched','app/contract.txt');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).state,'no-fact-review');
 result=call('assess','--touched','app/contract.txt','--review');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).state,'review-required');
 assert.equal(call('assess').status,1);assert.equal(call('lookup').status,1);assert.equal(call('lookup','mode','--limit','6').status,1);
});
for(const profile of ['compact','full'])test(`${profile} MCP supports lookup, assessment and correction without task context`,async t=>{
 const {root,store}=await fixture(t);const [ct,st]=InMemoryTransport.createLinkedPair();const server=createServer(store,profile),client=new Client({name:'synthetic-access',version:'1'});await server.connect(st);await client.connect(ct);t.after(async()=>{await client.close();await server.close();});
 const call=async(operation,args)=>{const r=await client.callTool({name:'cground',arguments:{operation,args}});assert.equal(r.isError,undefined,JSON.stringify(r));return JSON.parse(r.content[0].text);};
 assert.equal((await call('lookup',{query:'mode'})).items[0].freshness.status,'not-checked');assert.equal((await call('assess',{paths:[]})).state,'no-fact-review');
 await fs.writeFile(path.join(root,'app/contract.txt'),'mode=one\nmode=two');const prepared=await call('prepare-patch',await correction(store));await call('commit',{proposalId:prepared.proposalId});
 assert.equal((await fs.readdir(store.file('local'))).some(f=>f.startsWith('task-')),false);
});
test('review packages identify separate transaction scopes for disconnected chapters',async t=>{
 const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'other'));await fs.writeFile(path.join(root,'other/a.txt'),'other=one');
 await store.approveDefinitions([definition('other')],'An independent synthetic responsibility.');
 await store.seed('other/main',[{...fact('other'),sourceScope:['other/a.txt'],evidence:[{path:'other/a.txt',quote:'other=one'}]}]);
 const items=await allPages(store,['app/contract.txt','other/a.txt']);
 assert.deepEqual(items.filter(i=>i.kind==='review-scope').map(({chapterId,requiredChapterIds})=>({chapterId,requiredChapterIds})),[
  {chapterId:'app/main',requiredChapterIds:['app/main']},{chapterId:'other/main',requiredChapterIds:['other/main']}
 ]);
});
test('broad-scope verification and assessment cap diagnostics while retaining total counts',async t=>{
 const {root,store}=await fixture(t,0);
 for(let i=0;i<12;i++)await fs.writeFile(path.join(root,'app',`${i}.txt`),'before');
 await store.seed('app/main',[fact('broad','app')]);
 for(let i=0;i<12;i++)await fs.writeFile(path.join(root,'app',`${i}.txt`),'after');
 const result=await lookup(store,{query:'broad',verify:true});assert.equal(result.items[0].freshness.changedPathCount,12);assert.equal(result.items[0].freshness.changedPaths.length,10);
 const assessment=await assessChanges(store,{paths:['app']});assert.equal(assessment.items[0].changedPathCount,12);assert.equal(assessment.items[0].changedPaths.length,10);
});
