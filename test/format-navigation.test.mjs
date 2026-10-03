import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../dist/store.js';
import {discover} from '../dist/discovery.js';

async function fixture(t,files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-format-navigation-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const [file,content] of Object.entries(files)){
    await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await fs.writeFile(path.join(root,file),content);
  }
  return {root,store:new Store(root)};
}
const sources={'src/HeaderValidation.ts':'// synthetic source','src/ChunkWriter.ts':'// synthetic source','src/HierarchySerialization.ts':'// synthetic source'};
const formatPrompt=result=>result.coveragePrompts.find(prompt=>prompt.responsibility==='Format architecture');

test('independent implementation paths and a format specification raise only a bounded review prompt',async t=>{
  const {root,store}=await fixture(t,{'package.json':'{}',...sources,'docs/format-specification.md':'Synthetic format specification.'});
  const opened=[],open=fs.open.bind(fs);
  t.mock.method(fs,'open',async(file,...args)=>{opened.push(path.relative(root,file));return open(file,...args);});
  t.mock.method(fs,'readFile',async()=>assert.fail('filename prompts must not read source or document content'));
  store.atomic=async()=>assert.fail('discovery must not write knowledge');
  const result=await discover(store),prompt=formatPrompt(result);
  assert.ok(prompt);assert.deepEqual(new Set(prompt.paths),new Set([...Object.keys(sources),'docs/format-specification.md']));
  assert.equal(prompt.pathCount,4);assert.equal(prompt.pathsTruncated,false);
  assert.match(prompt.basis,/filenames only/);assert.match(prompt.basis,/unverified/);
  assert.ok(prompt.questions.some(question=>/one coherent format contract/.test(question)));
  assert.ok(prompt.questions.some(question=>/beyond a single query/.test(question)));
  assert.ok(prompt.questions.some(question=>/existing approved chapter/.test(question)));
  assert.ok(prompt.questions.some(question=>/developer directed/.test(question)));
  assert.deepEqual(opened,['package.json']);
  assert.ok(result.coveragePrompts.some(item=>item.responsibility==='Build and delivery'));
  assert.ok(result.pillars.every(pillar=>!pillar.id.includes('format')));
  assert.ok(result.pillars.flatMap(pillar=>pillar.chapters).every(chapter=>!chapter.id.includes('format')&&!('facts' in chapter)));
  await assert.rejects(fs.access(store.file('knowledge.json')),{code:'ENOENT'});
});

for(const [name,files] of [
  ['a single implementation role',{'src/header.ts':'// synthetic','FORMAT.md':'Synthetic specification.'}],
  ['one ambiguous implementation file',{'src/header-node-hierarchy.ts':'// synthetic','FORMAT.md':'Synthetic specification.'}],
  ['two files sharing all role words',{'src/header-node-hierarchy.ts':'// synthetic','src/header-writer-serialization.ts':'// synthetic','FORMAT.md':'Synthetic specification.'}],
  ['three files without independent role assignments',{'src/header-writer.ts':'// synthetic','src/hierarchy.ts':'// synthetic','src/serialization.ts':'// synthetic','FORMAT.md':'Synthetic specification.'}],
  ['implementation signals without a specification',sources],
  ['generic specification and README names',{...sources,'docs/specification.md':'Synthetic specification.','README.md':'Synthetic format notes.'}],
  ['suggestive directory names alone',{'src/header-node-hierarchy/a.ts':'// synthetic','src/header-node-hierarchy/b.ts':'// synthetic','src/header-node-hierarchy/c.ts':'// synthetic','FORMAT.md':'Synthetic specification.'}],
])test(`format navigation prompt does not infer architecture from ${name}`,async t=>{
  const {store}=await fixture(t,{'package.json':'{}',...files});
  assert.equal(formatPrompt(await discover(store)),undefined);
});

test('format specification directory names are narrow and explicit exclusions suppress the candidate',async t=>{
  const {store}=await fixture(t,{'package.json':'{}',...sources,'docs/format/spec.md':'Synthetic specification.'});
  assert.ok(formatPrompt(await discover(store)));
  assert.equal(formatPrompt(await discover(store,['docs/format'])),undefined);
});

test('format navigation paths stay bounded while retaining every role and its specification',async t=>{
  const files={'package.json':'{}','FORMAT.md':'Synthetic specification.',...sources};
  for(let i=0;i<12;i++)files[`src/chunk-writer-${i}.ts`]='// synthetic source';
  const {store}=await fixture(t,files),prompt=formatPrompt(await discover(store));
  assert.ok(prompt);assert.equal(prompt.pathCount,16);assert.equal(prompt.paths.length,10);assert.equal(prompt.pathsTruncated,true);
  assert.ok(prompt.paths.includes('src/HeaderValidation.ts'));
  assert.ok(prompt.paths.includes('src/HierarchySerialization.ts'));
  assert.ok(prompt.paths.includes('FORMAT.md'));
  assert.ok(prompt.paths.some(file=>/writer/i.test(file)));
});
