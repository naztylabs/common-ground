#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseCommand, helpText, type Values } from './commands.js';
import { version } from './version.js';
import type { checkKnowledge, startTidy } from './maintenance.js';
import type { initialize } from './init.js';

type CheckResult = Awaited<ReturnType<typeof checkKnowledge>>;
const list = (value:string|boolean|undefined) => value ? String(value).split(',') : [];
async function json(file:string) {
  try { return JSON.parse(await fs.readFile(path.resolve(file),'utf8')); }
  catch(error) { throw new Error(`Cannot read JSON from ${file}: ${(error as Error).message}`); }
}
// Adapt shell arguments to the same structured operations used by MCP.
async function input(name:string, args:string[], values:Values):Promise<unknown> {
  const [first,second,third]=args;
  const paging={cursor:values.cursor,limit:values.limit===undefined?undefined:Number(values.limit)};
  switch(name) {
    case 'approve': return {pillars:(await json(first)).pillars,approved:values.approve,standaloneReason:values['standalone-reason']};
    case 'approve-chapters': return {pillarId:first,chapters:(await json(second)).chapters,approved:values.approve};
    case 'seed': case 'admit': return {chapterId:first,facts:await json(second),approved:values.approve};
    case 'migrate': return {approved:values.approve};
    case 'task start': return {paths:list(values.touched),signal:values.signal};
    case 'task assess': return {taskId:first,paths:list(values.touched),...paging};
    case 'task finish': return {taskId:first,...paging};
    case 'read-knowledge': case 'prepare-patch': case 'prepare': return json(first);
    case 'propose-facts': return {taskId:first,chapterId:second,facts:await json(third)};
    case 'drop-facts': return {taskId:first,factKeys:args.slice(1)};
    case 'accept-facts': return {taskId:first,review:await json(second),approved:values.approve};
    case 'start': case 'owners': return {path:values.path,signal:values.signal??(args.join(' ')||undefined),...paging};
    case 'graph': return {pillarId:first,...paging};
    case 'check': case 'validate': return {target:first??'all',cleanup:String(values.cleanup).toLowerCase()==='y',...paging};
    case 'tidy': return {target:first,...paging};
    case 'review-checklist': return {chapterIds:args,touchedPaths:list(values.touched),...paging};
    case 'list': return paging;
    case 'chapters': return {pillarId:first,...paging};
    case 'read': return {chapterId:first,...paging};
    case 'fact': return {chapterId:first,factId:second};
    case 'review-plan': return {chapterId:first,factIds:values.facts===undefined?undefined:list(values.facts)};
    case 'search': return {query:args.join(' '),chapterId:values.chapter,limit:paging.limit};
    case 'commit': return {proposalId:first};
    default: return {};
  }
}
function initText(result:Awaited<ReturnType<typeof initialize>>, root:string) {
  const link=(file:string)=>`[${file}](${path.resolve(root,file)})`;
  return ['Common Ground initialized.',result.hook,
    'existingRegistry' in result
      ? `Review the knowledge before sharing: ${link('.common-ground/knowledge.json')}`
      : `Review the proposed map with your agent: ${link('.common-ground/local/bootstrap.json')}\nAfter approval and population, review ${link('.common-ground/knowledge.json')} before sharing (not created yet).`,
    `Local Markdown: ${link(result.markdown.path)}`].join('\n');
}
function checkText(result:CheckResult) {
  const lines=[`${result.target}: ${result.valid?'knowledge checks passed':'knowledge needs review'}.`,
    `${result.summary.selectedFacts} selected facts; ${result.summary.needsReview} need review.`];
  if(result.summary.unpopulatedChapters.length)lines.push(`Empty chapters: ${result.summary.unpopulatedChapters.join(', ')}. Complete approved setup with your agent.`);
  if(!result.summary.selectedFacts)lines.push('No facts recorded. Complete setup with your agent.');
  if(result.cleanup)lines.push(`Cleanup plan: ${result.cleanup.tidyId}`, 'Ask your agent to review the affected source and apply verified corrections.');
  lines.push(`Review: .common-ground/knowledge.json`, `Markdown: ${result.markdown.path}`);
  return lines.join('\n');
}
async function main() {
  const parsed=parseCommand(process.argv.slice(2));
  if(parsed.help) { console.log(helpText(parsed.command,parsed.group)); return; }
  const {command,values,positionals}=parsed;
  if(!command) { console.log(values.json?JSON.stringify({version}):version); return; }
  if(command.flags.includes('approve') && values.approve!==true)throw new Error('Developer approval required: inspect the proposal, then pass --approve.');
  const root=String(values.root??process.cwd());
  const {Store}=await import('./store.js');
  const store=new Store(root);
  if(command.name==='serve') { const {serve}=await import('./server.js'); await serve(store,values.profile as string|undefined); return; }
  const {runOperation}=await import('./operations.js');
  let output=await runOperation(store,command.operation,await input(command.name,positionals,values));
  if(['check','validate'].includes(command.name)) {
    let result=output as CheckResult;
    if(result.cleanupPrompt) {
      const {staleMessage,checkKnowledge}=await import('./maintenance.js');
      console.error(staleMessage(result));
      console.error('Source drift requires review; it does not prove the stored claim is false.');
      if(values.cleanup===undefined && process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY && !values.json) {
        const prompt=createInterface({input:process.stdin,output:process.stderr});
        let answer:string;try {answer=await prompt.question('Start automatic cleanup? [y/N] ');}finally {prompt.close();}
        if(['y','yes'].includes(answer.trim().toLowerCase()))result=await checkKnowledge(store,result.target,true,values.cursor as string|undefined,values.limit===undefined?undefined:Number(values.limit),result.affected);
      } else if(values.cleanup===undefined)console.error('Start automatic cleanup? Use --cleanup y or --cleanup n (agent verification required).');
    }
    if(!result.valid)process.exitCode=1;
    output=process.stdout.isTTY&&!values.json?checkText(result):result;
  }
  if(command.name==='doctor' && !(output as {valid:boolean}).valid)process.exitCode=1;
  if(process.stdout.isTTY && !values.json) {
    if(command.name==='doctor') {
      const result=output as {valid:boolean;registryError?:string};
      const missing=Object.entries(result).filter(([,value])=>value==='missing').map(([file])=>file);
      output=result.valid?'Common Ground setup checks passed.':`Common Ground setup needs attention.\n${missing.map(file=>`Missing: ${file}`).join('\n')}${result.registryError?`\nRegistry: ${result.registryError}`:''}\nRun cground init to refresh setup, then review any registry errors with your agent.`;
    }
    if(command.name==='export') {const result=output as {path:string;changed:boolean};output=`Markdown ${result.changed?'refreshed':'already current'}: ${path.resolve(root,result.path)}`;}
    if(command.name==='tidy') {
      const result=output as Awaited<ReturnType<typeof startTidy>>;
      output=[`Cleanup scope: ${result.target} (${result.requiredChapterCount} chapters).`,...result.chapters.items.map(chapter=>`  ${chapter.chapterId}`),...('tidyId' in result&&result.tidyId?[`Tidy ID: ${result.tidyId}`]:[]),...(result.chapters.nextCursor?[`More chapters: rerun with --cursor ${result.chapters.nextCursor}`]:[]),'Ask your agent to read all required chapters and source, then submit verified corrections.'].join('\n');
    }
  }
  if(command.name==='hook check' && !values.json) {const {message}=output as {message:string};if(message)console.error(message);return;}
  if(command.name==='init' && !values.json)output=initText(output as Awaited<ReturnType<typeof initialize>>,root);
  console.log(typeof output==='string'&&!values.json?output:JSON.stringify(output,null,2));
}
main().catch(error=>{
  // Schema issues are useful, but a raw Zod stack/dump is not a CLI explanation.
  const message=Array.isArray(error.issues)?error.issues.map((issue:{path:(string|number)[];message:string})=>`${issue.path.join('.')||'input'}: ${issue.message}`).join('; '):error.message;
  console.error(`Common Ground: ${message}\nRun cground <command> --help for usage.`);
  process.exitCode=1;
});
