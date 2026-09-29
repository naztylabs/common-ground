import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual as equal } from 'node:util';
import { page } from './paging.js';
import type { Store } from './store.js';
import type { Fact, RegistryRecord } from './model.js';
import type { z } from 'zod';

type FactRecord=z.infer<typeof Fact>;
export type FactChange={before:FactRecord|null;after:FactRecord|null;reason:string};
type Fields=Record<string,unknown>;
const evidencePaths=(fact:FactRecord|null)=>[...new Set(fact?.evidence.map(e=>e.path)??[])].sort();
const factFields=(fact:FactRecord):Fields=>({statement:fact.statement,evidence:[...fact.evidence].sort((a,b)=>a.path.localeCompare(b.path)||a.quote.localeCompare(b.quote)),sourceScope:[...fact.sourceScope].sort(),dependsOn:[...fact.dependsOn].sort()});
function changedFields(before:Fields|undefined,after:Fields|undefined) {
  return Object.fromEntries([...new Set([...Object.keys(before??{}),...Object.keys(after??{})])]
    .filter(field=>!equal(before?.[field],after?.[field]))
    .map(field=>[field,{before:before?.[field]??null,after:after?.[field]??null}]));
}
export function factReview(before:FactRecord|null,after:FactRecord|null,evidence=false) {
  const fields=changedFields(before?factFields(before):undefined,after?factFields(after):undefined);
  if(!Object.keys(fields).length)return null;
  // Exact changed quotes are available on demand; never silently omit that evidence changed.
  if(fields.evidence&&!evidence)fields.evidence={before:evidencePaths(before),after:evidencePaths(after)};
  return {change:!before?'added':!after?'removed':'updated',fields,
    evidencePaths:evidencePaths(after??before),...(fields.evidence&&!evidence?{evidenceDetails:'changed; use evidence:true or --evidence for exact quotes'}:{})};
}
function records(registry:RegistryRecord) {
  const entries=new Map<string,{kind:'pillar'|'chapter'|'fact';label:string;fields:Fields;fact?:FactRecord}>();
  for(const pillar of registry.pillars) {
    const {id,title,scope,excludes}=pillar;
    entries.set(id,{kind:'pillar',label:title,fields:{title,scope,excludes}});
    for(const chapter of pillar.chapters) {
      const key=`${id}/${chapter.id}`;
      entries.set(key,{kind:'chapter',label:`${title} / ${chapter.title}`,fields:{title:chapter.title,scope:chapter.scope,excludes:chapter.excludes,paths:[...chapter.paths].sort()}});
      for(const fact of chapter.facts)entries.set(`${key}/${fact.id}`,{kind:'fact',label:`${title} / ${chapter.title}`,fields:factFields(fact),fact});
    }
  }
  return entries;
}
export function knowledgeChanges(before:RegistryRecord,after:RegistryRecord,target='all',evidence=false) {
  const old=records(before),current=records(after),ids=[...new Set([...old.keys(),...current.keys()])];
  if(target!=='all') {
    const matches=ids.filter(id=>id===target||(id.split('/').length===3&&id.endsWith(`/${target}`)));
    if(matches.length!==1)throw new Error(matches.length?'Ambiguous target; use a qualified ID.':'Unknown target; use a pillar, chapter, fact, or all.');
    target=matches[0];
  }
  return ids.filter(id=>target==='all'||id===target||id.startsWith(`${target}/`)).sort().flatMap(id=>{
    const previous=old.get(id),next=current.get(id),entry=next??previous!;
    const change=entry.kind==='fact'?factReview(previous?.fact??null,next?.fact??null,evidence):{
      change:!previous?'added':!next?'removed':'updated',fields:changedFields(previous?.fields,next?.fields)};
    return change&&Object.keys(change.fields).length?[{kind:entry.kind,id,label:entry.label,...change}]:[];
  });
}
const exec=promisify(execFile);
const empty=():RegistryRecord=>({schemaVersion:2,pillars:[]});
/** A derived diff, not an approval, semantic validator, or another tracked knowledge file. */
export async function reviewKnowledge(store:Store,target='all',staged=false,evidence=false,cursor?:string,limit?:number) {
  let gitRoot=store.root;
  const git=async(args:string[])=>(await exec('git',['--literal-pathspecs','-C',gitRoot,...args],{maxBuffer:16*1024*1024})).stdout;
  let prefix:string;
  try {
    prefix=(await git(['rev-parse','--show-prefix'])).replace(/\r?\n$/,'');
    gitRoot=(await git(['rev-parse','--show-toplevel'])).replace(/\r?\n$/,'');
  }
  catch {throw new Error('cground review requires a Git checkout. Task completion summaries work without Git.');}
  const file=`${prefix}.common-ground/knowledge.json`;
  let head:string|undefined;
  try {head=(await git(['rev-parse','--verify','--quiet','HEAD'])).trim();}
  catch(error:any) {if(error.code!==1)throw error;}
  let before=empty(),after:RegistryRecord;
  if(head) {
    const entry=await git(['ls-tree','-z',head,'--',file]);
    if(entry) {
      if(!entry.startsWith('100644 ')&&!entry.startsWith('100755 '))throw new Error('Knowledge in HEAD must be a regular file.');
      before=store.validateRegistry(JSON.parse(await git(['show',`${head}:${file}`])));
    }
  }
  if(staged) {
    const entries=(await git(['ls-files','--stage','-z','--',file])).split('\0').filter(Boolean);
    if(entries.some(entry=>!/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry)))throw new Error('Resolve staged knowledge conflicts or unsupported file types before review.');
    after=entries.length?store.validateRegistry(JSON.parse(await git(['show',`:${file}`]))):empty();
  } else {
    try {after=await store.read();}catch(error:any) {if(error.code!=='ENOENT')throw error;after=empty();}
  }
  const items=knowledgeChanges(before,after,target,evidence);
  return {target,comparison:staged?'HEAD to staged knowledge':'HEAD to working knowledge',writesKnowledge:false,
    summary:{pillars:items.filter(i=>i.kind==='pillar').length,chapters:items.filter(i=>i.kind==='chapter').length,facts:items.filter(i=>i.kind==='fact').length},
    guidance:'Present only these changes in plain language with source links, the reason you verified, a recommendation and any uncertainty. This diff does not validate truth or establish approval. Do not ask the developer to read or edit JSON; fetch exact evidence only when needed.',
    ...page(items,cursor,limit,JSON.stringify({head,before,after,target,staged,evidence}),12000)};
}
function valueText(value:unknown) {return value===null?'(none)':Array.isArray(value)?value.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(', '):String(value);}
export function reviewText(result:Awaited<ReturnType<typeof reviewKnowledge>>) {
  if(!result.total)return 'No knowledge content changes. Revision and fingerprint-only changes are omitted.';
  const lines=[`Knowledge review — ${result.comparison}`,`${result.summary.pillars} pillar, ${result.summary.chapters} chapter, ${result.summary.facts} fact changes.`,''];
  for(const item of result.items) {
    lines.push(`${item.change.toUpperCase()} ${item.kind}: ${item.id} (${item.label})`);
    for(const [field,change] of Object.entries(item.fields))lines.push(`  ${field}: ${valueText(change.before)} → ${valueText(change.after)}`);
    if('evidencePaths' in item)lines.push(`  Source: ${item.evidencePaths.join(', ')}`);
    if('evidenceDetails' in item&&item.evidenceDetails)lines.push(`  Evidence: ${item.evidenceDetails}`);
    lines.push('');
  }
  if(result.nextCursor)lines.push(`More changes: rerun with --cursor ${result.nextCursor}`);
  lines.push('Recommended: run this review through your coding agent to verify source, explain changes, and recommend what to keep or approve. No JSON editing is needed.');
  return lines.join('\n');
}
