import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { Workflow } from '../dist/workflow.js';
import { runOperation } from '../dist/operations.js';
import { relativePath } from '../dist/model.js';
import { discover } from '../dist/discovery.js';
const definition=id=>({id,title:`${id} runtime`,scope:'Synthetic runtime contracts.',excludes:'Unrelated responsibilities.',chapters:[{id:'main',title:'Main chapter',scope:'Synthetic runtime contracts.',excludes:'Unrelated responsibilities.',paths:[`${id}/`]}]});
const fact=id=>({id:'mode',statement:'The runtime uses mode one.',sourceScope:[`${id}/`],evidence:[{path:`${id}/source.txt`,quote:'mode=one'}],dependsOn:[]});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-bootstrap-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const id of ['alpha','beta']){await fs.mkdir(path.join(root,id));await fs.writeFile(path.join(root,id,'source.txt'),'mode=one');}
 const store=new Store(root),payload={pillars:['alpha','beta'].map(definition),batches:['alpha','beta'].map(id=>({chapterId:`${id}/main`,facts:[fact(id)]}))};
 const cli=(args,input)=>spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root],{input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8',timeout:10000});
 return {root,store,payload,cli};
}
test('bootstrap validates the complete map and batch before any shared write; approval and token are mandatory',async t=>{
 const {store,payload}=await fixture(t);
 const bad=structuredClone(payload);bad.batches[1].facts[0].evidence[0].quote='missing';
 await assert.rejects(runOperation(store,'bootstrap',{...bad,dryRun:true}),/quote not found/);
 await assert.rejects(fs.access(store.file('knowledge.json')));
 await assert.rejects(fs.access(store.file('local')));
 payload.batches[0].facts[0].dependsOn=['beta/main/mode'];
 const preflight=await runOperation(store,'bootstrap',{...payload,dryRun:true});
 assert.deepEqual(preflight.sourceFileCounts,{'alpha/main':1,'beta/main':1});
 await assert.rejects(runOperation(store,'bootstrap',{...payload,preflight:preflight.preflight}),/approval/);
 await assert.rejects(runOperation(store,'bootstrap',{...payload,approved:true}),/Preflight conflict/);
 const receipt=await runOperation(store,'bootstrap',{...payload,approved:true,preflight:preflight.preflight});
 assert.equal(receipt.factCount,2);assert.equal(receipt.approved.boundaries,true);
 assert.deepEqual(store.chapter(await store.read(),'alpha/main').paths,['alpha']);
 assert.equal((await runOperation(store,'validate')).valid,true);
 await assert.rejects(runOperation(store,'bootstrap',{...payload,dryRun:true}),/absent registry/);
});
test('source and payload changes reject preflight publication without leaving a partial registry',async t=>{
 const {root,store,payload}=await fixture(t);
 const preflight=(await runOperation(store,'bootstrap',{...payload,dryRun:true})).preflight;
 await fs.appendFile(path.join(root,'beta/source.txt'),'\nchanged');
 await assert.rejects(runOperation(store,'bootstrap',{...payload,approved:true,preflight}),/Preflight conflict/);
 await assert.rejects(fs.access(store.file('knowledge.json')));
 const fresh=(await runOperation(store,'bootstrap',{...payload,dryRun:true})).preflight;
 payload.batches[0].facts[0].statement='The synthetic runtime declares mode one.';
 await assert.rejects(runOperation(store,'bootstrap',{...payload,approved:true,preflight:fresh}),/Preflight conflict/);
 await assert.rejects(fs.access(store.file('knowledge.json')));
});
test('empty-chapter batch is atomic and rejects concurrent registry changes',async t=>{
 const {store,payload}=await fixture(t);await store.approveDefinitions(payload.pillars);
 const batches=structuredClone(payload.batches);batches[1].facts[0].sourceScope=['alpha'];
 const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 await assert.rejects(runOperation(store,'seed-batch',{batches,dryRun:true}),/outside chapter/);
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
 const preflight=(await runOperation(store,'seed-batch',{batches:payload.batches,dryRun:true})).preflight;
 const changed=await store.read();changed.pillars[0].title='Changed title';await store.persist(changed);
 await assert.rejects(runOperation(store,'seed-batch',{batches:payload.batches,approved:true,preflight}),/Preflight conflict/);
 const fresh=(await runOperation(store,'seed-batch',{batches:payload.batches,dryRun:true})).preflight;
 await runOperation(store,'seed-batch',{batches:payload.batches,approved:true,preflight:fresh});
 assert.equal(store.facts(await store.read()).length,2);
});
test('cross-chapter evidence is tracked by validation, dependency freshness and task assessment',async t=>{
 const {root,store,payload}=await fixture(t);await store.approveDefinitions(payload.pillars);
 const alpha={...fact('alpha'),evidence:[{path:'beta/source.txt',quote:'mode=one'}]};
 await store.seed('alpha/main',[alpha]);
 await store.seed('beta/main',[{...fact('beta'),dependsOn:['alpha/main/mode']}]);
 assert.equal((await runOperation(store,'validate')).valid,true);
 assert.equal((await store.status('beta/main')).dependencyDrift,false);
 await fs.appendFile(path.join(root,'beta/source.txt'),'\nchanged');
 const result=await runOperation(store,'validate');assert.equal(result.valid,false);
 assert.ok(result.affected.facts.includes('alpha/main/mode'));
 assert.equal((await store.status('beta/main')).dependencyDrift,true);
 const flow=new Workflow(store),task=await flow.start();
 assert.equal((await flow.assess(task.taskId,['beta/source.txt'])).affectedFactCount,2);
 const invalid={...alpha,sourceScope:['beta']};
 await assert.rejects(store.validateFacts({paths:['alpha'],facts:[invalid]}),/outside chapter/);
});
test('large source files are streamed for freshness while oversized quotation evidence rejects the whole batch',async t=>{
 const {root,store,payload}=await fixture(t);
 await fs.writeFile(path.join(root,'alpha/dump.sql'),'x'.repeat(2_100_000));
 const preflight=await runOperation(store,'bootstrap',{...payload,dryRun:true});assert.equal(preflight.sourceFileCounts['alpha/main'],2);
 await runOperation(store,'bootstrap',{...payload,approved:true,preflight:preflight.preflight});
 await fs.appendFile(path.join(root,'alpha/dump.sql'),'changed');assert.equal((await runOperation(store,'validate')).valid,false);
 await assert.rejects(store.validateFacts({paths:['alpha'],facts:[{...fact('alpha'),evidence:[{path:'alpha/dump.sql',quote:'xxx'}]}]}),/too large/);
});
test('CLI discovers payloads, reads stdin, returns compact receipts and filters passing checks',async t=>{
 const {store,payload,cli}=await fixture(t);
 const schema=cli(['schema','seed']);assert.equal(schema.status,0,schema.stderr);assert.equal(JSON.parse(schema.stdout).cliPayloadSchema.type,'array');
 const help=cli(['seed','--help','--example']);assert.match(help.stdout,/sourceScope/);assert.match(help.stdout,/dependsOn/);
 const dry=cli(['bootstrap','--stdin','--dry-run'],payload);assert.equal(dry.status,0,dry.stderr);
 const applied=cli(['bootstrap','--stdin','--approve','--preflight',JSON.parse(dry.stdout).preflight],payload);assert.equal(applied.status,0,applied.stderr);
 const check=JSON.parse(cli(['validate','--json']).stdout);assert.equal(check.valid,true);assert.deepEqual(check.items,[]);assert.equal(check.summary.selectedFacts,2);
 assert.equal(JSON.parse(cli(['validate','--all-results','--json']).stdout).items.length,2);
 const additions=[{...fact('alpha'),id:'extra'}];
 const receipt=cli(['admit','alpha/main','--stdin','--approve'],additions);assert.equal(receipt.status,0,receipt.stderr);assert.deepEqual(JSON.parse(receipt.stdout).factIds,['alpha/main/extra']);assert.equal(JSON.parse(receipt.stdout).facts,undefined);
 const verbose=cli(['admit','alpha/main','-','--approve','--verbose'],[{...fact('alpha'),id:'third'}]);assert.equal(verbose.status,0,verbose.stderr);assert.equal(JSON.parse(verbose.stdout).facts.length,3);
 assert.equal(cli(['seed','alpha/main','payload.json','--stdin','--approve'],[]).status,1);
 assert.equal(store.facts(await store.read()).length,4);
});
test('normalization accepts directory suffixes without admitting traversal or absolute paths',()=>{
 assert.equal(relativePath.parse('src/game/'),'src/game');
 for(const input of ['/','/src/','../src/','src/../','src/./','src//child','C:/src/','src\\game'])assert.equal(relativePath.safeParse(input).success,false,input);
});
test('discovery recognizes a C++ root ahead of optional PHP and skips vendored trees',async t=>{
 const {root,store}=await fixture(t);
 await fs.writeFile(path.join(root,'CMakeLists.txt'),'project(Synthetic)');
 await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'src/main.cpp'),'int main() { return 0; }');
 await fs.mkdir(path.join(root,'registration'));await fs.writeFile(path.join(root,'registration/tool.php'),'<?php echo "optional";');
 for(const dir of ['third_party','external','deps']){
  await fs.mkdir(path.join(root,dir));await fs.writeFile(path.join(root,dir,'composer.json'),'{}');
 }
 const result=await discover(store);assert.equal(result.detections[0].chapterId,'cpp-projects/overview');
 assert.ok(result.detections[0].technologies.includes('C++'));
 assert.ok(!JSON.stringify(result.pillars).includes('third_party'));
});
test('batch preflight binds live upstream sources and permits unrelated stale evidence',async t=>{
 const {root,store,payload}=await fixture(t);await store.approveDefinitions(payload.pillars);await store.seed('alpha/main',[fact('alpha')]);
 const batches=[{chapterId:'beta/main',facts:[{...fact('beta'),dependsOn:['alpha/main/mode']}]}];
 const preflight=(await runOperation(store,'seed-batch',{batches,dryRun:true})).preflight;
 await fs.appendFile(path.join(root,'alpha/source.txt'),'\nupstream changed');
 await assert.rejects(runOperation(store,'seed-batch',{batches,approved:true,preflight}),/Preflight conflict/);
 assert.equal(store.chapter(await store.read(),'beta/main').facts.length,0);
 batches[0].facts[0].dependsOn=[];
 await fs.writeFile(path.join(root,'alpha/source.txt'),'unrelated stale quote');
 const fresh=(await runOperation(store,'seed-batch',{batches,dryRun:true})).preflight;
 await runOperation(store,'seed-batch',{batches,approved:true,preflight:fresh});
 assert.equal(store.chapter(await store.read(),'beta/main').facts.length,1);
});
test('bootstrap requires a complete batch and rejects changes during final source recheck',async t=>{
 const {root,store,payload}=await fixture(t);
 await assert.rejects(runOperation(store,'bootstrap',{...payload,batches:payload.batches.slice(0,1),dryRun:true}),/every chapter/);
 const preflight=(await runOperation(store,'bootstrap',{...payload,dryRun:true})).preflight;
 const context=store.context.bind(store);let calls=0;
 store.context=async(...args)=>{if(++calls===2)await fs.appendFile(path.join(root,'alpha/source.txt'),'\nracing writer');return context(...args);};
 await assert.rejects(runOperation(store,'bootstrap',{...payload,approved:true,preflight}),/Source changed/);
 await assert.rejects(fs.access(store.file('knowledge.json')));
});
test('discovery prioritizes first-party source before an unrecognized wide tree consumes the budget',async t=>{
 const {root,store}=await fixture(t);
 await fs.mkdir(path.join(root,'aaa-bundled'));await fs.mkdir(path.join(root,'src'));
 await fs.writeFile(path.join(root,'src/main.cpp'),'int main() {}');
 for(let i=0;i<1550;i++)await fs.writeFile(path.join(root,'aaa-bundled',`${i}.php`),'<?php');
 const scan=await discover(store);assert.equal(scan.scan.truncated,true);
 assert.ok(scan.detections.some(d=>d.technologies.includes('C++')));
 assert.ok(scan.pillars.some(p=>p.id==='cpp-projects'));
});
