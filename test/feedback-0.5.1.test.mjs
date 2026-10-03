import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {lookup} from '../dist/access.js';
import {search} from '../dist/retrieval.js';
import {initialize} from '../dist/init.js';
import {discover} from '../dist/discovery.js';
import {errorPayload} from '../dist/errors.js';
import {runOperation} from '../dist/operations.js';
import {words,termMatch} from '../dist/matching.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../dist/server.js';

const cli=path.resolve('dist/cli.js');
async function fixture(t,files={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-feedback-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(file,text)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);};
  for(const [file,text] of Object.entries(files))await write(file,text);
  return {root,store:new Store(root),write};
}
const chapter=(id,paths,scope='Synthetic repository responsibility.')=>({id,title:`${id} responsibility`,paths,scope,excludes:'Other responsibilities.'});
const fact=(id,statement,file,sourceScope=[file])=>({id,statement,evidence:[{path:file,quote:'synthetic=true'}],sourceScope,dependsOn:[]});
async function lookupFixture(t){
  const f=await fixture(t,{'packaging/build.toml':'synthetic=true','.github/workflows/ci.yml':'synthetic=true',
    '.github/workflows/release.yml':'synthetic=true','native/writer.hpp':'synthetic=true','native/points.hpp':'synthetic=true','tests/fixtures.txt':'synthetic=true'});
  await f.store.approveDefinitions([{id:'engineering',title:'Engineering',scope:'Build and delivery responsibilities.',excludes:'Runtime behavior.',chapters:[
    chapter('packaging',['packaging']),chapter('ci',['.github/workflows'],'CI validation and publication ownership.'),chapter('tests',['tests'])
  ]},{id:'core',title:'Core library',scope:'Synthetic runtime behavior.',excludes:'Delivery.',chapters:[chapter('io',['native'])]}]);
  await f.store.seed('engineering/packaging',[fact('python-packaging','Package builds produce distributable artifacts.','packaging/build.toml')]);
  await f.store.seed('engineering/ci',[fact('pipelines','CI runs the build and tests.','.github/workflows/ci.yml',['.github/workflows'])]);
  await f.store.seed('engineering/tests',[fact('fixtures','The build downloads test fixtures.','tests/fixtures.txt')]);
  await f.store.seed('core/io',[
    fact('node-writing','The writer accepts points or compressed data with an explicit key and optional page key; Close finalizes writing.','native/writer.hpp'),
    fact('point-packing','Points provides creation and collection access plus packing/unpacking using headers or explicit format, scale and offset.','native/points.hpp')
  ]);
  return f;
}
test('build/release lookup filters incidental CI substrings and separates source navigation',async t=>{
  const {store}=await lookupFixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  const result=await lookup(store,{query:'build packaging deployment release CI',verify:true});
  assert.equal(result.total,3);assert.equal(result.nextCursor,null);
  assert.deepEqual(new Set(result.items.slice(0,2).map(i=>i.factId.split('/').slice(0,2).join('/'))),new Set(['engineering/packaging','engineering/ci']));
  assert.ok(result.items.every(i=>i.freshness.status==='evidence-unchanged'&&i.relevance==='partial-query'));
  assert.ok(!result.items.some(i=>i.factId.startsWith('core/')));
  const route=result.navigation.items.find(i=>i.chapterId==='engineering/ci');
  assert.equal(result.navigation.kind,'ownership-navigation');assert.ok(route.paths.includes('.github/workflows/release.yml'));
  assert.equal(result.navigation.freshness,'not-checked');assert.equal(route.statement,undefined);
  assert.ok((await search(store,'CI')).every(i=>i.chapterId==='engineering/ci'));
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
test('chapter-only query hits are navigation even when no facts match and lookup never scans',async t=>{
  const {store}=await lookupFixture(t);
  store.walk=async()=>assert.fail('default lookup must not scan');store.sourceHash=async()=>assert.fail('default lookup must not hash');store.atomic=async()=>assert.fail('lookup must not write');
  const result=await lookup(store,{query:'publication'});assert.equal(result.state,'no-matches');assert.deepEqual(result.items,[]);
  assert.equal(result.navigation.items[0].chapterId,'engineering/ci');
  const release=await lookup(store,{query:'release'});assert.equal(release.items.length,0);assert.ok(release.navigation.items[0].paths.includes('.github/workflows/release.yml'));
});
test('acronyms use token boundaries across punctuation, underscores, Unicode and camel case',()=>{
  for(const text of ['CI/CD','engineering/ci/build','ci_pipeline.yml','runCIJob','CI.yml'])assert.equal(termMatch(text,'ci'),2,text);
  for(const text of ['explicit','special','city','ciudad','ci2','Приветci世界'])assert.equal(termMatch(text,'ci'),0,text);
  assert.equal(termMatch('builds','build'),1);assert.equal(termMatch('Build','build'),2);
  assert.deepEqual(words('CI ci CI/CD'),['ci','cd']);
});
test('direct topic matches outrank incidental long matches and multi-term matches lead',async t=>{
  const {store}=await lookupFixture(t);
  await store.admit('core/io',[fact('build','Build packaging is described by this synthetic example.','native/writer.hpp')]);
  const result=await lookup(store,{query:'build packaging'});
  assert.equal(result.items[0].factId,'engineering/packaging/python-packaging');
  assert.equal(result.items[1].factId,'core/io/build');
  const first=await lookup(store,{query:'build',limit:1});assert.ok(first.nextCursor);
  const second=await lookup(store,{query:'build',limit:1,cursor:first.nextCursor});assert.notEqual(first.items[0].factId,second.items[0].factId);
});
test('advisory hook permissions leave completed setup usable, with safe draft-preserving retry',async t=>{
  const {root,store}=await fixture(t,{'package.json':'{}'});execFileSync('git',['-C',root,'init','--quiet']);
  const original=fs.writeFile.bind(fs);const target=path.join(root,'.git/hooks/pre-commit');
  const mock=t.mock.method(fs,'writeFile',async(file,...args)=>{
    if(file===target)throw Object.assign(new Error(`Read-only filesystem: ${target}`),{code:'EROFS',path:target});
    return original(file,...args);
  });
  const result=await initialize(store);assert.equal(result.setup.status,'complete-with-warnings');
  assert.deepEqual(result.setup.pending,[]);assert.ok(result.setup.completed.includes('markdown'));
  assert.equal(result.setup.failed[0].step,'hook');assert.equal(result.setup.failed[0].error.code,'EROFS');
  assert.ok(result.setup.failed[0].error.fields.includes(target));assert.match(result.setup.retry,/skip-hook/);
  await fs.access(store.file('local/knowledge.md'));await assert.rejects(fs.access(store.file('knowledge.json')),{code:'ENOENT'});
  const edited='{"pillars":[],"developerDraft":"preserve exactly"}\n';await fs.writeFile(store.file('local/bootstrap.json'),edited);
  const retry=await initialize(store,{skipHook:true});assert.equal(retry.setup.status,'complete');assert.deepEqual(retry.setup.skipped,['hook']);assert.equal(retry.existingDraft,true);
  assert.equal(await fs.readFile(store.file('local/bootstrap.json'),'utf8'),edited);
  mock.mock.restore();const installed=await initialize(store);assert.equal(installed.setup.status,'complete');await fs.access(target);
});
test('fatal initialization errors report completed, failed and pending steps through CLI JSON',async t=>{
  const {root,store}=await fixture(t,{'.vscode/mcp.json':'{bad'});
  const result=spawnSync(process.execPath,[cli,'init','--root',root,'--json'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(result.stdout,'');const error=JSON.parse(result.stderr).error;
  assert.equal(error.code,'INIT_INCOMPLETE');assert.deepEqual(error.details.completed,['local-directory','registry']);
  assert.equal(error.details.failed[0].step,'mcp-validation');assert.ok(error.details.pending.includes('AGENTS.md'));assert.match(error.recovery,/Retry/);
  await assert.rejects(fs.access(store.file('knowledge.json')),{code:'ENOENT'});
});
test('mid-guidance failure identifies individual completed files and preserves underlying error',async t=>{
  const {store,root}=await fixture(t,{'.common-ground/POLICY.md':'<!-- common-ground:start -->\nmalformed'});
  await assert.rejects(initialize(store),error=>{
    const result=errorPayload(error);assert.equal(result.details.failed[0].step,'.common-ground/POLICY.md');
    assert.ok(result.details.completed.includes('AGENTS.md'));assert.ok(result.details.completed.includes('.common-ground/START_HERE.md'));
    assert.match(result.details.failed[0].error.message,/Malformed/);assert.ok(result.details.pending.includes('mcp-config'));return true;
  });
  await fs.access(path.join(root,'AGENTS.md'));
});
for(const profile of ['compact','full'])test(`${profile} MCP and CLI expose explicit hook skipping`,async t=>{
  const {root,store}=await fixture(t,{'package.json':'{}'});execFileSync('git',['-C',root,'init','--quiet']);
  const [ct,st]=InMemoryTransport.createLinkedPair();const server=createServer(store,profile),client=new Client({name:'synthetic-feedback',version:'1'});
  await server.connect(st);await client.connect(ct);t.after(async()=>{await client.close();await server.close();});
  const result=await client.callTool({name:'cground',arguments:{operation:'init',args:{skipHook:true}}});assert.equal(result.isError,undefined);
  assert.deepEqual(JSON.parse(result.content[0].text).setup.skipped,['hook']);
  const output=spawnSync(process.execPath,[cli,'init','--root',root,'--skip-hook','--json'],{encoding:'utf8'});assert.equal(output.status,0,output.stderr);
  assert.deepEqual(JSON.parse(output.stdout).setup.skipped,['hook']);await assert.rejects(fs.access(path.join(root,'.git/hooks/pre-commit')),{code:'ENOENT'});
  await fs.writeFile(path.join(root,'.vscode/mcp.json'),'{broken');
  const failed=await client.callTool({name:'cground',arguments:{operation:'init',args:{skipHook:true}}});assert.equal(failed.isError,true);
  const diagnostic=JSON.parse(failed.content[0].text).diagnostic;assert.equal(diagnostic.code,'INIT_INCOMPLETE');
  assert.equal(diagnostic.details.failed[0].step,'mcp-validation');assert.ok(diagnostic.details.pending.includes('markdown'));
});
test('large homogeneous source trees use directories and expose responsibility and delivery prompts',async t=>{
  const files={'CMakeLists.txt':'project(Synthetic)','.github/workflows/ci.yml':'name: CI','.github/workflows/release.yml':'name: release'};
  for(let i=0;i<40;i++){files[`cpp/include/header-${i}.hpp`]='// synthetic';files[`cpp/src/source-${i}.cpp`]='// synthetic';}
  files['python/interface.py']='# synthetic';files['tests/test.cpp']='// synthetic';
  const {store}=await fixture(t,files);const result=await discover(store);
  const native=result.detections.find(d=>d.chapterId==='cpp-projects/overview');assert.ok(native.directoryHints.includes('cpp'));assert.equal(native.pathsTruncated,false);
  assert.equal(result.ownershipIncomplete,false);assert.ok(!result.unclassifiedSample.some(p=>p.startsWith('cpp/')));
  assert.ok(result.responsibilityHints.some(h=>h.responsibility==='Python interface or application'));
  assert.ok(result.responsibilityHints.some(h=>h.responsibility==='Test validation and fixtures'));
  assert.ok(result.coveragePrompts[0].questions.some(q=>q.includes('published')));assert.match(native.rationale,/coarse candidate/);
  await store.approveDefinitions(result.pillars);
});
test('mixed, excluded and truncated subtrees never acquire blind parent ownership',async t=>{
  const files={'CMakeLists.txt':'project(Synthetic)','mixed/api.cpp':'// synthetic','mixed/interface.py':'# synthetic','mixed/vendor/hidden.cpp':'// excluded',
    'nested/app/package.json':'{}','nested/app/index.ts':'export {};','nested/README.md':'Unclassified responsibility.',
    'private/a.cpp':'// synthetic','private/b.cpp':'// synthetic','private/.env.local':'SYNTHETIC=true',
    'subsystem/lib.cpp':'// synthetic','subsystem/tests/a.cpp':'// synthetic'};
  const {store,write}=await fixture(t,files);let result=await discover(store);
  assert.ok(!result.detections.some(d=>d.directoryHints.some(dir=>['mixed','nested','private','subsystem'].includes(dir))));
  assert.ok(!JSON.stringify(result).includes('.env.local'));
  for(let i=0;i<1550;i++)await write(`src/file-${i}.cpp`,'// synthetic');
  result=await discover(store);assert.equal(result.scan.truncated,true);assert.equal(result.ownershipIncomplete,true);
  assert.ok(result.detections.every(d=>d.directoryHints.length===0));assert.match(result.next,/incomplete/);
});
test('bootstrap still requires declared direction and receipts never attest human content review',async t=>{
  const {store}=await fixture(t,{'app/source.txt':'synthetic=true'});
  const payload={pillars:[{id:'app',title:'Application',scope:'Synthetic runtime responsibility.',excludes:'Other systems.',chapters:[chapter('main',['app'])]}],
    batches:[{chapterId:'app/main',facts:[fact('mode','Synthetic application uses the declared mode.','app/source.txt')]}]};
  const draft=await runOperation(store,'bootstrap',{...payload,dryRun:true});assert.match(draft.next,/delegation/);
  await assert.rejects(runOperation(store,'bootstrap',{...payload,preflight:draft.preflight}),/approval/);
  const receipt=await runOperation(store,'bootstrap',{...payload,approved:true,preflight:draft.preflight});
  assert.equal(receipt.approved.declarationOnly,true);assert.equal(receipt.approved.humanReviewVerified,false);assert.equal(receipt.approved.content,draft.preflight);
});
