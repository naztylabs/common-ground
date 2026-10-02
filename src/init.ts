import { promises as fs } from 'node:fs';
import path from 'node:path';
import {version} from './version.js';
import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser';
import { Store } from './store.js';
import { installHook } from './hooks.js';
import { refreshKnowledgeExport } from './export.js';
import { discover } from './discovery.js';
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
export async function initialize(store: Store) {
  await store.safe('.common-ground',true);
  await fs.mkdir(store.file('local'),{recursive:true});
  let exists = false; try { await store.read(); exists = true; } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  await store.safe('.vscode/mcp.json',true);
  const configFile = path.join(store.root,'.vscode/mcp.json'); let configText = '{}\n';
  try { configText = await fs.readFile(configFile,'utf8'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  const errors: ParseError[] = []; const config = parse(configText,errors,{allowTrailingComma:true});
  if (errors.length || !config || typeof config !== 'object' || Array.isArray(config) || (config.servers && (typeof config.servers !== 'object' || Array.isArray(config.servers)))) throw new Error('Invalid .vscode/mcp.json; refusing to overwrite.');
  if (config.servers?.commonGround && config.servers.commonGround.command !== 'cground') throw new Error('Existing commonGround MCP entry conflicts; resolve it before init.');
  const entry = { type:'stdio', command:'cground', args:['serve','--root','${workspaceFolder}'] };
  const nextConfig = applyEdits(configText, modify(configText,['servers','commonGround'],entry,{formattingOptions:{insertSpaces:true,tabSize:2}}));
  await refreshGuidance(store);
  await managed(store,'.gitignore','.common-ground/local/');
  await fs.mkdir(path.dirname(configFile),{recursive:true});
  if (configText !== nextConfig) await fs.writeFile(configFile,nextConfig);
  const proposal = exists ? { existingRegistry:true, message:'Existing pillars preserved. No new discovery or pillar creation.' } : await discover(store);
  if (!exists) await store.atomic('local/bootstrap.json',proposal);
  const hook = await installHook(store);
  const markdown = await refreshKnowledgeExport(store);
  return exists ? {...proposal, hook, markdown} : { ...proposal, state:'bootstrap-required', next:bootstrapNext, hook, markdown };
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
