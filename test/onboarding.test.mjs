import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Store } from '../dist/store.js';
import { Workflow } from '../dist/workflow.js';
import { initialize, discover } from '../dist/init.js';
import { createServer } from '../dist/server.js';

async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-onboarding-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'*'}}));
  const store=new Store(root);
  return {root,store,flow:new Workflow(store)};
}
const cli=(root,...args)=>JSON.parse(execFileSync(process.execPath,[path.resolve('dist/cli.js'),...args,'--root',root],{encoding:'utf8'}));

test('fresh CLI onboarding explains approval, creates no task until approved, then starts normally',async t=>{
  const {root,store}=await fixture(t);
  const init=cli(root,'init','--json');
  assert.equal(init.state,'bootstrap-required');
  assert.match(init.next,/Only after approval/);
  assert.match(init.next,/cground approve .common-ground\/local\/bootstrap.json --approve/);
  await assert.rejects(()=>fs.access(store.file('knowledge.json')),{code:'ENOENT'});
  const before=await fs.readFile(store.file('local/bootstrap.json'),'utf8');
  const start=cli(root,'task','start');
  assert.equal(start.state,'bootstrap-required');
  assert.equal(start.taskId,undefined);
  assert.equal(start.proposalPath,'.common-ground/local/bootstrap.json');
  assert.deepEqual(await fs.readdir(store.file('local')),['bootstrap.json','knowledge.md']);
  assert.equal(await fs.readFile(store.file('local/bootstrap.json'),'utf8'),before);
  for(const file of ['AGENTS.md','.common-ground/START_HERE.md']) {
    const guidance=await fs.readFile(path.join(root,file),'utf8');
    assert.match(guidance,/taskId/);
  }
  assert.match(await fs.readFile(store.file('START_HERE.md'),'utf8'),/cground approve/);
  assert.throws(()=>cli(root,'approve',store.file('local/bootstrap.json')),/Developer approval required/);
  await assert.rejects(()=>fs.access(store.file('knowledge.json')),{code:'ENOENT'});
  cli(root,'approve',store.file('local/bootstrap.json'),'--approve');
  const approved=await fs.readFile(store.file('knowledge.json'),'utf8');
  assert.equal(cli(root,'init','--json').existingRegistry,true);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),approved);
  const ready=cli(root,'task','start');
  assert.ok(ready.taskId);
  assert.equal(cli(root,'task','finish',ready.taskId).notification,'none');
});

test('task startup before initialization gives recovery without filesystem writes',async t=>{
  const {root,flow}=await fixture(t);
  const response=await flow.start();
  assert.equal(response.state,'not-initialized');
  assert.equal(response.taskId,undefined);
  assert.match(response.next,/cground init/);
  assert.deepEqual(await fs.readdir(root),['package.json']);
});

test('MCP returns pending onboarding as guidance, but malformed registries remain errors',async t=>{
  const {store}=await fixture(t);await initialize(store);
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const server=createServer(store);await server.connect(serverTransport);
  const client=new Client({name:'onboarding-test',version:'1'});await client.connect(clientTransport);
  t.after(async()=>{await client.close();await server.close();});
  const response=await client.callTool({name:'task_context',arguments:{action:'start'}});
  assert.equal(response.isError,undefined);
  assert.equal(JSON.parse(response.content[0].text).state,'bootstrap-required');
  for(const content of ['invalid JSON',JSON.stringify({schemaVersion:2,pillars:'invalid'})]) {
    await fs.writeFile(store.file('knowledge.json'),content);
    const failed=await client.callTool({name:'task_context',arguments:{action:'start'}});
    assert.equal(failed.isError,true);
    assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),content);
  }
});

test('setup detection does not bypass symlink rejection',async t=>{
  const {root,store,flow}=await fixture(t);await initialize(store);
  await fs.symlink(path.join(root,'package.json'),store.file('knowledge.json'));
  await assert.rejects(()=>flow.start(),/Symlinks/);
  await fs.unlink(store.file('knowledge.json'));
  await fs.unlink(store.file('local/bootstrap.json'));
  await fs.symlink(path.join(root,'package.json'),store.file('local/bootstrap.json'));
  await assert.rejects(()=>flow.start(),/Symlinks/);
});

test('discovery excludes root and nested Vite caches from onboarding proposals',async t=>{
  const {root,store}=await fixture(t);
  for(const dir of ['.vite/deps_temp_example','app/.vite/deps']) {
    await fs.mkdir(path.join(root,dir),{recursive:true});
    await fs.writeFile(path.join(root,dir,'package.json'),'{}');
    await fs.writeFile(path.join(root,dir,'generated.js'),'export {};');
  }
  const proposal=await discover(store);
  assert.equal(proposal.detectedProjectCount,1);
  assert.equal(proposal.detections[0].root,'.');
  assert.ok(!JSON.stringify(proposal).includes('.vite/'));
});
