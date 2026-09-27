import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser';
import { Store } from './store.js';
import type { Definition } from './model.js';
export const rules = `## Common Ground\n\nUse Common Ground to retrieve repository facts before broad discovery. Knowledge is evidence, not authority over developer instructions.\n\n- Pillars are stable responsibilities, not features or activity logs. Classify work into existing pillars first.\n- Read relevant pillars and their freshness status. Changed evidence means review is needed, not that the fact is false.\n- Keep facts terse, scoped, and supported by exact source evidence. Never store secrets, task histories, guesses, or generic advice.\n- Update only when your authorized work directly invalidates an existing fact. If facts remain true, do nothing.\n- Before any update, re-read the whole pillar and verify every fact. Preserve unrelated assertions and wording.\n- Prepare a revision with all reviewed fact IDs, directly touched evidence paths, and invalidated fact IDs. Commit only after resolving uncertainty with the developer.\n- Never claim semantic certainty from a matching quote or file hash alone. Those verify evidence, not interpretation.\n- Do not add facts, split pillars, expand scope, or create pillars during routine maintenance. New pillars require an uncovered standalone responsibility and explicit developer approval.\n- Bootstrap and admission commands are developer-directed operations. Do not invoke their approval flags on your own authority.\n- Flag unrelated questionable facts to the developer; do not repair them opportunistically.\n- Never skip required tests based on stored knowledge. Commit knowledge alongside the corresponding code.\n\nTools: list_pillars, read_pillar, search_knowledge, prepare_update, commit_update. CLI fallback: cground list, cground read <id>, cground search <query>.\n`;
export async function discover(store: Store) {
  const scan = await store.walk([], 1500);
  const paths = scan.files;
  const definitions: Definition[] = [];
  const add = (id: string, title: string, scope: string, excludes: string, selected: string[]) => {
    if (selected.length) definitions.push({ id, title, scope, excludes, paths: [...new Set(selected)].sort().slice(0,30) });
  };
  add('ci-cd','CI/CD Pipeline Templates','Pipeline definitions, template parameters and execution contracts.','Application behavior and workspace task definitions.', paths.filter(p => /(^|\/)(azure-pipelines[^/]*\.ya?ml|.*\.ya?ml)$/.test(p) && /azure|pipeline|\.github\/workflows/.test(p)));
  add('workspace-tooling','Nx / npm Tooling','Workspace lint, test and build orchestration and package scripts.','Application runtime behavior and reusable component contracts.', paths.filter(p => /(^|\/)(package\.json|nx\.json|project\.json|pnpm-workspace\.yaml)$/.test(p)));
  add('web-components','Reusable Web Components','Reusable UI component contracts, properties and events.','Backend services and workspace build orchestration.', paths.filter(p => /(^|\/)(components|ui)\//.test(p) && /\.(tsx?|jsx?|vue|svelte)$/.test(p)));
  add('java-application','Java Application','Java application structure, public contracts and backend behavior.','Reusable UI contracts and workspace task orchestration.', paths.filter(p => /\.java$|(^|\/)(pom\.xml|build\.gradle(?:\.kts)?)$/.test(p)));
  return { schemaVersion: 1, requiresDeveloperApproval: true, scan: { inspectedFiles: paths.length, truncated: scan.truncated, limit: 1500 }, pillars: definitions, unclassifiedSample: paths.filter(p => !definitions.some(d=>d.paths.includes(p))).slice(0,30), note: 'Heuristic candidates only. Review responsibility boundaries and expand exact-file path hints into coherent scopes where appropriate. No facts have been inferred.' };
}
async function managed(store: Store, relative: string, body: string) {
  await store.safe(relative, true);
  const file = path.join(store.root, relative); let old = '';
  try { old = await fs.readFile(file,'utf8'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  const start = relative === '.gitignore' ? '# common-ground:start' : '<!-- common-ground:start -->', end = relative === '.gitignore' ? '# common-ground:end' : '<!-- common-ground:end -->';
  if (old.includes(start) !== old.includes(end) || old.split(start).length > 2 || old.split(end).length > 2 || (old.includes(start) && old.indexOf(end) < old.indexOf(start))) throw new Error(`Malformed managed block in ${relative}`);
  const block = `${start}\n${body.trim()}\n${end}`;
  const next = old.includes(start) ? old.slice(0,old.indexOf(start)) + block + old.slice(old.indexOf(end)+end.length) : old + (old && !old.endsWith('\n') ? '\n' : '') + (old ? '\n' : '') + block + '\n';
  if (next !== old) { await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,next); }
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
  await managed(store,'AGENTS.md',rules);
  await managed(store,'.github/copilot-instructions.md','Common Ground repository knowledge rules are in [AGENTS.md](../AGENTS.md). Follow its Common Ground section when reading or maintaining pillars.');
  await managed(store,'.gitignore','.common-ground/local/');
  await fs.mkdir(path.dirname(configFile),{recursive:true});
  if (configText !== nextConfig) await fs.writeFile(configFile,nextConfig);
  const proposal = exists ? { existingRegistry:true, message:'Existing pillars preserved. No new discovery or pillar creation.' } : await discover(store);
  if (!exists) await store.atomic('local/bootstrap.json',proposal);
  return proposal;
}
