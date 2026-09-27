import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../dist/store.js';
import { initialize } from '../dist/init.js';
import { listPillars, listChapters, readChapter, readFact, search } from '../dist/server.js';
const KEY='java/overview';
const definition=(id='java',paths=['app'],dependsOn=[])=>({id,title:`${id} Application`,scope:'Application contracts and behavior.',excludes:'Other responsibilities.',chapters:[{id:'overview',title:'Overview',scope:'Component contracts and behavior.',excludes:'Other components.',paths}]});
const fact=(value='v1',id='format',file='app/schema.txt')=>({id,statement:`The application accepts ${value} events.`,sourceScope:[file],dependsOn:[],evidence:[{path:file,quote:`format=${value}`} ]});
const numberedFacts=(count)=>Array.from({length:count},(_,i)=>fact('v1',`fact-${i}`));
async function fixture(t,facts=[fact()]) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/schema.txt'),'format=v1');
 const store=new Store(root);await store.approveDefinitions([definition()]);await store.seed(KEY,facts);
 return {root,store,write:value=>fs.writeFile(path.join(root,'app/schema.txt'),value)};
}
const get=async(store,key=KEY)=>store.chapter(await store.read(),key);
const review=(overrides={})=>({chapterId:KEY,expectedRevision:1,invalidatedFactIds:['format'],reviewedFactIds:['format'],facts:[fact('v2')],reason:'The authorized change replaces version v1 with v2.',...overrides});
const update=(overrides={})=>({chapterId:KEY,touchedPaths:['app/schema.txt'],reviews:[review()],...overrides});
const noop=()=>update({reviews:[review({facts:[fact()],invalidatedFactIds:[]})]});

test('freshness detects drift without rewriting shared knowledge',async t=>{const {store,write}=await fixture(t);const before=await fs.readFile(store.file('knowledge.json'),'utf8');await write('format=v1\n# comment');assert.equal((await store.status(KEY)).status,'needs-review');assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);});
test('complete no-op review updates only local validation state',async t=>{const {store,write}=await fixture(t);await write('format=v1\n# comment');const before=await fs.readFile(store.file('knowledge.json'),'utf8');assert.deepEqual(await store.prepare(noop()),{noop:true});assert.equal((await store.status(KEY)).locallyReviewed,true);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);await write('format=v1\n# changed again');assert.equal((await store.status(KEY)).status,'needs-review');});
test('changed facts commit to the existing chapter',async t=>{const {store,write}=await fixture(t);await write('format=v2');const p=await store.prepare(update());assert.deepEqual((await store.commit(p.proposalId)).changedChapters,[KEY]);assert.equal((await get(store)).revision,2);assert.equal((await get(store)).facts[0].statement,fact('v2').statement);});
test('unrelated work cannot update a fact',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare(update({touchedPaths:['other/file']})),/directly touched/);});
test('every chapter fact must be reviewed',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare(update({reviews:[review({reviewedFactIds:[]})]})),/Every existing fact/);});
test('missing evidence quote rejects preparation',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.prepare(update()),/quote not found/);});
test('routine review cannot admit new facts',async t=>{const {store,write}=await fixture(t);await write('format=v2');await assert.rejects(()=>store.prepare(update({reviews:[review({facts:[fact('v2'),fact('v2','extra')]})]})),/New facts/);});
test('source changes after preparation reject publication',async t=>{const {store,write}=await fixture(t);await write('format=v2');const p=await store.prepare(update());await write('format=v2\n# changed');await assert.rejects(()=>store.commit(p.proposalId),/Source changed/);assert.equal((await get(store)).revision,1);});
test('competing revisions cannot silently overwrite',async t=>{const {store,write}=await fixture(t);await write('format=v2');const a=await store.prepare(update()),b=await store.prepare(update());await store.commit(a.proposalId);await assert.rejects(()=>store.commit(b.proposalId),/Knowledge changed/);});
test('new pillars require developer direction and distinct ownership',async t=>{const {store}=await fixture(t);await assert.rejects(()=>store.approveDefinitions([definition('other')]),/developer approval/);await assert.rejects(()=>store.approveDefinitions([definition('other')],'Standalone responsibility'),/Overlapping ownership/);});
test('chapters reject overlapping scopes and facts reject broken dependencies',async t=>{const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'other'));await assert.rejects(()=>store.addChapters('java',[{...definition().chapters[0],id:'extra'}]),/Overlapping ownership/);await assert.rejects(()=>store.admit(KEY,[{...fact('v1','extra'),dependsOn:['missing/chapter/fact']}]),/Invalid dependency/);assert.equal((await store.read()).pillars[0].chapters.length,1);});
test('paths reject traversal, symlinks, and out-of-scope evidence',async t=>{const {root,store}=await fixture(t);await assert.rejects(()=>store.prepare(update({touchedPaths:['../secret']})),/traversal/);await assert.rejects(()=>store.prepare(update({reviews:[review({facts:[{...fact(),evidence:[{path:'other.txt',quote:'x'}]}]})]})),/outside (?:chapter|fact)/);await fs.symlink('/etc/passwd',path.join(root,'app/link'));await assert.rejects(()=>store.validateFacts({...definition().chapters[0],facts:[{...fact(),sourceScope:['app/link'],evidence:[{path:'app/link',quote:'root'}]}]}),/Symlinks/);});
test('metadata symlinks cannot redirect initialization',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cg-link-'));const outside=await fs.mkdtemp(path.join(os.tmpdir(),'cg-out-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));t.after(()=>fs.rm(outside,{recursive:true,force:true}));await fs.symlink(outside,path.join(root,'.common-ground'));await assert.rejects(()=>initialize(new Store(root)),/Symlinks/);assert.deepEqual(await fs.readdir(outside),[]);});
test('writer lock blocks concurrent mutation',async t=>{const {store}=await fixture(t);await store.lock(async()=>assert.rejects(()=>store.lock(async()=>{}),/Another writer/));});
test('deleted evidence can remove an invalidated fact',async t=>{const {root,store}=await fixture(t);await fs.rm(path.join(root,'app/schema.txt'));const p=await store.prepare(update({reviews:[review({facts:[]})]}));await store.commit(p.proposalId);assert.deepEqual((await get(store)).facts,[]);});

for(const [existing,additions] of [[50,1],[49,2],[250,100]])test(`uncapped admission: ${existing} + ${additions}`,async t=>{const {store}=await fixture(t,numberedFacts(existing));const result=await store.admit(KEY,Array.from({length:additions},(_,i)=>fact('v1',`new-${i}`)));assert.equal(result.facts.length,existing+additions);assert.deepEqual(await get(store),result);});
test('300-fact chapter supports a complete reviewed update',async t=>{const facts=numberedFacts(300);const {store,write}=await fixture(t,facts);await write('format=v1\nformat=v2');const next=[fact('v2',facts[0].id),...facts.slice(1)];const p=await store.prepare(update({reviews:[review({facts:next,reviewedFactIds:facts.map(f=>f.id),invalidatedFactIds:[facts[0].id]})]}));await store.commit(p.proposalId);assert.deepEqual((await get(store)).facts,next);});
for(const invalid of [{...fact(),statement:''},fact('v1','fact-0')])test(`invalid admission leaves large registry readable: ${invalid.id}`,async t=>{const {store}=await fixture(t,numberedFacts(51));const before=await fs.readFile(store.file('knowledge.json'),'utf8');await assert.rejects(()=>store.admit(KEY,[invalid]));assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);assert.equal((await get(store)).facts.length,51);assert.equal((await store.admit(KEY,[])).facts.length,51);});

test('chapter index has no facts and reads are paginated without evidence dumps',async t=>{const {store}=await fixture(t,numberedFacts(31));assert.equal((await listPillars(store)).items[0].chapterCount,1);const index=await listChapters(store,'java');assert.equal(index.items[0].factCount,31);assert.equal(index.items[0].facts,undefined);const first=await readChapter(store,KEY,undefined,20);assert.equal(first.facts.items.length,20);assert.equal(first.facts.items[0].evidence,undefined);const second=await readChapter(store,KEY,first.facts.nextCursor,20);assert.equal(second.facts.items.length,11);assert.equal(second.facts.nextCursor,null);assert.equal((await readFact(store,KEY,'fact-0')).fact.evidence[0].quote,'format=v1');});
test('pagination detects changed chapter revisions',async t=>{const {store}=await fixture(t,numberedFacts(21));const first=await readChapter(store,KEY);await store.admit(KEY,[fact('v1','new')]);await assert.rejects(()=>readChapter(store,KEY,first.facts.nextCursor),/Content changed/);});
test('keyword retrieval is bounded and supports Unicode',async t=>{const {store}=await fixture(t,[{...fact(),statement:'Компонент принимает события v1.'}]);assert.equal((await search(store,'Компонент',1)).length,1);assert.deepEqual(await search(store,'zzzz'),[]);await assert.rejects(()=>search(store,'v1',21),/limit/);});

for(const existingIgnore of [null,'# Existing rules\nnode_modules/\n*.log'])test(`init manages ignore file: ${existingIgnore===null?'new':'existing'}`,async t=>{const {root,store}=await fixture(t);execFileSync('git',['init','--quiet'],{cwd:root});if(existingIgnore!==null)await fs.writeFile(path.join(root,'.gitignore'),existingIgnore);await initialize(store);const first=await fs.readFile(path.join(root,'.gitignore'),'utf8');if(existingIgnore!==null)assert.ok(first.startsWith(existingIgnore));await fs.writeFile(store.file('local/test.json'),'{}');assert.equal(spawnSync('git',['check-ignore','--quiet','.common-ground/local/test.json'],{cwd:root}).status,0);assert.equal(spawnSync('git',['check-ignore','--quiet','.common-ground/knowledge.json'],{cwd:root}).status,1);await initialize(store);assert.equal(await fs.readFile(path.join(root,'.gitignore'),'utf8'),first);assert.equal(first.split('# common-ground:start').length,2);});
test('init preserves guidance and JSONC configuration',async t=>{const {root,store}=await fixture(t);await fs.writeFile(path.join(root,'AGENTS.md'),'# Existing\nKeep this.\n');await fs.mkdir(path.join(root,'.vscode'));await fs.writeFile(path.join(root,'.vscode/mcp.json'),'{\n // keep comment\n "servers":{"existing":{"command":"other"}},\n}');await initialize(store);assert.match(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),/Keep this/);assert.match(await fs.readFile(path.join(root,'.vscode/mcp.json'),'utf8'),/keep comment/);assert.equal((await initialize(store)).existingRegistry,true);});
test('malformed MCP config is not overwritten',async t=>{const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'.vscode'));await fs.writeFile(path.join(root,'.vscode/mcp.json'),'bad json');await assert.rejects(()=>initialize(store),/Invalid/);assert.equal(await fs.readFile(path.join(root,'.vscode/mcp.json'),'utf8'),'bad json');});

async function linked(t){
 const {root,store}=await fixture(t);
 for(const dir of ['base','consumer','isolated']){await fs.mkdir(path.join(root,dir));await fs.writeFile(path.join(root,dir,'schema.txt'),'format=v1');}
 const reg=await store.read();reg.pillars[0].chapters[0].facts[0].dependsOn=['base/overview/format'];
 for (const id of ['base','consumer','isolated']) {
   const def = definition(id,[id],id==='consumer'?[KEY]:[]);
   reg.pillars.push({...def,chapters:def.chapters.map(c=>({...c,revision:1,facts:[{...fact('v1','format',`${id}/schema.txt`),dependsOn:id==='consumer'?[`${KEY}/format`]:[]}],sources:{},dependencyFingerprints:{}}))});
 }
 for(const {key,chapter} of store.chapters(reg)){chapter.sources=await store.snapshot(chapter);chapter.dependencyFingerprints=store.dependencyFingerprints(reg,key);}
 await store.persist(reg);return {root,store};
}
async function linkedRequest(store){const reg=await store.read();return {chapterId:'base/overview',touchedPaths:['base/schema.txt'],reviews:store.related(reg,'base/overview').map(key=>{const c=store.chapter(reg,key);return {chapterId:key,expectedRevision:c.revision,reviewedFactIds:c.facts.map(f=>f.id),invalidatedFactIds:key==='base/overview'?['format']:[],facts:key==='base/overview'?[fact('v2','format','base/schema.txt')]:c.facts,reason:'Reviewed all facts against the changed base contract.'};})};}
test('review plan includes upstream and transitive dependent chapters, excluding unrelated ones',async t=>{const {store}=await linked(t);const plan=await store.reviewPlan(KEY);assert.deepEqual(plan.chapters.map(c=>c.chapterId),['base/overview','consumer/overview',KEY]);});
test('dependency review omission is rejected',async t=>{const {root,store}=await linked(t);await fs.writeFile(path.join(root,'base/schema.txt'),'format=v2');const r=await linkedRequest(store);r.reviews=r.reviews.filter(r=>r.chapterId==='base/overview');await assert.rejects(()=>store.prepare(r),/Review every linked chapter/);});
test('dependency transaction rewrites only invalidated chapters',async t=>{const {root,store}=await linked(t);const before=await store.read();await fs.writeFile(path.join(root,'base/schema.txt'),'format=v2');const p=await store.prepare(await linkedRequest(store));await store.commit(p.proposalId);const after=await store.read();assert.equal(store.chapter(after,'base/overview').revision,2);for(const key of [KEY,'consumer/overview','isolated/overview'])assert.deepEqual(store.chapter(after,key),store.chapter(before,key));assert.equal((await store.status(KEY)).locallyReviewed,true);});
test('dependency-caused fact changes publish atomically with their cause',async t=>{const {root,store}=await linked(t);await fs.writeFile(path.join(root,'base/schema.txt'),'format=v2');const r=await linkedRequest(store);const consumer=r.reviews.find(r=>r.chapterId===KEY);consumer.facts=[{...consumer.facts[0],statement:'The application now uses the updated base contract.'}];consumer.invalidatedFactIds=['format'];const p=await store.prepare(r);await store.commit(p.proposalId);assert.equal((await get(store)).revision,2);assert.equal((await get(store,'base/overview')).revision,2);assert.equal((await get(store,'consumer/overview')).revision,1);});
test('source drift in reviewed unchanged dependency rejects the whole transaction',async t=>{const {root,store}=await linked(t);await fs.writeFile(path.join(root,'base/schema.txt'),'format=v2');const before=await fs.readFile(store.file('knowledge.json'),'utf8');const p=await store.prepare(await linkedRequest(store));await fs.writeFile(path.join(root,'consumer/schema.txt'),'format=v1\n# changed');await assert.rejects(()=>store.commit(p.proposalId),/Source changed/);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);});
test('migration preserves all old facts and scope, and is idempotent',async t=>{const {store}=await fixture(t,numberedFacts(51));const old=await get(store);const {chapters,...boundary}=definition();const legacy={schemaVersion:1,pillars:[{...boundary,paths:old.paths,revision:old.revision,facts:old.facts.map(({sourceScope,dependsOn,...f})=>f),sources:old.sources}]};await store.atomic('knowledge.json',legacy);await assert.rejects(()=>store.read(),/migration/);assert.equal((await store.migrate()).migrated,true);const migrated=await get(store);assert.deepEqual(migrated.facts,old.facts);assert.deepEqual(migrated.sources,old.sources);assert.deepEqual(migrated.facts[0].dependsOn,[]);assert.deepEqual(await store.migrate(),{migrated:false});assert.deepEqual(JSON.parse(await fs.readFile(store.file('local/pre-v2-migration.json'),'utf8')),legacy);});
test('published schemas have no chapter fact ceiling',async()=>{const k=JSON.parse(await fs.readFile(new URL('../schemas/knowledge.schema.json',import.meta.url),'utf8'));const u=JSON.parse(await fs.readFile(new URL('../schemas/update.schema.json',import.meta.url),'utf8'));assert.equal(k.definitions.knowledge.properties.pillars.items.properties.chapters.items.properties.facts.maxItems,undefined);assert.equal(u.definitions.update.properties.reviews.items.properties.facts.maxItems,undefined);});

test('fact-level impact does not spread through unrelated facts sharing a chapter',async t=>{
 const {store}=await linked(t);const reg=await store.read();
 const unrelated={...fact('v1','separate-contract'),dependsOn:['isolated/overview/format']};
 store.chapter(reg,KEY).facts.push(unrelated);await store.persist(reg);
 const plan=await store.reviewPlan(KEY,['format']);
 assert.deepEqual(plan.chapters.map(c=>c.chapterId),['base/overview','consumer/overview',KEY]);
 assert.ok(!plan.affectedFacts.includes(`${KEY}/separate-contract`));
 assert.ok(!plan.affectedFacts.includes('isolated/overview/format'));
 assert.ok((await store.reviewPlan(KEY)).chapters.some(c=>c.chapterId==='isolated/overview'));
});
test('fact dependencies cannot dangle after deletion',async t=>{
 const {root,store}=await linked(t);await fs.rm(path.join(root,'base/schema.txt'));
 const request=await linkedRequest(store);request.reviews.find(r=>r.chapterId==='base/overview').facts=[];
 const before=await fs.readFile(store.file('knowledge.json'),'utf8');
 await assert.rejects(()=>store.prepare(request),/Invalid dependency/);
 assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});

test('seed and admission baseline newly introduced fact dependencies',async t=>{
 const {root,store}=await fixture(t);
 await fs.mkdir(path.join(root,'base'));await fs.writeFile(path.join(root,'base/schema.txt'),'format=v1');
 await store.approveDefinitions([definition('base',['base'])],'Independent base responsibility');
 await store.seed('base/overview',[{...fact('v1','base-contract','base/schema.txt'),dependsOn:[`${KEY}/format`]}]);
 assert.equal((await store.status('base/overview')).status,'evidence-unchanged');
 await store.admit(KEY,[{...fact('v1','new-contract'),dependsOn:['base/overview/base-contract']}]);
 assert.equal((await store.status(KEY)).status,'evidence-unchanged');
 assert.equal(Object.keys((await get(store)).dependencyFingerprints).length,2);
});
