import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { commands } from '../dist/commands.js';
const cli=path.resolve('dist/cli.js');
const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:10000});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-help-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('every command supports help and -h without touching an uninitialized repository',async t=>{
 const root=await fixture(t);
 for(const command of commands)for(const flag of ['--help','-h']) {
  const result=run(root,...command.name.split(' '),flag);
  assert.equal(result.status,0,`${command.name} ${flag}: ${result.stderr}`);
  assert.match(result.stdout,/Usage: cground/);assert.match(result.stdout,/Example:/);assert.match(result.stdout,/--root/);
  assert.equal(result.stderr,'');
 }
 for(const args of [[],['help'],['--help'],['help','hook'],['hook','--help'],['help','task','assess'],['--root','/does-not-exist','help','init']]) {
  const result=run(root,...args);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Usage: cground/);
 }
 assert.deepEqual(await fs.readdir(root),[]);
});
test('invalid options, counts and values fail before any writes with useful errors',async t=>{
 const root=await fixture(t);
 for(const args of [['init','--typo'],['init','extra'],['seed'],['approve','map.json'],['init','--limit','2'],['list','--limit','2.5'],['list','--limit','21'],['check','--cleanup','maybe'],['serve','--profile','unknown'],['hook','bad'],['task','assess','id'],['list','--root'],['wat'],['check','a','b']]) {
  const result=run(root,...args);assert.equal(result.status,1,JSON.stringify(args));assert.match(result.stderr,/Common Ground:/);assert.match(result.stderr,/--help/);assert.equal(result.stdout,'');
 }
 assert.deepEqual(await fs.readdir(root),[]);
});
test('long option equals, options before commands, quoted queries and -- delimiters work',async()=>{
 const {parseCommand}=await import('../dist/commands.js');
 const parsed=parseCommand(['--root=/tmp/example','check','all','--cleanup=n','--limit=2']);assert.equal(parsed.values.root,'/tmp/example');assert.equal(parsed.command.name,'check');assert.deepEqual(parsed.positionals,['all']);
 assert.deepEqual(parseCommand(['search','--','--help']).positionals,['--help']);
 assert.deepEqual(parseCommand(['search','build pipeline']).positionals,['build pipeline']);
});
test('version/help stay independent of knowledge and MCP dependencies',async t=>{
 const root=await fixture(t);const dist=path.join(root,'dist');await fs.mkdir(dist);
 for(const name of ['cli.js','commands.js','version.js'])await fs.copyFile(path.resolve('dist',name),path.join(dist,name));
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({type:'module',version:'9.8.7-beta.6'}));
 for(const args of [['--version'],['-V'],['init','--help']]){
  const result=spawnSync(process.execPath,[path.join(dist,'cli.js'),...args],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,args[0]==='init'?/Usage: cground init/:/9.8.7-beta.6/);
 }
});
