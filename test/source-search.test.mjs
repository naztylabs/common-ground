import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../dist/store.js';
import {SourceSearch,sourceSearch,isSourceSearchPathAllowed} from '../dist/source-search.js';

async function fixture(t,files={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-source-search-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const [file,content] of Object.entries(files)){
    await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await fs.writeFile(path.join(root,file),content);
  }
  const store=new Store(root);
  store.read=async()=>assert.fail('Source searches must not read stored knowledge');
  store.atomic=async()=>assert.fail('Source searches must not write knowledge or task state');
  store.persist=async()=>assert.fail('Source searches must not write knowledge');
  return {root,store};
}

test('live source search preserves exact versions and requires explicit bounded scopes',async t=>{
  const {store}=await fixture(t,{
    'src/header.ts':'export const headerVersion = "1.4";\nexport function validateHeader(version) { return version === headerVersion; }\n',
    'src/older.ts':'export const oldVersion = "1.40";\nconst unrelated = [1, 4];\n',
  });
  const result=await sourceSearch(store,{query:'Where is 1.4 checked?',paths:['src/']});
  assert.equal(result.kind,'live-source-evidence');assert.equal(result.writesKnowledge,false);
  assert.deepEqual(result.paths,['src']);
  assert.equal(result.items.length,1);assert.equal(result.items[0].path,'src/header.ts');assert.equal(result.items[0].line,1);
  assert.match(result.items[0].excerpt,/"1\.4"/);assert.ok(result.items[0].matchedTerms.includes('1.4'));
  assert.equal(result.scan.truncated,false);
  assert.equal(SourceSearch.parse({query:'header',paths:['src']}).limit,5);
  for(const input of [{query:'header',paths:[]},{query:' ',paths:['src']},{query:'header',paths:['src'],limit:6},{query:'header',paths:['src'],execute:true}]){
    assert.throws(()=>SourceSearch.parse(input));
  }
  await assert.rejects(sourceSearch(store,{query:'???',paths:['src']}),/technical search terms/);
});

test('source search finds chunk and node writing plus hierarchy serialization without inferring architecture',async t=>{
  const {store}=await fixture(t,{
    'src/chunk-writer.ts':'export function writeChunk(chunk) { return chunk.bytes; }\nexport function writeNode(node) { return writeChunk(node.chunk); }\n',
    'src/hierarchy.ts':'export function serializeHierarchy(nodes) { return nodes.map(serializeNode); }\n',
    'docs/format.md':'The synthetic format specification describes header validation and hierarchy serialization.\n',
  });
  const writing=await sourceSearch(store,{query:'chunk node write',paths:['src']});
  assert.equal(writing.items[0].path,'src/chunk-writer.ts');assert.equal(writing.items[0].line,2);
  const hierarchy=await sourceSearch(store,{query:'hierarchy serialization',paths:['src','docs']});
  assert.ok(hierarchy.items.some(item=>item.path==='src/hierarchy.ts'));
  assert.ok(hierarchy.items.some(item=>item.path==='docs/format.md'));
  assert.match(hierarchy.basis,/separate from stored facts/);
  assert.equal('facts' in hierarchy,false);
});

test('repository-wide terms are downweighted and shared-only lines are suppressed when distinctive evidence exists',async t=>{
  const files=Object.fromEntries(Array.from({length:6},(_,index)=>[`src/file-${index}.ts`,'// ExampleEngine repository\n']));
  files['src/file-4.ts']+='export function serializeHierarchy(nodes) { return nodes; }\n';
  const {store}=await fixture(t,files);
  const result=await sourceSearch(store,{query:'ExampleEngine hierarchy serialization',paths:['src']});
  assert.equal(result.items.length,1);assert.equal(result.items[0].path,'src/file-4.ts');assert.equal(result.items[0].line,2);
  assert.ok(result.downweightedTerms.includes('example'));assert.ok(result.downweightedTerms.includes('engine'));
  assert.equal(result.suppressedSharedTermMatches,6);
  const shared=await sourceSearch(store,{query:'ExampleEngine',paths:['src'],limit:2});
  assert.equal(shared.items.length,2);assert.equal(shared.total,6);assert.equal(shared.resultsTruncated,true);
  assert.ok(shared.items.every(item=>item.relevance==='shared-terms-only'));
});

test('exact versions remain distinctive even when every source file mentions the same version',async t=>{
  const {store}=await fixture(t,{
    'src/a.ts':'const version = "1.4";\n',
    'src/b.ts':'const version = "1.4";\n',
    'src/header.ts':'const version = "1.4";\nfunction validateHeader() {}\n',
  });
  const result=await sourceSearch(store,{query:'1.4 header',paths:['src']});
  assert.equal(result.downweightedTerms.includes('1.4'),false);
  assert.equal(result.suppressedSharedTermMatches,0);
  assert.ok(result.items.some(item=>item.path==='src/a.ts'&&item.matchedTerms.includes('1.4')));
  assert.ok(result.items.some(item=>item.path==='src/b.ts'&&item.matchedTerms.includes('1.4')));
});

test('long excerpts anchor exact versions and short token boundaries rather than earlier substrings',async t=>{
  const {store}=await fixture(t,{
    'src/versions.ts':`const oldVersion = "1.40"; ${'padding '.repeat(80)} const current = "1.4";\n`,
    'src/workflow.ts':`const special = true; ${'padding '.repeat(80)} const runCI = true;\n`,
  });
  for(const query of ['1.4','version 1.4']){
    const version=await sourceSearch(store,{query,paths:['src/versions.ts']});
    assert.match(version.items[0].excerpt,/current = "1\.4"/);
    assert.doesNotMatch(version.items[0].excerpt,/1\.40/);
  }
  const ci=await sourceSearch(store,{query:'CI',paths:['src/workflow.ts']});
  assert.match(ci.items[0].excerpt,/runCI/);assert.doesNotMatch(ci.items[0].excerpt,/special/);
});

test('pure source-search path eligibility shares traversal and exclusion rules',()=>{
  for(const file of ['src','src/','src/header.ts','.github/workflows/check.yml'])assert.equal(isSourceSearchPathAllowed(file),true,file);
  for(const file of ['../secret','/tmp/secret','.','src\\secret','.env','.env.local','src/.config/settings','.common-ground/knowledge.json','node_modules/library.js','src/generated/schema.ts','dist/main.js','src/file.generated.ts','src/file.min.js']){
    assert.equal(isSourceSearchPathAllowed(file),false,file);
  }
});

test('excluded, unsafe, hidden and symlink scopes cannot expose non-source content, while .github remains searchable',async t=>{
  const {root,store}=await fixture(t,{
    'src/header.ts':'header validation\n',
    'src/.env.production':'header secret\n',
    'src/.config/settings':'header settings\n',
    'src/node_modules/dependency.ts':'header dependency\n',
    'src/generated/header.ts':'header generated\n',
    'src/output.min.js':'header generated\n',
    '.common-ground/knowledge.json':'header stored knowledge\n',
    '.github/workflows/check.yml':'header validation job\n',
  });
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'cg-source-outside-'));
  t.after(()=>fs.rm(outside,{recursive:true,force:true}));await fs.writeFile(path.join(outside,'secret.ts'),'header outside\n');
  await fs.symlink(outside,path.join(root,'src/linked'));
  await fs.symlink(path.join(outside,'secret.ts'),path.join(root,'src/link.ts'));
  for(const unsafe of ['../secret','/tmp/secret','src/../secret','src\\secret','.','C:/secret'])await assert.rejects(sourceSearch(store,{query:'header',paths:[unsafe]}));
  for(const excluded of ['src/.env.production','src/.config','src/node_modules','src/generated','.common-ground/knowledge.json','src/output.min.js']){
    await assert.rejects(sourceSearch(store,{query:'header',paths:[excluded]}),/Excluded source-search path/);
  }
  await assert.rejects(sourceSearch(store,{query:'header',paths:['src/link.ts']}),/Symlinks/);
  await assert.rejects(sourceSearch(store,{query:'header',paths:['src/linked/secret.ts']}),/Symlinks/);
  const result=await sourceSearch(store,{query:'header',paths:['src','.github']});
  assert.deepEqual(result.items.map(item=>item.path).sort(),['.github/workflows/check.yml','src/header.ts']);
  assert.equal(result.scan.skipped.symlinks,2);assert.equal(result.scan.skipped.excluded,5);
});

test('binary and oversized files are skipped with bounded excerpts and counts',async t=>{
  const {store}=await fixture(t,{
    'src/binary.bin':Buffer.from('header\0binary'),
    'src/invalid.bin':Buffer.from([0xff,0x68,0x65,0x61,0x64,0x65,0x72]),
    'src/huge.ts':Buffer.alloc(1024*1024+1,97),
    'src/header.ts':`${'x'.repeat(400)} header validation ${'y'.repeat(500)}\n`,
  });
  const result=await sourceSearch(store,{query:'header',paths:['src']});
  assert.equal(result.items.length,1);assert.equal(result.items[0].path,'src/header.ts');
  assert.match(result.items[0].excerpt,/header validation/);assert.ok(result.items[0].excerpt.length<=302);
  assert.equal(result.scan.skipped.binary,2);assert.equal(result.scan.skipped.oversize,1);
  assert.equal(result.scan.textFiles,1);assert.ok(result.scan.bytes<2000);
});

test('repeated and overlapping paths stay deterministic and source searches leave existing files unchanged',async t=>{
  const {root,store}=await fixture(t,{
    'src/z.ts':'header validation\nheader version check\n',
    'src/a.ts':'header validation\n',
    '.common-ground/knowledge.json':'unchanged knowledge',
    '.common-ground/local/receipt.json':'unchanged receipt',
  });
  const snapshot=async()=>Object.fromEntries(await Promise.all(['src/z.ts','src/a.ts','.common-ground/knowledge.json','.common-ground/local/receipt.json'].map(async file=>[file,await fs.readFile(path.join(root,file),'utf8')])));
  const before=await snapshot();
  const first=await sourceSearch(store,{query:'header validation',paths:['src/z.ts','src','src'],limit:2});
  const second=await sourceSearch(store,{query:'header validation',paths:['src'],limit:2});
  assert.deepEqual(first,second);assert.equal(first.items[0].path,'src/a.ts');assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await fs.readdir(path.join(root,'.common-ground/local')),['receipt.json']);
  const absent=await sourceSearch(store,{query:'header',paths:['missing']});assert.equal(absent.state,'no-matches');assert.equal(absent.scan.skipped.missing,1);
});

test('file, directory-entry and byte budgets report truncation explicitly',async t=>{
  const {root,store}=await fixture(t);
  await fs.mkdir(path.join(root,'many-files'));
  await Promise.all(Array.from({length:205},(_,index)=>fs.writeFile(path.join(root,'many-files',`${String(index).padStart(4,'0')}.ts`),'header validation\n')));
  const files=await sourceSearch(store,{query:'header',paths:['many-files']});
  assert.equal(files.scan.files,files.scan.limits.files);assert.deepEqual(files.scan.reachedLimits,['files']);assert.equal(files.scan.truncated,true);
  await fs.mkdir(path.join(root,'many-entries'));
  await Promise.all(Array.from({length:2005},(_,index)=>fs.writeFile(path.join(root,'many-entries',`${index}.ts`),'header\n')));
  const entries=await sourceSearch(store,{query:'header',paths:['many-entries']});
  assert.equal(entries.scan.entries,entries.scan.limits.entries);assert.deepEqual(entries.scan.reachedLimits,['entries']);
  assert.equal(entries.items.length,0,'An incomplete directory listing must not yield filesystem-order-dependent results');
  await fs.mkdir(path.join(root,'many-bytes'));
  await Promise.all(Array.from({length:5},(_,index)=>fs.writeFile(path.join(root,'many-bytes',`${index}.ts`),`header validation\n${'x'.repeat(900_000)}`)));
  const bytes=await sourceSearch(store,{query:'header',paths:['many-bytes']});
  assert.deepEqual(bytes.scan.reachedLimits,['totalBytes']);assert.ok(bytes.scan.bytes<=bytes.scan.limits.totalBytes);assert.equal(bytes.scan.textFiles,4);
});
