import { parseArgs } from 'node:util';

// CLI syntax only. Domain validation and execution live in operations.ts for both interfaces.
export const options = {
  both: { type: 'boolean', label: '--both', description: 'Include both CLI payload and MCP operation schemas' },
  exclude: { type: 'string', label: '--exclude <paths>', description: 'Comma-separated repository-relative paths to exclude from discovery' },
  verify: { type: 'boolean', label: '--verify', description: 'Check selected facts and upstream source freshness' },
  review: { type: 'boolean', label: '--review', description: 'Include complete chapters and source/documentation paths before knowledge correction' },
  stdin: { type: 'boolean', label: '--stdin', description: 'Read the JSON payload from stdin instead of a file' },
  example: { type: 'boolean', label: '--example', description: 'Show a copyable JSON payload with help' },
  verbose: { type: 'boolean', label: '--verbose', description: 'Return complete mutation objects' },
  'all-results': { type: 'boolean', label: '--all-results', description: 'Include passing validation rows' },
  'dry-run': { type: 'boolean', label: '--dry-run', description: 'Preflight without writing knowledge or requiring approval' },
  preflight: { type: 'string', label: '--preflight <token>', description: 'Token from the reviewed dry run; rejects source or payload changes' },
  help: { type: 'boolean', short: 'h', label: '-h, --help', description: 'Show help without running the command' },
  version: { type: 'boolean', short: 'V', label: '-V, --version', description: 'Show the installed version' },
  root: { type: 'string', label: '--root <path>', description: 'Repository root (default: current directory)' },
  json: { type: 'boolean', label: '--json', description: 'Return JSON; never prompt for input' },
  cursor: { type: 'string', label: '--cursor <token>', description: 'Continue a paginated result' },
  limit: { type: 'string', label: '--limit <1..20>', description: 'Maximum records per page (default: 10; search: 8)' },
  staged: { type: 'boolean', label: '--staged', description: 'Review staged knowledge instead of the working file' },
  evidence: { type: 'boolean', label: '--evidence', description: 'Include exact changed evidence quotes in the review' },
  cleanup: { type: 'string', label: '--cleanup <y|n>', description: 'Start or decline agent-led cleanup when stale' },
  approve: { type: 'boolean', label: '--approve', description: 'Declare explicit developer approval of the proposed content' },
  path: { type: 'string', label: '--path <path>', description: 'Repository-relative source path for ownership routing' },
  signal: { type: 'string', label: '--signal <text>', description: 'Short symptom or routing hint' },
  touched: { type: 'string', label: '--touched <paths>', description: 'Comma-separated paths touched by this task; empty means none' },
  chapter: { type: 'string', label: '--chapter <id>', description: 'Restrict search to pillar/chapter' },
  facts: { type: 'string', label: '--facts <ids>', description: 'Comma-separated fact IDs to review' },
  profile: { type: 'string', label: '--profile <compact|full>', description: 'MCP tool profile (default: compact)' },
  'standalone-reason': { type: 'string', label: '--standalone-reason <text>', description: 'Why an additional pillar owns an uncovered responsibility' },
} as const;
type Flag = keyof typeof options;
type Group = 'Everyday' | 'Navigation' | 'Agent workflows';
export type CommandSpec = {name:string; operation:string; arguments:string; description:string; flags:Flag[]; example:string; group:Group};
const paging:Flag[] = ['cursor','limit'];
const define = (name:string, args:string, description:string, flags:Flag[], example:string, group:Group='Agent workflows'):CommandSpec =>
  ({name,operation:name.replace(' ','-'),arguments:args,description,flags,example,group});
export const commands:CommandSpec[] = [
  define('lookup','[query...]','Find a few facts and source locations without task bookkeeping',['path','verify','limit','cursor'],'cground lookup --path src/runtime.ts','Everyday'),
  define('assess','','Check actual task changes; expand review only when needed',['touched','review',...paging],'cground assess --touched src/runtime.ts','Everyday'),
  define('init','','Set up guidance, MCP, local Markdown and advisory Git hook',[],'cground init','Everyday'),
  define('check','[target]','Check all knowledge or one pillar, chapter or fact',['cleanup','all-results',...paging],'cground check cicd --cleanup n','Everyday'),
  define('validate','[target]','Alias of check: validate structure, evidence and freshness',['cleanup','all-results',...paging],'cground validate all --json','Everyday'),
  define('tidy','<target>','Plan developer-requested cleanup; agent verifies and applies it',paging,'cground tidy all','Everyday'),
  define('review','[target]','Summarize knowledge changes for agent-led human review',['staged','evidence',...paging],'cground review --staged','Everyday'),
  define('export','','Refresh .common-ground/local/knowledge.md',[],'cground export','Everyday'),
  define('refresh-guidance','','Refresh managed instructions without changing knowledge, MCP configuration or hooks',[],'cground refresh-guidance','Everyday'),
  define('doctor','','Check repository setup and registry health',[],'cground doctor','Everyday'),
  define('hook check','','Run the advisory staged-index check; never block commits',[],'cground hook check','Everyday'),
  define('hook install','','Install the advisory hook or explain existing hook integration',[],'cground hook install','Everyday'),
  define('hook mute','','Suppress pre-commit reminders in this checkout',[],'cground hook mute','Everyday'),
  define('hook unmute','','Restore pre-commit reminders in this checkout',[],'cground hook unmute','Everyday'),
  define('serve','','Start the local stdio MCP server',['profile'],'cground serve --root /path/to/repo','Everyday'),
  define('list','','List pillars',paging,'cground list','Navigation'),
  define('chapters','<pillar>','List chapters in a pillar',paging,'cground chapters cicd','Navigation'),
  define('read','<chapter>','Read a chapter in pages',paging,'cground read cicd/pipelines','Navigation'),
  define('fact','<chapter> <fact>','Read one fact with its exact evidence',[],'cground fact cicd/pipelines build','Navigation'),
  define('search','<query...>','Find relevant fact summaries',['chapter','limit'],'cground search build pipeline','Navigation'),
  define('start','[signal...]','Route from a symptom or source path',['path','signal',...paging],'cground start "build failed"','Navigation'),
  define('owners','[signal...]','Find candidate owners for a source path or symptom',['path','signal',...paging],'cground owners --path src/build.ts','Navigation'),
  define('graph','[pillar]','Read recorded pillar dependencies',paging,'cground graph cicd','Navigation'),
  define('schema','<operation>','Show the CLI payload schema; --both also includes MCP arguments',['both'],'cground schema seed'),
  define('bootstrap','<plan.json>','Preflight and publish an initial map and fact batches together',['stdin','dry-run','preflight'],'cground bootstrap bootstrap.json --dry-run'),
  define('seed-batch','<batch.json>','Preflight and populate several approved empty chapters atomically',['stdin','dry-run','preflight'],'cground seed-batch batch.json --dry-run'),
  define('scan','','Discover a proposed responsibility map; does not approve it',['exclude'],'cground scan'),
  define('approve','<plan.json>','Create developer-approved pillar definitions',['approve','standalone-reason'],'cground approve .common-ground/local/bootstrap.json --approve'),
  define('approve-chapters','<pillar> <plan.json>','Add developer-approved chapters',['approve'],'cground approve-chapters cicd chapters.json --approve'),
  define('seed','<chapter> <facts.json>','Populate an approved empty chapter',['approve'],'cground seed cicd/pipelines facts.json --approve'),
  define('admit','<chapter> <facts.json>','Admit developer-approved facts to a chapter',['approve'],'cground admit cicd/pipelines facts.json --approve'),
  define('migrate','','Migrate schema-v1 knowledge after approval',['approve'],'cground migrate --approve'),
  define('task start','','Start a local task context',['touched','signal'],'cground task start --touched src/build.ts'),
  define('task assess','<task-id>','Assess the paths this task actually touched',['touched',...paging],'cground task assess TASK_ID --touched src/build.ts'),
  define('task finish','<task-id>','Finish a task and collect corrections and pending approvals',paging,'cground task finish TASK_ID'),
  define('read-knowledge','<request.json>','Read structured knowledge, drafts or review checklists',[],'cground read-knowledge request.json'),
  define('review-plan','<chapter>','Find all linked chapters that require review',['facts'],'cground review-plan cicd/pipelines'),
  define('review-checklist','[chapters...]','List evidence and documentation to read this session',['touched',...paging],'cground review-checklist cicd/pipelines'),
  define('prepare-patch','<patch.json>','Prepare verified changes to existing facts',[],'cground prepare-patch patch.json'),
  define('prepare','<update.json>','Prepare a complete multi-chapter review transaction',[],'cground prepare update.json'),
  define('commit','<proposal-id>','Apply a prepared knowledge transaction (not a Git commit)',[],'cground commit PROPOSAL_ID'),
  define('propose-facts','<task-id> <chapter> <facts.json>','Queue new facts locally for developer review',[],'cground propose-facts TASK_ID cicd/pipelines facts.json'),
  define('drop-facts','<task-id> <facts...>','Discard selected local proposals by qualified fact ID',[],'cground drop-facts TASK_ID cicd/pipelines/build'),
  define('accept-facts','<task-id> <review.json>','Admit the developer-approved finished-task batch',['approve'],'cground accept-facts TASK_ID review.json --approve'),
];
for(const command of commands) {
  if(command.arguments.includes('.json>'))command.flags.push('stdin');
  if(['approve','approve-chapters','seed','admit'].includes(command.name))command.flags.push('verbose');
  if(['bootstrap','seed-batch'].includes(command.name))command.flags.push('approve');
  command.flags=[...new Set(command.flags)];
}
export const factExample={id:'runtime-mode',statement:'The runtime uses the first mode.',evidence:[{path:'src/runtime.ts',quote:'mode = "first"'}],sourceScope:['src'],dependsOn:[]};
export const payloadExamples:Record<string,unknown>={seed:[factExample],admit:[factExample],
  'seed-batch':{batches:[{chapterId:'runtime/overview',facts:[factExample]}]},
  bootstrap:{pillars:[{id:'runtime',title:'Runtime',scope:'Application runtime behavior.',excludes:'Build tooling.',chapters:[{id:'overview',title:'Overview',scope:'Application runtime behavior.',excludes:'Build tooling.',paths:['src']}]}],batches:[{chapterId:'runtime/overview',facts:[factExample]}]}};
export type Values = Partial<Record<Flag,string|boolean>>;
export function parseCommand(argv:string[]) {
  const parsed = parseArgs({args:argv,options,allowPositionals:true,strict:true});
  const values:Values = parsed.values;
  const words = [...parsed.positionals];
  const help = values.help === true || words[0] === 'help';
  if(words[0] === 'help')words.shift();
  const name = ['hook','task'].includes(words[0]) ? words.splice(0,Math.min(2,words.length)).join(' ') : words.shift();
  if(!name) {
    if(words.length)throw new Error('Unexpected arguments.');
    for(const flag of Object.keys(values))if(!['help','version','root','json'].includes(flag))throw new Error(`Option --${flag} requires a command.`);
    return {values,help:!values.version || help,command:undefined,positionals:[],group:undefined};
  }
  if(values.version)throw new Error('Use cground --version without a command.');
  if(['hook','task'].includes(name)) {
    for(const flag of Object.keys(values))if(!['help','root','json'].includes(flag))throw new Error(`Option --${flag} requires a ${name} subcommand.`);
    return {values,help:true,command:undefined,positionals:[],group:name};
  }
  const command=commands.find(c=>c.name===name);
  if(!command)throw new Error(`Unknown command "${name}". Run cground --help.`);
  for(const flag of Object.keys(values))if(!['help','root','json','example',...command.flags].includes(flag))throw new Error(`Option --${flag} is not supported by ${name}. Run cground ${name} --help.`);
  if(values.example && !help)throw new Error('Use --example with --help.');
  if(!help) {
    if(values.stdin){
      const expected=command.arguments.split(' ').filter(Boolean).length;
      if(words.length!==expected-1)throw new Error('Use --stdin instead of the JSON filename.');
      words.push('-');
    }
    const args=command.arguments.split(' ').filter(Boolean), minimum=args.filter(a=>a.startsWith('<')).length;
    const maximum=args.some(a=>a.includes('...'))?Infinity:args.length;
    if(words.length<minimum || words.length>maximum)throw new Error(`Usage: cground ${name} ${command.arguments}. Run cground ${name} --help.`);
    if(['assess','task assess'].includes(name) && values.touched===undefined)throw new Error('Supply --touched for actual task paths.');
    if(values.limit!==undefined && (!/^\d+$/.test(String(values.limit)) || Number(values.limit)<1 || Number(values.limit)>20))throw new Error('--limit must be an integer from 1 to 20.');
    if(values.cleanup!==undefined && !['y','n'].includes(String(values.cleanup).toLowerCase()))throw new Error('Use --cleanup y or --cleanup n.');
    if(values.profile!==undefined && !['compact','full'].includes(String(values.profile)))throw new Error('Use --profile compact or --profile full.');
  }
  return {values,help,command,positionals:words,group:undefined};
}
export function helpText(command?:CommandSpec,group?:string) {
  const lines=command ? [`Usage: cground ${command.name}${command.arguments?' '+command.arguments:''} [options]`,'',command.description,'']
    : [`Common Ground — shared, Git-backed repository knowledge`,'',`Usage: cground ${group?group+' ':''}<command> [options]`,''];
  if(!command)for(const category of ['Everyday','Navigation','Agent workflows']) {
    const selected=commands.filter(c=>(!group||c.name.startsWith(group+' ')) && c.group===category);
    if(selected.length)lines.push(`${category}:`,...selected.map(c=>`  ${(c.name+' '+c.arguments).trim().padEnd(47)} ${c.description}`),'');
  }
  const flags:Flag[] = ['help','root','json',...(command && payloadExamples[command.name]?['example'] as Flag[]:[]),...(command?.flags??(!group?['version'] as Flag[]:[]))];
  lines.push('Options:',...flags.map(flag=>`  ${options[flag].label.padEnd(32)} ${options[flag].description}`),'');
  if(command){
    lines.push('Example:',`  ${command.example}`,'');
    if(command.name!=='serve')lines.push(`Input schema: cground schema ${command.operation}`);
    if(payloadExamples[command.name])lines.push('JSON payload (replace synthetic paths and quotes with verified source):',JSON.stringify(payloadExamples[command.name],null,2),'');
    if(command.flags.includes('stdin'))lines.push('Use --stdin instead of the JSON filename, or use - as the filename.','');
  }
  else lines.push('Get started: cground init → review the proposed knowledge with your agent → cground check', 'Help: cground <command> --help, cground help <command>, cground hook --help','');
  if(command && ['seed','admit','bootstrap','prepare-patch'].includes(command.name))lines.push('sourceScope stays within the owning chapter paths. Supporting evidence may cross ownership boundaries: for a chapter owning src, use sourceScope:["src"] with evidence:[{path:"shared/config.ts",quote:"mode = 1"}]. External evidence is tracked automatically; do not add shared/config.ts to sourceScope.','');
  if(command?.name==='lookup')lines.push('Default: up to five stored facts with source paths; freshness is not checked. Use --verify for live checks.','');
  if(command?.name==='assess')lines.push('No task start or finish required. No local/shared writes. Use --review only when a correction needs whole-chapter review.','');
  if(command && ['check','validate','tidy'].includes(command.name))lines.push('Targets: all, pillar, pillar/chapter, pillar/chapter/fact, or a unique fact ID.', 'Cleanup returns a plan and tidyId. Your agent must read source and submit verified corrections.', 'Check/validate exit 1 while stale or unpopulated, even after cleanup is accepted.','');
  if(command?.flags.includes('approve'))lines.push('Approval flags declare developer direction; they do not grant autonomous agent permission.','');
  lines.push('Terminal: concise summaries where available. Pipes or --json: structured results.', 'Exit codes: 0 success; 1 needs attention or command failed. Git hook checks are advisory.');
  return lines.join('\n');
}
