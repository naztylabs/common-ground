import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../dist/store.js';
import { initialize } from '../dist/init.js';
import { search } from '../dist/server.js';
const definition={id:'java',title:'Java Application',scope:'Java application contracts and behavior.',excludes:'Reusable UI components.',paths:['app']};
const fact=(value='v1')=>({id:'format',statement:`The application accepts ${value} events.`,evidence:[{path:'app/schema.txt',quote:`format=${value}`} ]});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/schema.txt'),'format=v1\n');const store=new Store(root);await store.approveDefinitions([definition]);await store.seed('java',[fact()]);return {root,store,write:(v)=>fs.writeFile(path.join(root,'app/schema.txt'),v)};}
const update=()=>({pillarId:'java',expectedRevision:1,touchedPaths:['app/schema.txt'],invalidatedFactIds:['format'],reviewedFactIds:['format'],facts:[fact('v2')],reason:'The authorized schema change replaces v1 with v2.'});
test('freshness reflects source drift without rewriting knowledge',async t=>{const {store,write}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');assert.equal((await store.status((await store.read()).pillars[0])).status,'evidence-unchanged');await write('format=v1\n# harmless comment');assert.equal((await store.status((await store.read()).pillars[0])).status,'needs-review');assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);});
test('unchanged facts produce no write even after harmless source changes',async t=>{const {store,write}=await fixture(t);await write('format=v1\n# comment');const before=(await fs.stat(store.file('knowledge.json'))).mtimeMs;assert.deepEqual(await store.prepare({...update(),facts:[fact()]}),{noop:true});assert.equal((await fs.stat(store.file('knowledge.json'))).mtimeMs,before);});
test('verified update commits atomically',async t=>{const {store,write}=await fixture(t);await write('format=v2');const p=await store.prepare(update());const result=await store.commit(p.proposalId);assert.equal(result.revision,2);assert.equal(result.facts[0].statement,fact('v2').statement);assert.equal((await store.status(result)).status,'evidence-unchanged');});
test('unrelated work cannot update a pillar',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare({...update(),touchedPaths:['other/file']}),/directly touched/);});
test('missing evidence quote is rejected',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.prepare(update()),/quote not found/);});
test('every old fact must be reviewed',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare({...update(),reviewedFactIds:[]}),/Every existing fact/);});
test('routine updates cannot introduce new facts',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare({...update(),facts:[fact('v2'),{...fact('v2'),id:'extra'}]}),/New facts/);});
test('changed source between prepare and commit rejects commit',async t=>{const {store,write}=await fixture(t);await write('format=v2');const p=await store.prepare(update());await write('format=v2\nnew change');await assert.rejects(()=>store.commit(p.proposalId),/Source changed/);assert.equal((await store.read()).pillars[0].revision,1);});
test('competing revisions cannot silently overwrite',async t=>{const {store,write}=await fixture(t);await write('format=v2');const a=await store.prepare(update());const b=await store.prepare(update());await store.commit(a.proposalId);await assert.rejects(()=>store.commit(b.proposalId),/Knowledge changed/);});
test('new pillar requires explicit standalone explanation and no path overlap',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.approveDefinitions([{...definition,id:'another'}]),/developer approval/);await assert.rejects(()=>store.approveDefinitions([{...definition,id:'another'}],'Standalone subsystem'),/Overlapping/);});
test('evidence outside ownership and traversal are rejected',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.prepare({...update(),facts:[{...fact(),evidence:[{path:'other.txt',quote:'x'}]}]}),/outside pillar/);await assert.rejects(()=>store.prepare({...update(),touchedPaths:['../secret']}),/traversal/);});
test('symlink evidence is rejected',async t=>{const {root,store}=await fixture(t);await fs.symlink('/etc/passwd',path.join(root,'app/link'));await assert.rejects(()=>store.validateFacts({...definition,facts:[{...fact(),evidence:[{path:'app/link',quote:'root'}]}]}),/Symlinks/);});
test('init preserves guidance, JSONC comments, and existing tools; repeat is stable',async t=>{const {root,store}=await fixture(t);await fs.writeFile(path.join(root,'AGENTS.md'),'# Existing\nKeep this.\n');await fs.mkdir(path.join(root,'.vscode'));await fs.writeFile(path.join(root,'.vscode/mcp.json'),'{\n // keep comment\n "servers": {"existing":{"command":"other"}},\n}\n');await initialize(store);const first=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');assert.match(first,/Keep this/);const config=await fs.readFile(path.join(root,'.vscode/mcp.json'),'utf8');assert.match(config,/keep comment/);assert.match(config,/existing/);assert.equal((await initialize(store)).existingRegistry,true);assert.equal(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),first);});
test('malformed MCP config is not overwritten',async t=>{const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'.vscode'));await fs.writeFile(path.join(root,'.vscode/mcp.json'),'not json');await assert.rejects(()=>initialize(store),/Invalid/);assert.equal(await fs.readFile(path.join(root,'.vscode/mcp.json'),'utf8'),'not json');});
test('retrieval is bounded and includes freshness',async t=>{const {store}=await fixture(t);const found=await search(store,'events',1);assert.equal(found.length,1);assert.equal(found[0].freshness.status,'evidence-unchanged');assert.deepEqual(await search(store,'zzzz'),[]);});
test('writer lock prevents concurrent registry mutation',async t=>{const {store}=await fixture(t);await store.lock(async()=>{await assert.rejects(()=>store.lock(async()=>{}),/Another writer/);});});
test('no-op revalidation clears local drift without changing shared baseline',async t=>{const {store,write}=await fixture(t);await write('format=v1\n# comment');const before=await fs.readFile(store.file('knowledge.json'),'utf8');await store.prepare({...update(),invalidatedFactIds:[],facts:[fact()]});const state=await store.status((await store.read()).pillars[0]);assert.equal(state.status,'evidence-unchanged');assert.equal(state.locallyReviewed,true);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);await write('format=v1\n# another comment');assert.equal((await store.status((await store.read()).pillars[0])).status,'needs-review');});
test('developer admission validates all facts and rejects duplicates',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.admit('java',[fact()]),/Duplicate/);const next=await store.admit('java',[{id:'literal',statement:'The format configuration contains the literal v1.',evidence:fact().evidence}]);assert.equal(next.facts.length,2);assert.equal(next.revision,2);});
test('deleted evidence can remove an invalidated fact',async t=>{const {root,store}=await fixture(t);await fs.rm(path.join(root,'app/schema.txt'));const proposal=await store.prepare({...update(),facts:[]});const next=await store.commit(proposal.proposalId);assert.deepEqual(next.facts,[]);});
test('metadata symlinks cannot redirect initialization',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-link-'));const outside=await fs.mkdtemp(path.join(os.tmpdir(),'cground-outside-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));t.after(()=>fs.rm(outside,{recursive:true,force:true}));await fs.symlink(outside,path.join(root,'.common-ground'));await assert.rejects(()=>initialize(new Store(root)),/Symlinks/);assert.deepEqual(await fs.readdir(outside),[]);});

for (const existingIgnore of [null, '# Existing rules\nnode_modules/\n*.log']) {
  test(`init manages Git ignore rules (${existingIgnore === null ? 'new file' : 'existing file'})`, async t => {
    const { root, store } = await fixture(t);
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    if (existingIgnore !== null) await fs.writeFile(path.join(root, '.gitignore'), existingIgnore);
    await initialize(store);
    const first = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
    assert.ok(first.includes('# common-ground:start\n.common-ground/local/\n# common-ground:end'));
    if (existingIgnore !== null) assert.ok(first.startsWith(existingIgnore));
    await fs.mkdir(store.file('local/nested'), { recursive: true });
    await fs.writeFile(store.file('local/nested/review.json'), '{}');
    assert.equal(spawnSync('git', ['check-ignore', '--quiet', '.common-ground/local/nested/review.json'], { cwd: root }).status, 0);
    assert.equal(spawnSync('git', ['check-ignore', '--quiet', '.common-ground/knowledge.json'], { cwd: root }).status, 1);
    const additions = execFileSync('git', ['add', '--dry-run', '.'], { cwd: root, encoding: 'utf8' });
    assert.ok(additions.includes('.common-ground/knowledge.json'));
    assert.ok(!additions.includes('.common-ground/local/'));
    await initialize(store);
    assert.equal(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), first);
    assert.equal(first.split('# common-ground:start').length - 1, 1);
  });
}
