import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {runOperation} from '../dist/operations.js';
import {initialize} from '../dist/init.js';
import {discover} from '../dist/discovery.js';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-feedback-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const write=async(p,text)=>{await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),text);};
 await write('src/main.ts','export const mode = 1;');await write('shared/config.ts','export const defaultMode = 1;');
 const store=new Store(root);
 const fact={id:'mode',statement:'The runtime uses mode one.',sourceScope:['src'],evidence:[{path:'src/main.ts',quote:'mode = 1'}],dependsOn:[]};
 await store.approveDefinitions([{id:'runtime',title:'Runtime contracts',scope:'Synthetic runtime contracts.',excludes:'Other responsibilities.',chapters:[{id:'main',title:'Main runtime',scope:'Synthetic runtime contracts.',excludes:'Other responsibilities.',paths:['src']}]}]);
 await store.seed('runtime/main',[fact]);
 const cli=(args,input)=>spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root],{input,encoding:'utf8',timeout:10000});
 const patch=()=>({chapterId:'runtime/main',touchedPaths:[],verification:{sourceFiles:['src/main.ts','shared/config.ts'],documentFiles:[]},reviews:[{chapterId:'runtime/main',expectedRevision:1,reviewedAllFacts:true,reason:'Restore the verified default-mode supporting citation.',replacements:[{...fact,evidence:[...fact.evidence,{path:'shared/config.ts',quote:'defaultMode = 1'}]}]}]});
 return {root,write,store,fact,cli,patch};
}
test('doctor detects old managed guidance; focused refresh preserves user text, config, hooks and registry',async t=>{
 const {root,store}=await fixture(t);await initialize(store);
 assert.equal((await runOperation(store,'doctor')).valid,true);
 const file=path.join(root,'AGENTS.md');await fs.writeFile(file,'Personal rules\n<!-- common-ground:start -->\nMandatory task workflow\n<!-- common-ground:end -->\nPersonal footer\n');
 const before=await Promise.all(['.common-ground/knowledge.json','.vscode/mcp.json'].map(f=>fs.readFile(path.join(root,f),'utf8')));
 const doctor=await runOperation(store,'doctor');assert.equal(doctor.valid,false);assert.equal(doctor.guidance.files['AGENTS.md'],'stale');
 await runOperation(store,'refresh-guidance');assert.equal((await runOperation(store,'doctor')).valid,true);
 const text=await fs.readFile(file,'utf8');assert.ok(text.startsWith('Personal rules\n'));assert.ok(text.endsWith('Personal footer\n'));assert.match(text,/stateless/);
 assert.deepEqual(await Promise.all(['.common-ground/knowledge.json','.vscode/mcp.json'].map(f=>fs.readFile(path.join(root,f),'utf8'))),before);
 const stat=await fs.stat(file);await runOperation(store,'refresh-guidance');assert.equal((await fs.stat(file)).mtimeMs,stat.mtimeMs);
 await fs.rm(store.file('POLICY.md'));assert.equal((await runOperation(store,'doctor')).guidance.files['.common-ground/POLICY.md'],'missing');
});
test('malformed guidance blocks are diagnosed and never overwritten',async t=>{
 const {root,store,write}=await fixture(t);await initialize(store);const text='<!-- common-ground:start -->\nBroken';await write('AGENTS.md',text);
 assert.equal((await runOperation(store,'doctor')).valid,false);await assert.rejects(runOperation(store,'refresh-guidance'),/Malformed managed block/);
 assert.equal(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),text);
});
test('citation-only correction accepts no touched paths, preserves identity and tracks external evidence',async t=>{
 const {root,store,patch}=await fixture(t);const before=await store.read();
 const prepared=await runOperation(store,'prepare-patch',patch());await store.commit(prepared.proposalId);
 const after=await store.read(),old=store.chapter(before,'runtime/main'),current=store.chapter(after,'runtime/main');
 assert.equal(current.revision,old.revision+1);assert.equal(current.facts[0].statement,old.facts[0].statement);assert.equal(current.facts[0].evidence.length,2);assert.ok(current.sources['shared/config.ts']);
 await fs.appendFile(path.join(root,'shared/config.ts'),'\nchanged');assert.equal((await runOperation(store,'validate')).valid,false);
});
test('citation exception rejects semantic, ownership, dependency and deletion changes without source work',async t=>{
 const {store,patch}=await fixture(t);
 for(const mutate of [f=>f.statement='The runtime uses a different default.',f=>f.sourceScope=['src/main.ts'],f=>f.dependsOn=['runtime/main/missing']]){
  const request=patch();mutate(request.reviews[0].replacements[0]);await assert.rejects(runOperation(store,'prepare-patch',request));
 }
 const removal=patch();removal.reviews[0].replacements=[];removal.reviews[0].removeFactIds=['mode'];await assert.rejects(runOperation(store,'prepare-patch',removal));
});
test('citation correction still requires a reason, whole review, verified files, exact quotes and current revision',async t=>{
 const {store,patch}=await fixture(t);
 for(const mutate of [p=>p.reviews[0].reason='',p=>p.reviews[0].reviewedAllFacts=false,p=>p.reviews[0].expectedRevision=2,p=>p.verification.sourceFiles=[],p=>p.reviews[0].replacements[0].evidence[1].quote='not present']){
  const request=patch();mutate(request);await assert.rejects(runOperation(store,'prepare-patch',request));
 }
});
test('citation publication rejects source and revision conflicts after preparation',async t=>{
 const {store,patch,write}=await fixture(t);const prepared=await runOperation(store,'prepare-patch',patch());
 await write('shared/config.ts','export const defaultMode = 1; // changed');await assert.rejects(store.commit(prepared.proposalId),/changed|conflict/i);
 const fresh=await runOperation(store,'prepare-patch',patch());const reg=await store.read();reg.pillars[0].chapters[0].revision++;await store.persist(reg);
 await assert.rejects(store.commit(fresh.proposalId),/changed|conflict/i);
});
test('JSON mode returns parseable error envelopes for malformed JSON, flags, schema, scopes and preflight',async t=>{
 const {cli,fact}=await fixture(t);
 for(const [args,input,code] of [
  [['prepare-patch','--stdin'],'{','INVALID_JSON'],
  [['lookup','--unknown'],undefined,'ERR_PARSE_ARGS_UNKNOWN_OPTION'],
  [['prepare-patch','--stdin'],'{}','INVALID_INPUT'],
  [['admit','runtime/main','--stdin','--approve'],JSON.stringify([{...fact,id:'extra',sourceScope:['shared']}]),'SOURCE_SCOPE_OUTSIDE_CHAPTER'],
  [['seed-batch','--stdin','--approve'],JSON.stringify({batches:[{chapterId:'runtime/main',facts:[fact]}]}),'OPERATION_FAILED'],
 ]){const result=cli([...args,'--json'],input);assert.equal(result.status,1);assert.equal(result.stdout,'');const error=JSON.parse(result.stderr).error;assert.equal(error.code,code);assert.ok(error.message);assert.ok(Array.isArray(error.fields));assert.ok(error.recovery);}
});
test('schema defaults to one CLI schema and exposes MCP schema only on request, with scope guidance',async t=>{
 const {store,cli}=await fixture(t);
 const compact=await runOperation(store,'schema',{operation:'read-knowledge'});assert.equal(compact.inputSchema,undefined);assert.ok(compact.cliPayloadSchema);
 const both=JSON.parse(cli(['schema','read-knowledge','--both']).stdout);assert.deepEqual(both.inputSchema,both.cliPayloadSchema);
 const seed=await runOperation(store,'schema',{operation:'seed'});assert.equal(seed.cliPayloadSchema.type,'array');assert.match(seed.cliPayloadSchema.items.properties.sourceScope.description,/Cross-chapter/);assert.match(seed.cliPayloadSchema.items.properties.evidence.items.properties.path.description,/outside/);
});
test('scan prunes bundled dependencies and tool configuration; explicit exclusions leave first-party libs intact',async t=>{
 const {write,store}=await fixture(t);
 for(const dir of ['dep','Deps','ThirdParty','.vscode','.idea','.codex','lib','libs/first','odd-bundle']){
  await write(`${dir}/package.json`,'{}');await write(`${dir}/entry.ts`,'export const synthetic = 1;');
 }
 for(let i=0;i<1505;i++)await write(`dep/vendor-${i}.cpp`,'int synthetic;');
 const scan=await discover(store,['odd-bundle/']);assert.equal(scan.scan.truncated,false);
 const paths=scan.pillars.flatMap(p=>p.chapters.flatMap(c=>c.paths));assert.ok(paths.includes('lib/entry.ts'));assert.ok(paths.includes('libs/first/entry.ts'));
 assert.ok(!paths.some(p=>/^(dep|Deps|ThirdParty|\.vscode|\.idea|\.codex|odd-bundle)\//.test(p)));assert.ok(scan.scan.skippedCount>=7);
 await assert.rejects(discover(store,['../outside']));
});
test('preflight conflicts have a specific JSON code and recovery guidance',async t=>{
 const {store,cli,fact}=await fixture(t);
 await store.addChapters('runtime',[{id:'shared',title:'Shared defaults',scope:'Synthetic shared configuration.',excludes:'Runtime implementation.',paths:['shared']}]);
 const batch={batches:[{chapterId:'runtime/shared',facts:[{...fact,sourceScope:['shared'],evidence:[{path:'shared/config.ts',quote:'defaultMode = 1'}]}]}]};
 const result=cli(['seed-batch','--stdin','--approve','--json'],JSON.stringify(batch));assert.equal(result.status,1);
 const error=JSON.parse(result.stderr).error;assert.equal(error.code,'PREFLIGHT_CONFLICT');assert.deepEqual(error.fields,['preflight']);assert.match(error.recovery,/dry-run/);
 assert.equal(store.chapter(await store.read(),'runtime/shared').facts.length,0);
});
test('citation-only changes require dependent chapter review and cannot smuggle unrelated edits',async t=>{
 const {store,patch,fact}=await fixture(t);
 await store.addChapters('runtime',[{id:'shared',title:'Shared defaults',scope:'Synthetic shared configuration.',excludes:'Runtime implementation.',paths:['shared']}]);
 await store.seed('runtime/shared',[{...fact,sourceScope:['shared'],evidence:[{path:'shared/config.ts',quote:'defaultMode = 1'}],dependsOn:['runtime/main/mode']}]);
 const request=patch();await assert.rejects(runOperation(store,'prepare-patch',request),/every linked chapter/);
 request.reviews.push({chapterId:'runtime/shared',expectedRevision:1,reviewedAllFacts:true,reason:'Verified the dependent claim and its supporting source.'});
 const prepared=await runOperation(store,'prepare-patch',request);assert.equal(prepared.noop,false);
 request.reviews[1].replacements=[{...store.chapter(await store.read(),'runtime/shared').facts[0],statement:'An unrelated semantic change is not permitted.'}];
 request.reviews[1].maintenance=[{factId:'mode',action:'correct',reason:'An unrelated semantic change is not permitted.'}];
 await assert.rejects(runOperation(store,'prepare-patch',request),/relevant touched paths/);
});
