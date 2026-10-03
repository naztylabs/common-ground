import { promises as fs } from 'node:fs';
import path from 'node:path';
import {version} from './version.js';
import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser';
import { Store } from './store.js';
import { installHook } from './hooks.js';
import { refreshKnowledgeExport } from './export.js';
import { discover } from './discovery.js';
import { GroundError, errorPayload } from './errors.js';
export { discover } from './discovery.js';
import { rules, startGuide, policy, bootstrapNext } from './guidance.js';
export { rules } from './guidance.js';
async function managed(store: Store, relative: string, body: string) {
  await store.safe(relative, true);
  const file = path.join(store.root, relative); let old = '';
  try { old = await fs.readFile(file,'utf8'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  const start = relative === '.gitignore' ? '# common-ground:start' : '<!-- common-ground:start -->', end = relative === '.gitignore' ? '# common-ground:end' : '<!-- common-ground:end -->';
  if (old.includes(start) !== old.includes(end) || old.split(start).length > 2 || old.split(end).length > 2 || (old.includes(start) && old.indexOf(end) < old.indexOf(start))) throw new Error(`Malformed managed block in ${relative}`);
  const block = `${start}\n${body.trim()}\n${end}`;
  const next = old.includes(start) ? old.slice(0,old.indexOf(start)) + block + old.slice(old.indexOf(end)+end.length) : old + (old && !old.endsWith('\n') ? '\n' : '') + (old ? '\n' : '') + block + '\n';
  if (next !== old) { await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,next); }
  return next !== old;
}
export async function initialize(store: Store, options:{skipHook?:boolean}={}) {
  const steps=['local-directory','registry','mcp-validation',...Object.keys(guidanceFiles),'.gitignore','mcp-config','discovery','hook','markdown'];
  const completed:string[]=[],skipped:string[]=[],failed:{step:string;error:ReturnType<typeof errorPayload>}[]=[];
  const retry='Retry cground init after fixing the failed step; completed managed writes are safe to repeat and existing knowledge and bootstrap drafts are preserved. Use cground init --skip-hook to omit the advisory hook, or cground hook install later.';
  async function step<T>(name:string,work:()=>Promise<T>):Promise<T>{
    try{const result=await work();completed.push(name);return result;}
    catch(error){
      const cause=errorPayload(error);
      throw new GroundError('INIT_INCOMPLETE',`Initialization failed at ${name}: ${cause.message}. Completed: ${completed.join(', ')||'none'}.`,cause.fields,retry,
        {completed:completed.filter(id=>!failed.some(f=>f.step===id)),skipped:[...skipped],failed:[...failed,{step:name,error:cause}],pending:steps.slice(steps.indexOf(name)+1),failedStepMayHaveWritten:true});
    }
  }
  await step('local-directory',async()=>{await store.safe('.common-ground/local',true);await fs.mkdir(store.file('local'),{recursive:true});});
  const exists=await step('registry',async()=>{try{await store.read();return true;}catch(e:any){if(e.code!=='ENOENT')throw e;return false;}});
  const configFile = path.join(store.root,'.vscode/mcp.json'); let configText = '{}\n';
  const nextConfig=await step('mcp-validation',async()=>{
    await store.safe('.vscode/mcp.json',true);
    try { configText = await fs.readFile(configFile,'utf8'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    const errors: ParseError[] = []; const config = parse(configText,errors,{allowTrailingComma:true});
    if (errors.length || !config || typeof config !== 'object' || Array.isArray(config) || (config.servers && (typeof config.servers !== 'object' || Array.isArray(config.servers)))) throw new Error('Invalid .vscode/mcp.json; refusing to overwrite.');
    if (config.servers?.commonGround && config.servers.commonGround.command !== 'cground') throw new Error('Existing commonGround MCP entry conflicts; resolve it before init.');
    const entry = { type:'stdio', command:'cground', args:['serve','--root','${workspaceFolder}'] };
    return applyEdits(configText, modify(configText,['servers','commonGround'],entry,{formattingOptions:{insertSpaces:true,tabSize:2}}));
  });
  for(const [file,body] of Object.entries(guidanceFiles))await step(file,()=>managed(store,file,body));
  await step('.gitignore',()=>managed(store,'.gitignore','.common-ground/local/'));
  await step('mcp-config',async()=>{await fs.mkdir(path.dirname(configFile),{recursive:true});if(configText!==nextConfig)await fs.writeFile(configFile,nextConfig);});
  const proposal=await step('discovery',async()=>{
    if(exists)return {existingRegistry:true, message:'Existing pillars preserved. No new discovery or pillar creation.'};
    try{
      const file=await store.safe('.common-ground/local/bootstrap.json');
      if(!(await fs.stat(file)).isFile())throw new Error('Existing bootstrap draft is not a regular file.');
      return {existingDraft:true,proposalPath:'.common-ground/local/bootstrap.json',message:'Existing bootstrap draft preserved. Read it before refining; cground scan can provide fresh signals.'};
    }catch(e:any){if(e.code!=='ENOENT')throw e;}
    const proposal=await discover(store);await store.atomic('local/bootstrap.json',proposal);return proposal;
  });
  let hook:string;
  if(options.skipHook){skipped.push('hook');hook='Advisory hook skipped. Run cground hook install later to enable it.';}
  else hook=await step('hook',async()=>{
    try{return await installHook(store);}catch(error:any){
      if(!['EROFS','EACCES','EPERM'].includes(error.code))throw error;
      failed.push({step:'hook',error:errorPayload(error)});
      return `Advisory hook unavailable: ${error.message}. Repository setup continues. Run cground hook install when Git metadata is writable.`;
    }
  });
  const markdown=await step('markdown',()=>refreshKnowledgeExport(store));
  const setup={status:failed.length?'complete-with-warnings':'complete',completed:completed.filter(name=>!failed.some(f=>f.step===name)),skipped,failed,pending:[],retry:failed.length?retry:null};
  return exists ? {...proposal, hook, markdown,setup} : { ...proposal, state:'bootstrap-required', next:bootstrapNext, hook, markdown,setup };
}

const guidanceFiles:Record<string,string>={
  'AGENTS.md':rules,
  '.common-ground/START_HERE.md':startGuide,
  '.common-ground/POLICY.md':policy,
  '.github/copilot-instructions.md':'Common Ground repository knowledge rules are in [AGENTS.md](../AGENTS.md). Follow its Common Ground section when reading or maintaining pillars.\nCode is the source of truth; these notes only help navigation.\nFor repository questions, consult Common Ground and verify source. If knowledge is missing or stale, answer from source and prompt to update it.\nIf the developer disputes the code, clarify current versus intended behavior together. Record only verified, durable knowledge under the note-taking rules.',
};
export async function guidanceStatus(store:Store) {
  const files:Record<string,string>={};
  for(const [file,body] of Object.entries(guidanceFiles)) {
    try {
      const text=(await fs.readFile(await store.safe(file),'utf8')).replace(/\r\n/g,'\n');
      const expected=`<!-- common-ground:start -->\n${body.trim()}\n<!-- common-ground:end -->`;
      files[file]=text.includes(expected) && text.split('<!-- common-ground:start -->').length===2 && text.split('<!-- common-ground:end -->').length===2?'current':'stale';
    } catch(error:any) { if(error.code!=='ENOENT')throw error;files[file]='missing'; }
  }
  return {installedVersion:version,basis:'Managed content compared with installed guidance templates',status:Object.values(files).every(value=>value==='current')?'current':'outdated',files,
    next:Object.values(files).every(value=>value==='current')?null:'Run cground refresh-guidance to update managed instructions while preserving surrounding text.'};
}
export async function refreshGuidance(store:Store) {
  const changedFiles:string[]=[],unchangedFiles:string[]=[];
  for(const [file,body] of Object.entries(guidanceFiles))(await managed(store,file,body)?changedFiles:unchangedFiles).push(file);
  return {writesKnowledge:false,changedFiles,unchangedFiles,...await guidanceStatus(store)};
}
