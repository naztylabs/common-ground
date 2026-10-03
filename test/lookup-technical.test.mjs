import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {lookup} from '../dist/access.js';
import {search} from '../dist/retrieval.js';
import {words,termMatch} from '../dist/matching.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../dist/server.js';

async function fixture(t,additional=[]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-technical-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'atlas/src'),{recursive:true});
  const records=[
    ['hierarchy','Hierarchy serialization writes child offsets.','hierarchy.ts','export function serializeHierarchy(nodes) { return nodes; }'],
    ['header','The Atlas library format validates version 1.4.','header.ts','export const formatVersion = "1.4";'],
    ['other-version','The Atlas library format validates version 1.40.','other.ts','export const formatVersion = "1.40";'],
    ...Array.from({length:7},(_,i)=>[`filler-${i}`,'The Atlas library format provides shared helpers.',`filler-${i}.ts`,'export const helper = true;']),
    ...additional,
  ];
  const facts=[];
  for(const [id,statement,name,content] of records){const file=`atlas/src/${name}`;await fs.writeFile(path.join(root,file),content);facts.push({id,statement,sourceScope:[file],evidence:[{path:file,quote:content}],dependsOn:[]});}
  const store=new Store(root);await store.approveDefinitions([{id:'atlas',title:'Atlas library',scope:'Synthetic format implementation.',excludes:'Other systems.',chapters:[{id:'runtime',title:'Runtime format',scope:'Synthetic format behavior and publication.',excludes:'Unrelated code.',paths:['atlas/src']}]}]);
  await store.seed('atlas/runtime',facts);
  return {root,store};
}
test('technical versions remain atomic and never degrade into independent numeric matches',()=>{
  assert.deepEqual(words('version 1.4 or v1.4 and 1.40'),['version','1.4','or','and','1.40']);
  for(const token of ['1.40','11.4','1.4.0','1 4','version1.40'])assert.equal(termMatch(token,'1.4'),0,token);
  for(const token of ['1.4','v1.4','version=1.4'])assert.equal(termMatch(token,'1.4'),2,token);
  assert.equal(termMatch('1.4.0-beta.2','1.4.0-beta.2'),2);assert.equal(termMatch('1.4.0-beta.20','1.4.0-beta.2'),0);
});
test('distinctive concepts outrank several repository-wide terms in lookup and legacy search',async t=>{
  const {store}=await fixture(t);const query='Atlas library format hierarchy';
  const result=await lookup(store,{query,verbose:true});assert.equal(result.items[0].factId,'atlas/runtime/hierarchy');
  assert.deepEqual(result.coverage.downweightedTerms,['atlas','library','format']);assert.equal(result.coverage.status,'direct-match');
  assert.equal((await search(store,query))[0].fact.id,'hierarchy');
});
test('exact version constraints drive relevance and absent versions yield explicit weak coverage',async t=>{
  const {store}=await fixture(t);
  const exact=await lookup(store,{query:'How does the Atlas library validate format 1.4?',verbose:true});
  assert.equal(exact.items[0].factId,'atlas/runtime/header');assert.equal(exact.coverage.status,'direct-match');
  const wrong=exact.items.find(i=>i.factId.endsWith('/other-version'));assert.ok(!wrong.matchedTerms.includes('1.4'));assert.ok(wrong.unmatchedTerms.includes('1.4'));
  const missing=await lookup(store,{query:'Atlas library format 1.9'});assert.equal(missing.summary,'No direct answer found.');assert.equal(missing.coverage.status,'weak');
  assert.equal(missing.sourceSearch.status,'not-run');assert.equal(missing.sourceSearch.operation,'source-search');assert.equal(missing.sourceSearch.args.query,'1.9');
  const generic=await lookup(store,{query:'Atlas library format'});assert.equal(generic.coverage.status,'weak');assert.ok(generic.items.every(i=>i.relevance==='weak-match'||i.relevance==='partial-query'));
});
test('literal evidence paths in query text retain direct priority and ownership alone stays weak',async t=>{
  const {store}=await fixture(t);
  for(const input of [{path:'atlas/src/header.ts'},{query:'atlas/src/header.ts'}]){
    const result=await lookup(store,input);assert.equal(result.items[0].factId,'atlas/runtime/header');assert.equal(result.coverage.status,'direct-match');
  }
  const weak=await lookup(store,{path:'atlas/src/unrecorded.ts'});assert.equal(weak.summary,'No direct answer found.');assert.equal(weak.coverage.status,'weak');
  assert.ok(weak.items.every(i=>i.relevance==='ownership-only'));
  const conflict=await lookup(store,{path:'atlas/src/header.ts',query:'hierarchy 1.9'});assert.equal(conflict.coverage.status,'weak');
  const pathConflict=await lookup(store,{path:'atlas/src/header.ts',query:'atlas/src/other.ts'});assert.equal(pathConflict.coverage.status,'weak');
  assert.equal(pathConflict.items[0].factId,'atlas/runtime/header');
});
test('weak fact-ID matches suggest their evidence paths without offering excluded source-search scopes',async t=>{
  const {store}=await fixture(t,[
    ['chunk-writing','Encoded records use buffers.','encoder.ts','export const buffers = true;'],
    ['hidden-settings','Private configuration selects behavior.','.settings','enabled=true'],
  ]);
  const hint=await lookup(store,{query:'chunk writing'});assert.equal(hint.summary,'No direct answer found.');
  assert.equal(hint.navigation.items.length,0);assert.deepEqual(hint.sourceSearch.args.paths,['atlas/src/encoder.ts']);
  const excluded=await lookup(store,{query:'hidden settings'});assert.equal(excluded.items[0].sourcePaths[0],'atlas/src/.settings');
  assert.ok(!excluded.sourceSearch.args?.paths.includes('atlas/src/.settings'));
  const manual=await lookup(store,{path:'atlas/src/.settings',query:'missing'});
  assert.equal(manual.sourceSearch.args,undefined);assert.match(manual.sourceSearch.next,/Read any excluded configuration paths directly/);
});
test('compact results carry one statement/source/relevance/freshness and verbose retains diagnostics',async t=>{
  const {store}=await fixture(t);
  const compact=await lookup(store,{query:'Atlas library format 1.9',verify:true});
  assert.deepEqual(Object.keys(compact.items[0]).sort(),['factId','freshness','relevance','sourcePaths','statement']);
  assert.deepEqual(compact.items[0].freshness,{status:'evidence-unchanged'});
  assert.equal(typeof compact.caveat,'string');assert.equal('basis' in compact,false);
  assert.equal('freshness' in compact.navigation.items[0],false);assert.equal(compact.navigation.freshness,'not-checked');
  const verbose=await lookup(store,{query:'Atlas library format 1.9',verify:true,verbose:true});
  assert.ok(verbose.items[0].matchedTerms);assert.ok(verbose.items[0].unmatchedTerms);assert.ok(verbose.items[0].queryCoverage);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(verbose).length*0.8);
  assert.ok(Object.keys(compact).indexOf('navigation')<Object.keys(compact).indexOf('items'));
});
test('coverage uses the complete ranking and pagination binds verbose mode without scanning or writing',async t=>{
  const {store}=await fixture(t);store.walk=async()=>assert.fail('lookup must not scan');store.snapshot=async()=>assert.fail('lookup must not hash');store.atomic=async()=>assert.fail('lookup must not write');
  const first=await lookup(store,{query:'Atlas library format 1.4',limit:1});
  const second=await lookup(store,{query:'Atlas library format 1.4',limit:1,cursor:first.nextCursor});
  assert.equal(first.coverage.status,'direct-match');assert.equal(second.coverage.status,first.coverage.status);
  await assert.rejects(lookup(store,{query:'Atlas library format 1.4',limit:1,cursor:first.nextCursor,verbose:true}),/Content changed/);
  const navigation=await lookup(store,{query:'publication'});assert.equal(navigation.summary,'No direct answer found.');assert.equal(navigation.items.length,0);assert.ok(navigation.navigation.items.length);
});
for(const profile of ['compact','full'])test(`${profile} MCP and CLI expose compact lookup, diagnostics and separate live source evidence`,async t=>{
  const {root,store}=await fixture(t);const [ct,st]=InMemoryTransport.createLinkedPair();
  const server=createServer(store,profile),client=new Client({name:'synthetic-technical',version:'1'});await server.connect(st);await client.connect(ct);t.after(async()=>{await client.close();await server.close();});
  const call=async(operation,args)=>{const r=await client.callTool({name:'cground',arguments:{operation,args}});assert.equal(r.isError,undefined,JSON.stringify(r));return JSON.parse(r.content[0].text);};
  const stored=await call('lookup',{query:'format 1.9'});assert.equal(stored.summary,'No direct answer found.');assert.equal(stored.sourceSearch.status,'not-run');
  assert.ok((await call('lookup',{query:'1.4',verbose:true})).items[0].matchedTerms.includes('1.4'));
  const live=await call('source-search',{query:'1.4',paths:['atlas/src']});assert.equal(live.kind,'live-source-evidence');assert.equal(live.items[0].path,'atlas/src/header.ts');assert.equal(live.items[0].line,1);
  for(const args of [['lookup','1.4','--verbose'],['source-search','1.4','--path','atlas/src']]){
    const result=spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root,'--json'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const value=JSON.parse(result.stdout);assert.ok(value.items.length);assert.equal(args[0]==='source-search'?value.kind:value.items[0].matchedTerms[0],args[0]==='source-search'?'live-source-evidence':'1.4');
  }
  const noPath=spawnSync(process.execPath,[path.resolve('dist/cli.js'),'source-search','version','--root',root,'--json'],{encoding:'utf8'});assert.equal(noPath.status,1);assert.equal(noPath.stdout,'');
});
