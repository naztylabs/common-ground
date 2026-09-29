import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { validateKnowledge, tidyPlan } from '../dist/navigation.js';

const cli=path.resolve('dist/cli.js');
const command=(root,...args)=>spawnSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8'});
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-validate-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new Store(root);
 const chapters=['alpha','beta','independent'];
 for(const dir of chapters)await fs.mkdir(path.join(root,dir));
 await store.approveDefinitions(chapters.map(id=>({id,title:`${id} subsystem`,scope:`Owns ${id} runtime contracts.`,excludes:'Other systems.',chapters:[{id:'overview',title:'Overview',scope:`Defines ${id} runtime contracts.`,excludes:'Other systems.',paths:[id]}]})));
 for(const id of chapters) {
  await fs.writeFile(path.join(root,id,'contract.txt'),`mode=${id}\n`);
  await store.seed(`${id}/overview`,[{id:'mode',statement:`The ${id} subsystem declares its mode.`,sourceScope:[`${id}/contract.txt`],evidence:[{path:`${id}/contract.txt`,quote:`mode=${id}`}],dependsOn:id==='beta'?['alpha/overview/mode']:[]}]);
 }
 await fs.writeFile(path.join(root,'alpha/other.txt'),'other=true');
 await store.admit('alpha/overview',[{id:'other',statement:'The other feature is enabled.',sourceScope:['alpha/other.txt'],evidence:[{path:'alpha/other.txt',quote:'other=true'}],dependsOn:[]}]);
 return {root,store};
}

test('validate selects all, pillars, chapters, qualified facts and unique fact IDs without writes',async t=>{
 const {root,store}=await fixture(t);
 const before=await fs.readFile(store.file('knowledge.json'),'utf8'), local=await fs.readdir(store.file('local'));
 for(const [target,count] of [['all',4],['alpha',2],['alpha/overview',2],['alpha/overview/mode',1],['other',1]]) {
  const result=await validateKnowledge(store,target);assert.equal(result.valid,true);assert.equal(result.summary.selectedFacts,count);assert.equal(result.writesKnowledge,false);
 }
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
 assert.deepEqual(await fs.readdir(store.file('local')),local);
 const result=command(root,'validate');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).target,'all');
 await assert.rejects(()=>validateKnowledge(store,'mode'),/Ambiguous/);
 await assert.rejects(()=>validateKnowledge(store,'missing'),/Unknown target/);
 assert.equal(command(root,'validate','alpha','beta').status,1);
});

test('fact validation ignores stale siblings and unrelated dependents but checks upstream evidence',async t=>{
 const {root,store}=await fixture(t);
 await fs.writeFile(path.join(root,'alpha/other.txt'),'other=false');
 assert.equal((await validateKnowledge(store,'alpha/overview/mode')).valid,true);
 assert.equal((await validateKnowledge(store,'alpha')).valid,false);
 assert.equal((await validateKnowledge(store,'beta')).valid,true);
 await fs.writeFile(path.join(root,'alpha/contract.txt'),'mode=changed');
 const beta=await validateKnowledge(store,'beta/overview/mode');assert.equal(beta.valid,false);
 assert.equal(beta.summary.checkedFacts,2);assert.equal(beta.items[0].dependencyIssues[0].factId,'alpha/overview/mode');
 assert.match(beta.items[0].dependencyIssues[0].errors[0],/Evidence quote not found/);
 assert.equal((await validateKnowledge(store,'independent')).valid,true);
});

test('validation checks quotes even when source hashes and local review receipts match',async t=>{
 const {store}=await fixture(t);const reg=await store.read();
 store.chapter(reg,'alpha/overview').facts[0].evidence[0].quote='absent quote';await store.persist(reg);
 const keys=store.chapters(reg).map(c=>c.key),snapshots={};
 for(const key of keys)snapshots[key]=await store.snapshot(store.chapter(reg,key));
 await store.markReviewed(reg,keys,snapshots);
 const result=await validateKnowledge(store,'alpha/overview/mode');assert.equal(result.valid,false);
 assert.match(result.items[0].errors[0],/Evidence quote not found/);
});

test('harmless drift needs review until an existing complete local receipt acknowledges it',async t=>{
 const {root,store}=await fixture(t);await fs.appendFile(path.join(root,'alpha/contract.txt'),'# comment\n');
 assert.equal((await validateKnowledge(store,'alpha/overview/mode')).valid,false);
 const reg=await store.read(),keys=store.related(reg,'alpha/overview'),snapshots={};
 for(const key of keys)snapshots[key]=await store.snapshot(store.chapter(reg,key));
 await store.markReviewed(reg,keys,snapshots);
 const result=await validateKnowledge(store,'beta');assert.equal(result.valid,true);assert.equal(result.items[0].locallyReviewed,true);
});

test('deleted evidence and symlinks are reported without aborting other facts',async t=>{
 const {root,store}=await fixture(t);await fs.rm(path.join(root,'alpha/contract.txt'));
 await fs.rm(path.join(root,'independent/contract.txt'));await fs.symlink('../beta/contract.txt',path.join(root,'independent/contract.txt'));
 const result=await validateKnowledge(store,'all');assert.equal(result.valid,false);assert.equal(result.total,4);
 assert.ok(result.items.find(f=>f.factId==='independent/overview/mode').errors.some(e=>/Symlink/.test(e)));
 assert.ok(result.items.find(f=>f.factId==='alpha/overview/mode').errors.some(e=>/ENOENT/.test(e)));
});

test('validation summary and CLI exit cover failures beyond the current page',async t=>{
 const {root,store}=await fixture(t);const first=await validateKnowledge(store,'all',undefined,1);
 assert.equal(first.items.length,1);assert.ok(first.nextCursor);
 const second=await validateKnowledge(store,'all',first.nextCursor,1);assert.notEqual(first.items[0].factId,second.items[0].factId);
 await fs.writeFile(path.join(root,'independent/contract.txt'),'changed');
 await assert.rejects(()=>validateKnowledge(store,'all',first.nextCursor,1),/Content changed/);
 const result=command(root,'validate','all','--limit','1');assert.equal(result.status,1);
 const parsed=JSON.parse(result.stdout);assert.equal(parsed.items[0].status,'evidence-unchanged');assert.equal(parsed.valid,false);assert.equal(parsed.summary.needsReview,1);
});

test('empty registries and unpopulated chapters are explicit unsuccessful validation results',async t=>{
 const {store}=await fixture(t);const reg=await store.read();store.chapter(reg,'independent/overview').facts=[];await store.persist(reg);
 const result=await validateKnowledge(store,'independent');assert.equal(result.valid,false);assert.deepEqual(result.summary.unpopulatedChapters,['independent/overview']);
 await store.persist({schemaVersion:2,pillars:[]});assert.equal((await validateKnowledge(store)).valid,false);
 const before=await fs.readdir(store.file('local'));assert.equal((await tidyPlan(store,'all')).requiredChapterCount,0);
 assert.equal((await store.requestTidy('all')).tidyId,null);assert.deepEqual(await fs.readdir(store.file('local')),before);
});

test('invalid dependency references reject validation even outside the selected scope',async t=>{
 const {store}=await fixture(t);const reg=await store.read();store.chapter(reg,'alpha/overview').facts[0].dependsOn=['missing/chapter/fact'];
 await fs.writeFile(store.file('knowledge.json'),JSON.stringify(reg));
 await assert.rejects(()=>validateKnowledge(store,'independent'),/Invalid dependency/);
});

test('tidy all covers disconnected chapters and requires every review before atomic cleanup',async t=>{
 const {root,store}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 const first=await tidyPlan(store,'all',undefined,1);assert.equal(first.requiredChapterCount,3);assert.ok(first.chapters.nextCursor);
 const result=command(root,'tidy','all');assert.equal(result.status,0,result.stderr);const {tidyId}=JSON.parse(result.stdout);assert.ok(tidyId);
 const reg=await store.read(),keys=await store.tidyScope(tidyId,reg);assert.equal(keys.length,3);
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
 const input={chapterId:'alpha/overview',tidyId,touchedPaths:[],verification:await store.reviewFiles(reg,keys,[]),reviews:keys.map(chapterId=>{const c=store.chapter(reg,chapterId);return {chapterId,expectedRevision:c.revision,reviewedFactIds:c.facts.map(f=>f.id),invalidatedFactIds:[],facts:structuredClone(c.facts),reason:'Reviewed every fact and its current source in the synthetic fixture.'};})};
 await assert.rejects(()=>store.prepare({...input,reviews:input.reviews.slice(0,2)}),/Review every linked chapter/);
 const review=input.reviews.find(r=>r.chapterId==='independent/overview');review.facts[0].statement='The independent subsystem explicitly declares its mode.';review.invalidatedFactIds=['mode'];review.maintenance=[{factId:'mode',action:'tighten',reason:'Tighten the assertion after verifying the same exact source evidence.'}];
 const proposal=await store.prepare(input);await store.commit(proposal.proposalId);
 assert.match(await fs.readFile(store.file('local/knowledge.md'),'utf8'),/The independent subsystem explicitly declares its mode/);
 await assert.rejects(async()=>store.tidyScope(tidyId,await store.read()),/Knowledge changed/);
 await assert.rejects(()=>tidyPlan(store,'all',first.chapters.nextCursor,1),/Content changed/);
});
