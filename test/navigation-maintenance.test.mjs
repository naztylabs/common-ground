import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { initialize } from '../dist/init.js';
import { ownershipMap, pillarGraph, startHere, tidyPlan } from '../dist/navigation.js';
import { reviewChecklist } from '../dist/server.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cground-routing-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const store = new Store(root);
  const records = [
    ['java', 'entry', 'entry=Application.main', 'Java starts at Application.main.', []],
    ['tooling', 'build', 'command=npm run build', 'Workspace tooling provides the npm run build command.', ['java/overview/entry']],
    ['ci', 'build', 'run=npm run build', 'The CI pipeline runs npm run build.', ['tooling/overview/build']],
  ];
  for (const [id] of records) { await fs.mkdir(path.join(root,id)); }
  await store.approveDefinitions(records.map(([id]) => ({id,title:`${id} subsystem`,scope:`Owns the ${id} subsystem contracts and commands.`,excludes:'Other responsibilities.',chapters:[{id:'overview',title:'Overview',scope:`Defines the ${id} subsystem contracts.`,excludes:'Other responsibilities.',paths:[id]}]})));
  for (const [id,factId,quote,statement,dependsOn] of records) {
    const file = `${id}/contract.txt`; await fs.writeFile(path.join(root,file), quote);
    await store.seed(`${id}/overview`, [{id:factId,statement,evidence:[{path:file,quote}],sourceScope:[file],dependsOn}]);
  }
  return {root,store};
}

async function request(store, key='tooling/overview', tidyId, touchedPaths=['tooling/contract.txt']) {
  const registry = await store.read();
  const keys = tidyId ? await store.tidyScope(tidyId,registry) : store.related(registry,key);
  const verification = await store.reviewFiles(registry,keys,touchedPaths);
  for (const file of [...verification.sourceFiles,...verification.documentFiles]) {
    try { await fs.readFile(path.join(store.root,file),'utf8'); } catch(e) { if(e.code!=='ENOENT')throw e; }
  }
  return {chapterId:key,touchedPaths,tidyId,verification,reviews:keys.map(chapterId => {
    const chapter=store.chapter(registry,chapterId);
    return {chapterId,expectedRevision:chapter.revision,reviewedFactIds:chapter.facts.map(f=>f.id),invalidatedFactIds:[],facts:structuredClone(chapter.facts),reason:'Reviewed current source and all existing facts in this chapter.'};
  })};
}
function correct(input, key='tooling/overview') {
  const review=input.reviews.find(r=>r.chapterId===key);
  const fact=review.facts[0];fact.statement='The workspace exposes npm run build as its build command.';
  review.invalidatedFactIds=[fact.id];
  review.maintenance=[{factId:fact.id,action:'correct',reason:'Correct the existing wording against the command read in source this session.'}];
  return input;
}

test('ownership routes exact path prefixes and leaves unowned paths unresolved',async t=>{
  const {store}=await fixture(t);
  const map=await ownershipMap(store,{path:'tooling/new/file.ts'});
  assert.equal(map.items[0].pillarId,'tooling');assert.equal(map.items[0].match,'registered-path');
  assert.equal((await ownershipMap(store,{path:'tooling-extra/file.ts'})).total,0);
  await assert.rejects(()=>ownershipMap(store,{path:'../outside'}),/traversal/);
});
test('failure signals return ambiguous candidates with facts and current freshness',async t=>{
  const {root,store}=await fixture(t);
  let result=await startHere(store,{signal:'my build failed'});
  assert.equal(result.routes.total,2);assert.equal(result.routes.ambiguous,true);assert.match(result.next,/Multiple/);
  assert.ok(result.routes.items.every(r=>r.factHints.length===1));
  await fs.writeFile(path.join(root,'tooling/contract.txt'),'command=npm run compile');
  result=await ownershipMap(store,{signal:'build'});
  assert.ok(result.items.every(r=>r.freshness.status==='needs-review'));
  assert.equal((await startHere(store,{signal:'unrecorded-signal'})).routes.total,0);
});
test('ownership navigation is paginated and does not return full facts',async t=>{
  const {store}=await fixture(t);
  const first=await ownershipMap(store,{limit:1});assert.equal(first.items.length,1);assert.equal(first.items[0].facts,undefined);
  const second=await ownershipMap(store,{limit:1,cursor:first.nextCursor});assert.notEqual(first.items[0].chapterId,second.items[0].chapterId);
  await assert.rejects(()=>ownershipMap(store,{limit:21}),/Page size/);
});
test('pillar graph derives direction and evidence references and tolerates cycles',async t=>{
  const {store}=await fixture(t);
  let graph=await pillarGraph(store);
  assert.deepEqual(graph.items.map(e=>[e.from,e.to]),[['ci','tooling'],['tooling','java']]);
  assert.deepEqual(graph.items[0].examples,[{from:'ci/overview/build',to:'tooling/overview/build'}]);
  assert.equal((await pillarGraph(store,'java')).total,1);
  const registry=await store.read();store.chapter(registry,'java/overview').facts[0].dependsOn=['ci/overview/build'];await store.persist(registry);
  graph=await pillarGraph(store);assert.equal(graph.total,3);
  await assert.rejects(()=>pillarGraph(store,'missing'),/Unknown pillar/);
});
test('tidy preview is read-only and ambiguous fact IDs require qualification',async t=>{
  const {store}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  await assert.rejects(()=>tidyPlan(store,'build'),/Ambiguous/);
  const plan=await tidyPlan(store,'tooling/overview/build',undefined,1);
  assert.equal(plan.chapters.items.length,1);assert.equal(plan.requiredChapterCount,3);
  assert.equal(plan.writesKnowledge,false);assert.equal(plan.tidyId,undefined);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
test('developer tidy corrects a fact without source drift, preserving its ID',async t=>{
  const {store}=await fixture(t);const {tidyId}=await store.requestTidy('tooling');
  const p=await store.prepare(correct(await request(store,'tooling/overview',tidyId,[])));
  assert.deepEqual((await store.commit(p.proposalId)).changedChapters,['tooling/overview']);
  const chapter=store.chapter(await store.read(),'tooling/overview');assert.equal(chapter.facts.length,1);assert.equal(chapter.facts[0].id,'build');
  await assert.rejects(async()=>store.tidyScope(tidyId,await store.read()),/Knowledge changed/);
});
test('routine touches support explicit maintenance but cannot bypass invalidation silently',async t=>{
  const {store}=await fixture(t);const input=correct(await request(store));
  const silent=structuredClone(input);delete silent.reviews.find(r=>r.chapterId==='tooling/overview').maintenance;
  await assert.rejects(()=>store.prepare(silent),/No directly touched/);
  assert.equal((await store.prepare(input)).noop,false);
  input.touchedPaths=['other/file'];await assert.rejects(()=>store.prepare(input),/relevant touched paths/);
});
test('tidy rejects unreasoned edits and stale scope receipts',async t=>{
  const {store}=await fixture(t);const {tidyId}=await store.requestTidy('tooling');
  const input=correct(await request(store,'tooling/overview',tidyId,[]));
  delete input.reviews.find(r=>r.chapterId==='tooling/overview').maintenance;
  await assert.rejects(()=>store.prepare(input),/explicit maintenance/);
  const reg=await store.read();reg.pillars[0].title='New verified title';await store.persist(reg);
  await assert.rejects(()=>store.prepare(input),/Knowledge changed/);
});
test('merge removes the duplicate and redirects its dependents in one transaction',async t=>{
  const {store}=await fixture(t);let registry=await store.read();
  const tooling=store.chapter(registry,'tooling/overview');const copy={...tooling.facts[0],id:'duplicate'};
  await store.admit('tooling/overview',[copy]);registry=await store.read();
  store.chapter(registry,'ci/overview').facts[0].dependsOn=['tooling/overview/duplicate'];await store.persist(registry);
  const {tidyId}=await store.requestTidy('tooling');const input=await request(store,'tooling/overview',tidyId,[]);
  const review=input.reviews.find(r=>r.chapterId==='tooling/overview');
  review.facts=review.facts.filter(f=>f.id!=='duplicate');review.invalidatedFactIds=['duplicate'];
  review.maintenance=[{factId:'duplicate',action:'merge',replacement:'tooling/overview/build',reason:'Both records state the same command verified in the same source.'}];
  await assert.rejects(()=>store.prepare(input),/Invalid dependency/);
  const ci=input.reviews.find(r=>r.chapterId==='ci/overview');ci.facts[0].dependsOn=['tooling/overview/build'];ci.invalidatedFactIds=['build'];
  ci.maintenance=[{factId:'build',action:'correct',reason:'Redirect the dependency to the surviving verified command fact.'}];
  const p=await store.prepare(input);await store.commit(p.proposalId);
  registry=await store.read();assert.equal(store.chapter(registry,'tooling/overview').facts.length,1);
  assert.deepEqual(store.chapter(registry,'ci/overview').facts[0].dependsOn,['tooling/overview/build']);
});
test('no-op reviews require directory README, child docs, and referenced docs verification',async t=>{
  const {root,store}=await fixture(t);
  await fs.mkdir(path.join(root,'tooling/child'));await fs.mkdir(path.join(root,'docs'));
  await fs.writeFile(path.join(root,'tooling/README.md'),'See [contract](../docs/contract.md).');
  await fs.writeFile(path.join(root,'tooling/child/README.md'),'Child contract.');
  await fs.writeFile(path.join(root,'docs/contract.md'),'Source-backed convention.');
  const input=await request(store);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  assert.ok(input.verification.documentFiles.includes('docs/contract.md'));
  assert.ok(input.verification.documentFiles.includes('tooling/child/README.md'));
  const incomplete=structuredClone(input);incomplete.verification.documentFiles=[];
  await assert.rejects(()=>store.prepare(incomplete),/Session verification required for documentFiles/);
  assert.deepEqual(await store.prepare(input),{noop:true});assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
test('missing source attestations reject a review even with valid evidence quotes',async t=>{
  const {store}=await fixture(t);const input=await request(store);input.verification.sourceFiles=[];
  await assert.rejects(()=>store.prepare(input),/Session verification required for sourceFiles/);
});
test('README changes between preparation and commit reject publication',async t=>{
  const {root,store}=await fixture(t);await fs.writeFile(path.join(root,'tooling/README.md'),'Build contract.');
  const p=await store.prepare(correct(await request(store)));
  await fs.writeFile(path.join(root,'tooling/README.md'),'Changed contract.');
  await assert.rejects(()=>store.commit(p.proposalId),/documentation changed/);
});
test('documentation links cannot follow a symlink outside the repository',async t=>{
  const {root,store}=await fixture(t);
  await fs.writeFile(path.join(root,'tooling/README.md'),'[external](../outside.md)');
  await fs.symlink('/etc/passwd',path.join(root,'outside.md'));
  await assert.rejects(()=>reviewChecklist(store,['tooling/overview'],['tooling/contract.txt']),/Symlinks/);
});
test('cleanup cannot expand into an unrelated subsystem',async t=>{
  const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'other'));await fs.writeFile(path.join(root,'other/a.txt'),'format=v1');
  await store.approveDefinitions([{id:'other',title:'Other subsystem',scope:'Independent subsystem contracts.',excludes:'Existing build contracts.',chapters:[{id:'overview',title:'Overview',scope:'Independent subsystem contracts.',excludes:'Existing build contracts.',paths:['other']}]}],'A standalone unrelated subsystem.');
  await store.seed('other/overview',[{id:'format',statement:'The other subsystem uses format v1.',evidence:[{path:'other/a.txt',quote:'format=v1'}],sourceScope:['other/a.txt'],dependsOn:[]}]);
  const input=await request(store);const other=store.chapter(await store.read(),'other/overview');
  input.reviews.push({chapterId:'other/overview',expectedRevision:1,reviewedFactIds:['format'],invalidatedFactIds:['format'],facts:[{...other.facts[0],statement:'The independent subsystem accepts format v1.'}],reason:'Attempted unrelated cleanup.',maintenance:[{factId:'format',action:'tighten',reason:'Attempt to tighten an unrelated fact outside the touched scope.'}]});
  await assert.rejects(()=>store.prepare(input),/outside the affected review scope/);
});
test('init preserves custom Start Here content and CLI tidy issues only local state',async t=>{
  const {root,store}=await fixture(t);await fs.writeFile(store.file('START_HERE.md'),'Custom team introduction.\n');
  await initialize(store);const once=await fs.readFile(store.file('START_HERE.md'),'utf8');await initialize(store);
  assert.match(once,/Custom team introduction/);assert.match(once,/My build failed/);assert.equal(await fs.readFile(store.file('START_HERE.md'),'utf8'),once);
  const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  const result=JSON.parse(execFileSync(process.execPath,[path.resolve('dist/cli.js'),'tidy','tooling','--root',root],{encoding:'utf8'}));
  assert.ok(result.tidyId);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});

test('Start Here explains bootstrap when init has not yet produced an approved registry',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-start-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new Store(root);await initialize(store);
  assert.equal((await startHere(store,{signal:'build failed'})).state,'awaiting-bootstrap');
});

test('a README added after preparation cannot silently escape review',async t=>{
  const {root,store}=await fixture(t);const p=await store.prepare(correct(await request(store)));
  await fs.writeFile(path.join(root,'tooling/README.md'),'New subsystem guidance.');
  await assert.rejects(()=>store.commit(p.proposalId),/Session verification required for documentFiles/);
});

test('a no-op tidy does not expand impact through unrelated facts in a reviewed dependency chapter',async t=>{
  const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'extra'));await fs.writeFile(path.join(root,'extra/a.txt'),'format=v1');
  await store.approveDefinitions([{id:'extra',title:'Extra subsystem',scope:'Independent subsystem contracts.',excludes:'The existing build flow.',chapters:[{id:'overview',title:'Overview',scope:'Independent subsystem contracts.',excludes:'The existing build flow.',paths:['extra']}]}],'An independent subsystem for the fixture.');
  await store.seed('extra/overview',[{id:'format',statement:'Extra uses format v1.',sourceScope:['extra/a.txt'],evidence:[{path:'extra/a.txt',quote:'format=v1'}],dependsOn:[]}]);
  const registry=await store.read();const existing=store.chapter(registry,'tooling/overview').facts[0];
  await store.admit('tooling/overview',[{...existing,id:'separate',dependsOn:['extra/overview/format']}]);
  const {tidyId}=await store.requestTidy('ci');
  assert.ok(!(await store.tidyScope(tidyId,await store.read())).includes('extra/overview'));
  const input=await request(store,'ci/overview',tidyId,[]);
  assert.deepEqual(await store.prepare(input),{noop:true});
});
