import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { initialize } from '../dist/init.js';
import { renderKnowledge, refreshKnowledgeExport, markdownPath } from '../dist/export.js';

const cli=path.resolve('dist/cli.js');
const run=(root,...args)=>spawnSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8'});
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new Store(root);
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/source (one).txt'),'enabled=true\n```\nquoted evidence');
 await store.approveDefinitions([{id:'app',title:'Application <overview>',scope:'Owns the application contracts.',excludes:'Other system responsibilities.',chapters:[{id:'main',title:'Main chapter',scope:'Main application behavior.',excludes:'Other chapter behavior.',paths:['app']}]}]);
 await store.seed('app/main',Array.from({length:25},(_,i)=>({id:`fact-${i}`,statement:`Fact ${i} declares the application enabled.`,sourceScope:['app/source (one).txt'],evidence:[{path:'app/source (one).txt',quote:'enabled=true\n```\nquoted evidence'}],dependsOn:[]})));
 const reg=await store.read();store.chapter(reg,'app/main').facts[24].dependsOn=['app/main/fact-0'];
 store.chapter(reg,'app/main').dependencyFingerprints=store.dependencyFingerprints(reg,'app/main');await store.persist(reg);
 return {root,store};
}

test('export includes every stored field and fact without pagination, with safe evidence fences and links',async t=>{
 const {store}=await fixture(t);const registry=await store.read();const md=renderKnowledge(registry);
 assert.match(md,/Facts: 25/);assert.match(md,/#### fact-24/);assert.match(md,/Application \\<overview\\>/);
 assert.ok(md.includes('[app/main/fact-0](#fact-app/main/fact-0)'));
 assert.ok(md.includes('(../../app/source%20%28one%29.txt)'));
 assert.ok(md.includes('````text\nenabled=true\n```\nquoted evidence\n````'));
 for(const p of registry.pillars)for(const c of p.chapters) {
  for(const value of [p.id,p.scope,p.excludes,c.id,c.title,c.scope,c.excludes,String(c.revision),...Object.values(c.sources),...Object.values(c.dependencyFingerprints)])assert.ok(md.includes(value),value);
  for(const f of c.facts)assert.ok(md.includes(f.statement));
 }
 assert.equal(md,await fs.readFile(store.file('local/knowledge.md'),'utf8'));
});

test('repeat refresh performs no rewrite, includes no drafts, and never changes shared knowledge',async t=>{
 const {store}=await fixture(t);const target=store.file('local/knowledge.md');
 const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 await fs.writeFile(store.file('local/unapproved-draft.json'),JSON.stringify({statement:'UNAPPROVED_DRAFT'}));
 await fs.utimes(target,1000000000,1000000000);const stamp=(await fs.stat(target)).mtimeMs;
 assert.equal((await refreshKnowledgeExport(store)).changed,false);assert.equal((await fs.stat(target)).mtimeMs,stamp);
 assert.doesNotMatch(await fs.readFile(target,'utf8'),/UNAPPROVED_DRAFT/);
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});

test('init creates an ignored bootstrap placeholder and approved writes replace it automatically',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-export-init-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 execFileSync('git',['init','--quiet'],{cwd:root});const store=new Store(root);
 const result=await initialize(store);assert.equal(result.markdown.path,markdownPath);
 assert.match(await fs.readFile(store.file('local/knowledge.md'),'utf8'),/No approved knowledge yet/);
 await assert.rejects(fs.access(store.file('knowledge.json')),{code:'ENOENT'});
 assert.equal(spawnSync('git',['check-ignore','--quiet',markdownPath],{cwd:root}).status,0);
 await fs.mkdir(path.join(root,'app'));
 await store.approveDefinitions([{id:'app',title:'Application',scope:'Application runtime contracts.',excludes:'Other systems.',chapters:[{id:'main',title:'Main chapter',scope:'Application runtime contracts.',excludes:'Other systems.',paths:['app']}]}]);
 const md=await fs.readFile(store.file('local/knowledge.md'),'utf8');assert.match(md,/## Application/);assert.match(md,/No facts recorded/);assert.doesNotMatch(md,/No approved knowledge yet/);
 const status=execFileSync('git',['status','--short','--untracked-files=all'],{cwd:root,encoding:'utf8'});assert.ok(!status.includes(markdownPath));
});

test('scoped CLI validate and tidy refresh the complete export even on validation failure',async t=>{
 const {root,store}=await fixture(t);await fs.rm(store.file('local/knowledge.md'));
 const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 let result=run(root,'validate','app/main/fact-0','--limit','1');assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).markdown.changed,true);
 assert.match(await fs.readFile(store.file('local/knowledge.md'),'utf8'),/#### fact-24/);
 await fs.writeFile(store.file('local/knowledge.md'),'obsolete');
 await fs.writeFile(path.join(root,'app/source (one).txt'),'changed=true');
 result=run(root,'validate','all');assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).markdown.changed,true);
 await fs.rm(store.file('local/knowledge.md'));
 result=run(root,'tidy','app/main/fact-0');assert.equal(result.status,0,result.stderr);
 assert.match(await fs.readFile(store.file('local/knowledge.md'),'utf8'),/#### fact-24/);
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});

test('invalid targets and malformed registries do not overwrite the last export',async t=>{
 const {root,store}=await fixture(t);const before=await fs.readFile(store.file('local/knowledge.md'),'utf8');
 assert.equal(run(root,'validate','missing').status,1);assert.equal(run(root,'tidy','missing').status,1);
 await fs.writeFile(store.file('knowledge.json'),'{invalid');
 await assert.rejects(()=>refreshKnowledgeExport(store));
 assert.equal(await fs.readFile(store.file('local/knowledge.md'),'utf8'),before);
});

test('export cannot follow symlinks and a cache failure cannot misreport a successful shared write',async t=>{
 const {root,store}=await fixture(t);const target=store.file('local/knowledge.md'),outside=path.join(root,'keep.txt');
 await fs.writeFile(outside,'keep');await fs.rm(target);await fs.symlink(outside,target);
 await assert.rejects(()=>refreshKnowledgeExport(store),/Symlinks/);
 const reg=await store.read();reg.pillars[0].scope='Updated application responsibility scope.';
 const warnings=[];const original=console.error;console.error=(value)=>warnings.push(value);
 try {await store.persist(reg);}finally{console.error=original;}
 assert.match(warnings.join('\n'),/knowledge saved, but Markdown export could not refresh/);
 assert.equal((await store.read()).pillars[0].scope,reg.pillars[0].scope);
 assert.equal(await fs.readFile(outside,'utf8'),'keep');
});
