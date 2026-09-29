import { parseArgs } from 'node:util';

// CLI syntax only. Domain validation and execution live in operations.ts for both interfaces.
export const options = {
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
  define('init','','Set up guidance, MCP, local Markdown and advisory Git hook',[],'cground init','Everyday'),
  define('check','[target]','Check all knowledge or one pillar, chapter or fact',['cleanup',...paging],'cground check cicd --cleanup n','Everyday'),
  define('validate','[target]','Alias of check: validate structure, evidence and freshness',['cleanup',...paging],'cground validate all --json','Everyday'),
  define('tidy','<target>','Plan developer-requested cleanup; agent verifies and applies it',paging,'cground tidy all','Everyday'),
  define('review','[target]','Summarize knowledge changes for agent-led human review',['staged','evidence',...paging],'cground review --staged','Everyday'),
  define('export','','Refresh .common-ground/local/knowledge.md',[],'cground export','Everyday'),
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
  define('scan','','Discover a proposed responsibility map; does not approve it',[],'cground scan'),
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
  for(const flag of Object.keys(values))if(!['help','root','json',...command.flags].includes(flag))throw new Error(`Option --${flag} is not supported by ${name}. Run cground ${name} --help.`);
  if(!help) {
    const args=command.arguments.split(' ').filter(Boolean), minimum=args.filter(a=>a.startsWith('<')).length;
    const maximum=args.some(a=>a.includes('...'))?Infinity:args.length;
    if(words.length<minimum || words.length>maximum)throw new Error(`Usage: cground ${name} ${command.arguments}. Run cground ${name} --help.`);
    if(name==='task assess' && values.touched===undefined)throw new Error('Supply --touched for actual task paths.');
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
  const flags:Flag[] = ['help','root','json',...(command?.flags??(!group?['version'] as Flag[]:[]))];
  lines.push('Options:',...flags.map(flag=>`  ${options[flag].label.padEnd(32)} ${options[flag].description}`),'');
  if(command)lines.push('Example:',`  ${command.example}`,'');
  else lines.push('Get started: cground init → review the proposed knowledge with your agent → cground check', 'Help: cground <command> --help, cground help <command>, cground hook --help','');
  if(command && ['check','validate','tidy'].includes(command.name))lines.push('Targets: all, pillar, pillar/chapter, pillar/chapter/fact, or a unique fact ID.', 'Cleanup returns a plan and tidyId. Your agent must read source and submit verified corrections.', 'Check/validate exit 1 while stale or unpopulated, even after cleanup is accepted.','');
  if(command?.flags.includes('approve'))lines.push('Approval flags declare developer direction; they do not grant autonomous agent permission.','');
  lines.push('Terminal: concise summaries where available. Pipes or --json: structured results.', 'Exit codes: 0 success; 1 needs attention or command failed. Git hook checks are advisory.');
  return lines.join('\n');
}
