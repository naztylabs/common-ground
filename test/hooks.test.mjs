import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { initialize } from '../dist/init.js';
import { checkHook, hookNotifications } from '../dist/hooks.js';
import { Fact } from '../dist/model.js';

const cli=path.resolve('dist/cli.js');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'});}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-hook-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  git(root,'init','--quiet');
  git(root,'config','user.name','Synthetic Developer');git(root,'config','user.email','developer@example.test');
  await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/config.txt'),'limit=10\n');
  const store=new Store(root);
  await store.approveDefinitions([{id:'app',title:'Application',scope:'Application runtime behavior.',excludes:'Other systems.',chapters:[{id:'overview',title:'Overview',scope:'Application runtime behavior.',excludes:'Other systems.',paths:['app']}]}]);
  await store.seed('app/overview',[{id:'limit',statement:'The application limit is 10.',sourceScope:['app'],dependsOn:[],evidence:[{path:'app/config.txt',quote:'limit=10'}]}]);
  await initialize(store);
  git(root,'add','.');
  return {root,store};
}

test('facts allow useful context beyond 320 characters and enforce the new bound',()=>{
  const fact={id:'context',statement:'A'.repeat(2000),sourceScope:['app'],dependsOn:[],evidence:[{path:'app/config.txt',quote:'limit=10'}]};
  assert.equal(Fact.parse(fact).statement.length,2000);
  assert.equal(Fact.safeParse({...fact,statement:'A'.repeat(2001)}).success,false);
});

test('init installs an executable advisory hook by default, idempotently',async t=>{
  const {root,store}=await fixture(t);
  const hook=path.join(root,'.git/hooks/pre-commit');const before=await fs.readFile(hook,'utf8');
  assert.match(before,/cground hook check/);assert.ok((await fs.stat(hook)).mode & 0o111);
  await initialize(store);assert.equal(await fs.readFile(hook,'utf8'),before);
  const result=execFileSync(process.execPath,[cli,'init','--root',root],{encoding:'utf8'});
  assert.match(result,/Review the knowledge before sharing/);assert.match(result,/\[.common-ground\/knowledge.json\]/);
  assert.ok(result.length<700);assert.doesNotMatch(result,/"pillars"/);
});

test('staged source is checked independently of unstaged fixes and notifications are locally mutable',async t=>{
  const {root,store}=await fixture(t);
  assert.match(await checkHook(store),/Ready to make these facts available to the team/);
  // Stage drift, then restore only the working tree. The hook must still see drift.
  await fs.writeFile(path.join(root,'app/config.txt'),'limit=20\n');git(root,'add','app/config.txt');
  await fs.writeFile(path.join(root,'app/config.txt'),'limit=10\n');
  const registry=await fs.readFile(store.file('knowledge.json'),'utf8');
  assert.match(await checkHook(store),/app\/overview: evidence needs review/);
  await hookNotifications(store,false);assert.equal(await checkHook(store),'');
  await initialize(store);assert.equal(await checkHook(store),'');
  await hookNotifications(store,true);assert.match(await checkHook(store),/evidence needs review/);
  assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),registry);
  assert.equal(await fs.readFile(path.join(root,'app/config.txt'),'utf8'),'limit=10\n');
  assert.equal(git(root,'show',':app/config.txt'),'limit=20\n');
});

test('a real git commit succeeds with stale knowledge and emits the reminder',async t=>{
  const {root}=await fixture(t);
  const bin=path.join(root,'bin');await fs.mkdir(bin);
  const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  await fs.writeFile(path.join(bin,'cground'),`#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(cli)} "$@"\n`,{mode:0o755});
  await fs.writeFile(path.join(root,'app/config.txt'),'limit=20\n');git(root,'add','app/config.txt');
  const commit=spawnSync('git',['commit','-m','Synthetic change'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`}});
  assert.equal(commit.status,0,commit.stderr);assert.match(commit.stderr,/evidence needs review/);assert.match(commit.stderr,/Commit allowed/);
});

test('existing hooks and custom hook managers are preserved with integration guidance',async t=>{
  const {root,store}=await fixture(t);
  const hook=path.join(root,'.git/hooks/pre-commit');await fs.writeFile(hook,'#!/bin/sh\nexit 0\n');
  assert.match((await initialize(store)).hook,/Existing pre-commit hook preserved/);
  assert.equal(await fs.readFile(hook,'utf8'),'#!/bin/sh\nexit 0\n');
  git(root,'config','core.hooksPath','.husky/_');
  assert.match((await initialize(store)).hook,/Existing hook manager preserved/);
  assert.equal(git(root,'config','--get','core.hooksPath').trim(),'.husky/_');
});

test('fresh init points to the proposal and does not pretend knowledge already exists',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-init-output-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const output=execFileSync(process.execPath,[cli,'init','--root',root],{encoding:'utf8'});
  assert.match(output,/bootstrap.json/);assert.match(output,/knowledge.json/);assert.match(output,/not created yet/);
  assert.ok(output.length<800);await assert.rejects(fs.access(path.join(root,'.common-ground/knowledge.json')));
});

test('staged checks do not execute checkout filters or follow metadata symlinks',async t=>{
  const {root,store}=await fixture(t);
  await fs.writeFile(path.join(root,'.gitattributes'),'app/config.txt filter=synthetic\n');
  git(root,'config','filter.synthetic.clean','cat');
  git(root,'config','filter.synthetic.smudge','touch filter-ran; cat');
  git(root,'config','filter.synthetic.required','true');
  git(root,'add','.gitattributes');
  assert.doesNotMatch(await checkHook(store),/could not complete/);
  await assert.rejects(fs.access(path.join(root,'filter-ran')));
  // A staged metadata symlink must never redirect temporary-state cleanup into the checkout.
  git(root,'rm','-r','--cached','.common-ground');
  await fs.rename(store.file(''),path.join(root,'saved-knowledge'));
  await fs.symlink(path.join(root,'saved-knowledge'),path.join(root,'.common-ground'));
  await fs.writeFile(path.join(root,'saved-knowledge/local/keep'),'keep');
  git(root,'add','.common-ground');
  assert.match(await checkHook(store),/could not complete/);
  assert.equal(await fs.readFile(path.join(root,'saved-knowledge/local/keep'),'utf8'),'keep');
});
