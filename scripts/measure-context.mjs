// Reproducible serialized-byte measurements, not tokenizer or billing estimates.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, readKnowledge } from '../dist/server.js';
import { Store } from '../dist/store.js';
import { Workflow } from '../dist/workflow.js';
import { rules } from '../dist/guidance.js';
const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const compare=(before,after)=>({beforeBytes:before,afterBytes:after,reductionPercent:Number(((1-after/before)*100).toFixed(1))});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-context-'));
try {
  const store=new Store(root);const manifests={};
  for(const profile of ['full','compact']){
    const [a,b]=InMemoryTransport.createLinkedPair(),server=createServer(store,profile);
    await server.connect(b);const client=new Client({name:'measure-context',version:'1'});await client.connect(a);
    manifests[profile]=bytes(await client.listTools());await client.close();await server.close();
  }
  await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/contract.txt'),'format=v1');
  await store.approveDefinitions([{id:'app',title:'Application',scope:'Application contracts and formats.',excludes:'Other subsystems.',chapters:[{id:'overview',title:'Overview',scope:'Application formats and contracts.',excludes:'Other subsystems.',paths:['app']}]}]);
  const facts=Array.from({length:300},(_,i)=>({id:`format-${i}`,statement:`Application format ${i} uses v1 records.`,evidence:[{path:'app/contract.txt',quote:'format=v1'}],sourceScope:['app/contract.txt'],dependsOn:[]}));
  await store.seed('app/overview',facts);const flow=new Workflow(store),{taskId}=await flow.start(['app/contract.txt']);
  const args={kind:'chapter',target:'app/overview',evidence:true,taskId};const first=await readKnowledge(store,args),repeated=await readKnowledge(store,args);
  const replacement={...facts[0],statement:'The application specifies format 0 using v1 records.'};
  const shared={chapterId:'app/overview',touchedPaths:['app/contract.txt'],verification:{sourceFiles:['app/contract.txt'],documentFiles:[]}};
  const review={chapterId:'app/overview',expectedRevision:1,reason:'Verified the whole chapter against source read this session.',maintenance:[{factId:'format-0',action:'correct',reason:'Tightened the existing verified contract description.'}]};
  const full={...shared,reviews:[{...review,reviewedFactIds:facts.map(f=>f.id),invalidatedFactIds:['format-0'],facts:[replacement,...facts.slice(1)]}]};
  const patch={...shared,taskId,reviews:[{...review,reviewedAllFacts:true,replacements:[replacement],removeFactIds:[]}]};
  console.log(JSON.stringify({unit:'UTF-8 serialized bytes; model token costs vary',
    toolManifest:compare(manifests.full,manifests.compact),
    // Measured from generated rules immediately before introducing the quiet workflow.
    alwaysLoadedInstructions:compare(5154,bytes(rules)),
    oneCorrectionIn300Facts:compare(bytes(full),bytes(patch)),
    repeatedUnchangedChapterPage:compare(bytes(first),bytes(repeated)),
    caveat:'Whole-chapter/source review still required. Read reuse is within one task only; internal full-registry parsing and hashing remain.'},null,2));
} finally {await fs.rm(root,{recursive:true,force:true});}
