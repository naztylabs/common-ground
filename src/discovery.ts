import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse, type ParseError } from 'jsonc-parser';
import { type Definition, relativePath } from './model.js';
import type { Store } from './store.js';

const ENTRY_LIMIT=1500, FILE_BYTES=256*1024, TOTAL_BYTES=2*1024*1024, PROJECT_LIMIT=50;
const excluded=new Set(['.git','node_modules','.common-ground','dist','build','target','.nx','.vite','.next','.nuxt','.svelte-kit','.angular','.turbo','.yarn','.pnpm-store','.output','coverage',
  '.vscode','.idea','.codex','.claude','.cursor','dep','bundled','vendored','vendor','third_party','third-party','thirdparty','external','extern','deps','dependencies','.venv','venv','__pycache__','pods','carthage','.build','deriveddata','.gradle','.dart_tool','.pub-cache','bin','obj']);
const inside=(file:string,root:string)=>root==='.'||file===root||file.startsWith(`${root}/`);
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const markers=/^(CMakeLists\.txt|Makefile|meson\.build|package\.json|angular\.json|project\.json|nx\.json|turbo\.json|lerna\.json|pnpm-workspace\.ya?ml|Package\.swift|project\.pbxproj|pom\.xml|(?:build|settings)\.gradle(?:\.kts)?|AndroidManifest\.xml|go\.(?:mod|work)|pyproject\.toml|requirements(?:[-.][\w-]+)?\.txt|Pipfile|setup\.py|Cargo\.toml|Gemfile|composer\.json|pubspec\.yaml|app\.json|app\.config\.json|.*\.(?:csproj|fsproj|vbproj|sln|slnx))$/;
const source=/\.(?:[cm]?[jt]sx?|vue|svelte|astro|java|kt|swift|c|cc|cpp|cxx|h|hh|hpp|hxx|m|py|go|rs|cs|fs|vb|rb|php|dart|xml|json|toml|ya?ml|gradle|kts)$/;
const ci=(file:string)=>/^(?:.*\/)?(?:azure-pipelines[^/]*\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile)$/.test(file)||/(?:^|\/)(?:\.github\/workflows|\.circleci)\/[^/]+\.ya?ml$/.test(file)||/(?:^|\/)pipelines\/.*\.ya?ml$/.test(file);
type Project={root:string; technologies:Set<string>; evidence:Set<string>; library:boolean};
type Detection={root:string;technologies:string[];evidence:string[];evidenceCount:number;chapterId:string;pathHintCount:number;pathsTruncated:boolean;
  matchedFileCount:number;ownershipCoverage:'incomplete'|'scanned-files';rationale:string;directoryHints:string[]};
const roles:Record<string,[string,string]>={
  'ci-cd':['CI/CD Pipelines','Pipeline definitions, templates and execution contracts.'],
  'workspace-tooling':['Workspace Tooling','Shared workspace configuration and build orchestration.'],
  'web-components':['Shared Libraries and Components','Reusable library and component contracts shared across applications.'],
  'web-applications':['Web Applications','Web application structure, routing and runtime contracts.'],
  'mobile-applications':['Mobile Applications','Mobile application structure and cross-platform runtime contracts.'],
  'native-applications':['Native Applications and Packages','Native application and package structure and public contracts.'],
  'cpp-projects':['C / C++ Projects','C and C++ application and library structure, build and runtime contracts.'],
  'jvm-applications':['JVM Applications','Java and Kotlin project structure, build and runtime contracts.'],
  'javascript-projects':['JavaScript / TypeScript Projects','JavaScript and TypeScript project structure and runtime contracts.'],
  'python-projects':['Python Projects','Python application and package structure and runtime contracts.'],
  'go-projects':['Go Projects','Go module structure and public application or package contracts.'],
  'rust-projects':['Rust Projects','Rust crate structure and public application or library contracts.'],
  'dotnet-projects':['.NET Projects','.NET project structure, build and runtime contracts.'],
  'ruby-projects':['Ruby Projects','Ruby application and library structure and runtime contracts.'],
  'php-projects':['PHP Projects','PHP application and package structure and runtime contracts.'],
  'dart-projects':['Dart Projects','Dart package structure and runtime contracts.'],
};
const npmSignals:Record<string,string>={'@angular/core':'Angular',react:'React','react-native':'React Native',expo:'Expo',next:'Next.js',vue:'Vue',nuxt:'Nuxt',svelte:'Svelte','@sveltejs/kit':'SvelteKit',astro:'Astro',express:'Express',fastify:'Fastify','@nestjs/core':'NestJS',typescript:'TypeScript',nx:'Nx',turbo:'Turborepo',lerna:'Lerna'};

/** Bounded breadth-first discovery keeps deep application trees from starving sibling manifests. */
async function scanFiles(store:Store,exclude:string[]){
  const files:string[]=[],queue=['.'],skipped:{path:string;reason:string}[]=[],skippedPaths:string[]=[];let inspectedEntries=0,truncated=false;
  for(let offset=0;offset<queue.length&&!truncated;offset++){
    const directory=queue[offset];if(directory!=='.')await store.safe(directory);
    const children:string[]=[];
    for await(const entry of await fs.opendir(path.join(store.root,directory))){
      if(inspectedEntries===ENTRY_LIMIT){truncated=true;break;}inspectedEntries++;
      const file=path.posix.join(directory,entry.name);
      const reason=entry.isSymbolicLink()?'symlink':excluded.has(entry.name.toLowerCase())||entry.name.startsWith('.env')?'dependency, generated output or tool configuration':exclude.some(p=>inside(file,p))?'explicit exclusion':undefined;
      if(reason){skippedPaths.push(file);skipped.push({path:entry.name.startsWith('.env')?'[environment file]':file,reason});continue;}
      if(entry.isDirectory())children.push(file);else if(entry.isFile())files.push(file);
    }
    queue.push(...children.sort((a,b)=>{
      const priority=(p:string)=>/^(src|include|apps|packages|libs|services)(\/|$)/.test(p)?0:1;
      return priority(a)-priority(b)||a.localeCompare(b);
    }));
  }
  return {files:files.sort(),inspectedEntries,truncated,skipped:skipped.slice(0,30),skippedPaths,skippedCount:skipped.length};
}

/** Collapse only homogeneous, fully scanned subtrees. Never infer whole-repository ownership. */
function ownershipHints(files:string[],scan:Awaited<ReturnType<typeof scanFiles>>) {
  const owned=new Set(files),directories=new Set<string>();
  for(const file of files){let dir=path.posix.dirname(file);while(dir!=='.'){directories.add(dir);dir=path.posix.dirname(dir);}}
  const chosen:string[]=[];
  if(!scan.truncated)for(const dir of [...directories].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b))){
    if(dir==='.github'||chosen.some(parent=>inside(dir,parent))||scan.skippedPaths.some(file=>inside(file,dir)))continue;
    const contents=scan.files.filter(file=>inside(file,dir));
    if(contents.some(file=>/(^|\/)(tests?|examples?|samples?|bindings|python)\//.test(file.slice(dir.length+1))))continue;
    // Mixed source types (for example bindings and a native library) need separate responsibility review.
    const families=new Set(contents.map(file=>/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(file)?'native':/\.py$/.test(file)?'python':/\.[cm]?[jt]sx?$/.test(file)?'javascript':'other'));
    families.delete('other');
    if(contents.length>1&&families.size<=1&&contents.every(file=>owned.has(file)))chosen.push(dir);
  }
  const paths=[...chosen,...files.filter(file=>!chosen.some(dir=>inside(file,dir)))];
  return {paths:paths.slice(0,30),directoryHints:chosen.slice(0,30),truncated:paths.length>30};
}

/** Require independent implementation signals and a narrowly named specification before raising a review question. */
function formatArchitecturePrompts(files:string[]) {
  const filenameWords=(file:string)=>path.posix.basename(file,path.posix.extname(file))
    .replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ');
  const implementations=files.filter(file=>/\.(?:[cm]?[jt]sx?|java|kt|swift|c|cc|cpp|cxx|h|hh|hpp|hxx|m|py|go|rs|cs|fs|vb|rb|php|dart)$/i.test(file));
  const roles=[/\b(?:headers?|validate|validation)\b/,/\b(?:nodes?|chunks?|writer|writing)\b/,/\b(?:hierarchy|hierarchies|serialize|serialization|serializer)\b/]
    .map(pattern=>implementations.filter(file=>pattern.test(filenameWords(file))));
  const specifications=files.filter(file=>{
    if(!/\.(?:md|mdx|rst|txt|adoc|pdf)$/i.test(file))return false;
    const name=filenameWords(file);
    return /^(?:(?:file|binary|serialization) )?format(?: spec(?:ification)?)?$/.test(name)
      ||/^(?:spec|specification)$/.test(name)&&/^(?:file[-_]?)?format$/i.test(path.posix.basename(path.posix.dirname(file)));
  });
  if(!specifications.length||roles.some(paths=>!paths.length))return [];
  // A file with several suggestive words cannot stand in for independent source locations.
  const distinct=(index:number,chosen:string[]):string[]|undefined=>{
    if(index===roles.length)return chosen;
    for(const file of roles[index])if(!chosen.includes(file)){const result=distinct(index+1,[...chosen,file]);if(result)return result;}
    return undefined;
  };
  const representatives=distinct(0,[]);if(!representatives)return [];
  const paths=[...new Set([...representatives,...specifications,...roles.flat()])];
  return [{responsibility:'Format architecture',paths:paths.slice(0,10),pathCount:paths.length,pathsTruncated:paths.length>10,
    questions:['Do these sources and the specification describe one coherent format contract: header/version validation, node/chunk writing and hierarchy serialization?',
      'Has navigation to this format repeatedly been needed beyond a single query, and would a small source entry help?',
      'Can the verified entry fit an existing approved chapter and its ownership boundaries?',
      'Has the developer directed adding the entry or any required ownership expansion after reviewing the source relationships?'],
    basis:'Heuristic review prompt from filenames only; relationships and topic coverage are unverified. No navigation entry, ownership boundary or fact is created.'}];
}

export async function discover(store:Store,exclude:string[]=[]){
  exclude=exclude.map(p=>relativePath.parse(p));
  const scan=await scanFiles(store,exclude),projects=new Map<string,Project>(),warnings:{path:string;reason:string}[]=[];
  let manifestBytesRead=0;
  const add=(root:string,technology:string,evidence:string,library=false)=>{
    const p=projects.get(root)??{root,technologies:new Set<string>(),evidence:new Set<string>(),library:false};
    p.technologies.add(technology);p.evidence.add(evidence);p.library ||= library;projects.set(root,p);return p;
  };
  const warn=(file:string,reason:string)=>warnings.push({path:file,reason});
  const read=async(file:string)=>{
    const safe=await store.safe(file),stat=await fs.stat(safe);
    if(stat.size>FILE_BYTES){warn(file,'manifest exceeds 256 KiB; content skipped');return undefined;}
    if(manifestBytesRead+stat.size>TOTAL_BYTES){warn(file,'2 MiB manifest read budget exhausted');return undefined;}
    // A bounded buffer also protects against a file growing between stat and read.
    const handle=await fs.open(safe,'r');
    try{const buffer=Buffer.alloc(FILE_BYTES+1),{bytesRead}=await handle.read(buffer,0,buffer.length,0);
      if(bytesRead>FILE_BYTES||manifestBytesRead+bytesRead>TOTAL_BYTES){warn(file,'manifest grew beyond read budget; content skipped');return undefined;}
      manifestBytesRead+=bytesRead;return buffer.subarray(0,bytesRead).toString('utf8');
    }finally{await handle.close();}
  };
  const json=(file:string,text:string)=>{
    const errors:ParseError[]=[];const data=parse(text,errors,{allowTrailingComma:true});
    if(errors.length||!object(data)){warn(file,'invalid JSON object; content signals skipped');return undefined;}return data;
  };
  const manifestFiles=scan.files.filter(f=>markers.test(path.posix.basename(f))).sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
  for(const file of manifestFiles){
    const name=path.posix.basename(file),root=path.posix.dirname(file),text=await read(file);
    // Filename signals remain useful even when content is too large or malformed.
    if(name==='CMakeLists.txt')add(root,'CMake',file);
    if(name==='meson.build')add(root,'Meson',file);
    if(name==='Package.swift')add(root,'Swift Package Manager',file);
    if(name==='project.pbxproj')add(path.posix.dirname(root),'Xcode',file);
    if(name==='pom.xml')add(root,'Maven',file);
    if(/^build\.gradle/.test(name))add(root,'Gradle',file);
    if(/^settings\.gradle/.test(name))add(root,'Gradle Workspace',file);
    if(name==='AndroidManifest.xml'){
      const parts=file.split('/');const src=parts.indexOf('src');add(src>=0?parts.slice(0,src).join('/')||'.':root,'Android',file);
    }
    if(name==='go.mod')add(root,'Go',file);
    if(name==='go.work')add(root,'Go Workspace',file);
    if(/^(pyproject\.toml|requirements.*\.txt|Pipfile|setup\.py)$/.test(name))add(root,'Python',file);
    if(name==='Cargo.toml')add(root,'Rust',file);
    if(/\.(csproj|fsproj|vbproj|sln|slnx)$/.test(name))add(root,'.NET',file);
    if(name==='Gemfile')add(root,'Ruby',file);
    if(name==='composer.json')add(root,'PHP',file);
    if(name==='pubspec.yaml')add(root,'Dart',file);
    const workspace:Record<string,string>={'nx.json':'Nx','turbo.json':'Turborepo','lerna.json':'Lerna','pnpm-workspace.yaml':'pnpm Workspaces','pnpm-workspace.yml':'pnpm Workspaces'};
    if(workspace[name])add(root,workspace[name],file);
    if(name==='angular.json')add(root,'Angular Workspace',file);
    if(text===undefined)continue;
    if(name.endsWith('.json')){
      const data=json(file,text);if(!data)continue;
      if(name==='package.json'){
        add(root,'Node.js',file);
        const deps=new Set(['dependencies','devDependencies','peerDependencies','optionalDependencies'].flatMap(k=>object(data[k])?Object.keys(data[k]):[]));
        for(const [dependency,technology] of Object.entries(npmSignals))if(deps.has(dependency))add(root,technology,file);
        if(Array.isArray(data.workspaces)||(object(data.workspaces)&&Array.isArray(data.workspaces.packages)))add(root,'npm/Yarn Workspaces',file);
      }
      if(name==='angular.json'&&object(data.projects))for(const value of Object.values(data.projects)){
        if(!object(value)||typeof value.root!=='string')continue;
        if(value.root!==''&&value.root!=='.'&&!relativePath.safeParse(value.root).success){warn(file,'unsafe Angular project root ignored');continue;}
        const child=path.posix.join(root,value.root);
        if(!scan.files.some(f=>inside(f,child))){warn(file,'Angular project root outside scanned files; inspect manually');continue;}
        add(child,'Angular',file,value.projectType==='library');
      }
      if(name==='project.json'&&(data.projectType==='library'||data.projectType==='application'||object(data.targets))){
        add(root,'Nx Project',file,data.projectType==='library');
        const executors=object(data.targets)?Object.values(data.targets).filter(object).map(t=>t.executor??t.builder).filter((v):v is string=>typeof v==='string'):[];
        for(const executor of executors)for(const [pattern,technology] of [[/^@(?:nx|nrwl)\/angular:|^@angular-devkit\/build-angular:/,'Angular'],[/^@(?:nx|nrwl)\/next:/,'Next.js'],[/^@(?:nx|nrwl)\/react-native:/,'React Native'],[/^@(?:nx|nrwl)\/expo:/,'Expo'],[/^@(?:nx|nrwl)\/react:/,'React'],[/^@(?:nx|nrwl)\/vue:/,'Vue']] as const)if(pattern.test(executor))add(root,technology,file);
      }
      if((name==='app.json'||name==='app.config.json')&&object(data.expo)){add(root,'Expo',file);add(root,'React Native',file);}
      if(name==='composer.json'&&object(data.require)&&Object.hasOwn(data.require,'laravel/framework'))add(root,'Laravel',file);
    }else{
      // Configs are inspected as text, never evaluated, imported, or passed to package managers.
      const content=text.replace(/^\s*#.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
      if(/^(?:pom\.xml|(?:build|settings)\.gradle(?:\.kts)?)$/.test(name)){
        if(/org\.springframework\.boot/.test(content))add(root,'Spring Boot',file);
        if(/com\.android\.(?:application|library)/.test(content))add(root,'Android',file);
      }
      if(/^(pyproject\.toml|requirements.*\.txt|Pipfile)$/.test(name))for(const [pattern,label] of [[/\bdjango\b/i,'Django'],[/\bfastapi\b/i,'FastAPI'],[/\bflask\b/i,'Flask']] as const)if(pattern.test(content))add(root,label,file);
      if(name==='Gemfile'&&/\bgem\s*\(?\s*['"]rails['"]/.test(content))add(root,'Rails',file);
      if(name==='pubspec.yaml'&&/^\s*flutter\s*:/m.test(content))add(root,'Flutter',file);
      if(name==='Cargo.toml'&&/^\s*\[workspace\]\s*$/m.test(content))add(root,'Cargo Workspace',file);
    }
  }
  const nearest=(file:string)=>[...projects.values()].filter(p=>inside(file,p.root)).sort((a,b)=>b.root.length-a.root.length)[0];
  const conventional=(file:string)=>file.match(/^(?:apps|packages|libs|services|projects)\/[^/]+/)?.[0]??'.';
  const language:Record<string,string>={'.c':'C','.cc':'C++','.cpp':'C++','.cxx':'C++','.hpp':'C++','.hxx':'C++','.java':'Java','.kt':'Kotlin','.swift':'Swift','.py':'Python','.go':'Go','.rs':'Rust','.cs':'.NET','.fs':'.NET','.rb':'Ruby','.php':'PHP','.dart':'Dart','.vue':'Vue','.svelte':'Svelte','.astro':'Astro',
    '.js':'JavaScript','.jsx':'JavaScript','.mjs':'JavaScript','.cjs':'JavaScript','.ts':'TypeScript','.tsx':'TypeScript','.mts':'TypeScript','.cts':'TypeScript'};
  for(const file of scan.files){
    const technology=language[path.posix.extname(file)];if(!technology)continue;
    const owner=nearest(file);const fallback=conventional(file);
    // A root workspace manifest must not swallow independent conventional application roots.
    const root=owner&&owner.root!=='.'?owner.root:fallback;
    add(root,technology,file);
  }
  // Shared UI/library paths are responsibility hints, not proof of React or any other framework.
  for(const file of scan.files)if(/^(?:packages\/(?:ui|components|shared)|libs\/[^/]+)\/.*\.[cm]?[jt]sx?$/.test(file)){
    const root=conventional(file),p=nearest(file);
    if(!p||p.root==='.'||p.root===root)add(root,'JavaScript/TypeScript Library',file,true);
  }
  // Keep native platform subtrees of React Native/Flutter apps with their owning application.
  const mobile=[...projects.values()].filter(p=>p.technologies.has('React Native')||p.technologies.has('Expo')||p.technologies.has('Flutter')).sort((a,b)=>a.root.length-b.root.length);
  for(const p of [...projects.values()])for(const parent of mobile){
    const relative=parent.root==='.'?p.root:p.root.slice(parent.root.length+1);
    if(p!==parent&&inside(p.root,parent.root)&&/^(ios|android)(\/|$)/.test(relative)){
      for(const tech of p.technologies)parent.technologies.add(tech);for(const evidence of p.evidence)parent.evidence.add(evidence);projects.delete(p.root);break;
    }
  }
  const role=(p:Project)=>{
    const has=(...names:string[])=>names.some(n=>p.technologies.has(n));
    if(has('React Native','Expo','Flutter'))return 'mobile-applications';
    if(p.library)return 'web-components';
    const workspace=has('Nx','Turborepo','Lerna','npm/Yarn Workspaces','pnpm Workspaces','Angular Workspace','Go Workspace','Cargo Workspace','Gradle Workspace');
    const children=[...projects.keys()].some(root=>root!==p.root&&inside(root,p.root));
    const ownSource=[...p.evidence].some(file=>{
      const relative=p.root==='.'?file:file.slice(p.root.length+1);
      return source.test(file)&&(/^(src|app|pages)\//.test(relative)||/^(App|index)\.[jt]sx?$/.test(relative));
    });
    if(workspace&&children&&!ownSource)return 'workspace-tooling';
    if(has('Angular','React','Next.js','Vue','Nuxt','Svelte','SvelteKit','Astro'))return 'web-applications';
    if(has('Android'))return 'mobile-applications';
    if(has('Swift','Swift Package Manager','Xcode'))return 'native-applications';
    if(has('Java','Kotlin','Maven','Gradle','Spring Boot'))return 'jvm-applications';
    if(has('C','C++','CMake','Meson'))return 'cpp-projects';
    for(const [tech,key] of [['Python','python'],['Go','go'],['.NET','dotnet'],['Rust','rust'],['Ruby','ruby'],['PHP','php'],['Dart','dart']])if(has(tech))return `${key}-projects`;
    if(workspace)return 'workspace-tooling';
    return 'javascript-projects';
  };
  const groups=new Map<string,{project:Project;files:string[]}>();
  const ordered=[...projects.values()].sort((a,b)=>b.root.length-a.root.length||a.root.localeCompare(b.root));
  for(const file of scan.files){
    if(ci(file)){
      const key='ci-cd',g=groups.get(key)??{project:{root:'.',technologies:new Set<string>(['CI/CD']),evidence:new Set<string>(),library:false},files:[]};g.files.push(file);g.project.evidence.add(file);groups.set(key,g);continue;
    }
    if(!source.test(file)&&!markers.test(path.posix.basename(file)))continue;
    const p=ordered.find(p=>inside(file,p.root));if(!p)continue;
    const key=`${role(p)}:${p.root}`,g=groups.get(key)??{project:p,files:[]};g.files.push(file);groups.set(key,g);
  }
  const definitions:Definition[]=[],detections:Detection[]=[],selected=new Set<string>();
  const candidates=[...groups].sort(([a],[b])=>a.localeCompare(b));
  for(const [group,{project:p,files}] of candidates.slice(0,PROJECT_LIMIT)){
    const id=group==='ci-cd'?group:role(p),[title,scope]=roles[id];
    let pillar=definitions.find(d=>d.id===id);if(!pillar){pillar={id,title,scope,excludes:'Responsibilities owned by other approved pillars.',chapters:[]};definitions.push(pillar);}
    const chapterId=p.root==='.'?'overview':`${p.root.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'project'}-${createHash('sha256').update(p.root).digest('hex').slice(0,8)}`;
    const hints=ownershipHints([...files].sort((a,b)=>Number(p.evidence.has(b))-Number(p.evidence.has(a))||a.localeCompare(b)),scan),paths=hints.paths;
    for(const file of scan.files)if(paths.some(scope=>inside(file,scope)))selected.add(file);
    pillar.chapters.push({id:chapterId,title:p.root==='.'?'Overview':`Project ${p.root}`.slice(0,100),scope,excludes:'Unrelated projects and other pillar responsibilities.',paths});
    detections.push({root:p.root,technologies:[...p.technologies].sort(),evidence:[...p.evidence].sort().slice(0,6),evidenceCount:p.evidence.size,
      chapterId:`${id}/${chapterId}`,pathHintCount:paths.length,pathsTruncated:hints.truncated,matchedFileCount:files.length,
      ownershipCoverage:scan.truncated||hints.truncated?'incomplete':'scanned-files',directoryHints:hints.directoryHints,
      rationale:`${title} is a coarse candidate from ${[...p.technologies].sort().join(', ')} signals at ${p.root}. Inspect source to separate runtime, interfaces, tests, examples and delivery responsibilities; technology labels do not establish ownership.`});
  }
  const responsibilityHints=[
    {responsibility:'Native library or application',pattern:/(^|\/)(cpp|include|native)(\/|$)/},
    {responsibility:'Python interface or application',pattern:/(^|\/)(python|bindings)(\/|$)/},
    {responsibility:'Test validation and fixtures',pattern:/(^|\/)(tests?|testing)(\/|$)/},
    {responsibility:'Usage examples',pattern:/(^|\/)(examples?|samples?)(\/|$)/},
    {responsibility:'Build and delivery',pattern:/(^|\/)(CMakeLists\.txt|pyproject\.toml|package\.json|\.release-it\.[^/]+)$|(^|\/)\.github\/workflows\//},
  ].flatMap(({responsibility,pattern})=>{
    const paths=scan.files.filter(file=>pattern.test(file));return paths.length?[{responsibility,paths:paths.slice(0,6),pathCount:paths.length,pathsTruncated:paths.length>6,
      rationale:'Path conventions suggest a responsibility to review, not an approved boundary or a factual claim.'}]:[];
  });
  const deliveryFiles=scan.files.filter(file=>ci(file)||/(^|\/)(package\.json|pyproject\.toml|setup\.py|CMakeLists\.txt|\.release-it\.[^/]+)$/.test(file));
  const ownershipIncomplete=scan.truncated||candidates.length>PROJECT_LIMIT||detections.some(d=>d.pathsTruncated);
  return {schemaVersion:2,requiresDeveloperApproval:true,scan:{inspectedFiles:scan.files.length,inspectedEntries:scan.inspectedEntries,truncated:scan.truncated,limit:ENTRY_LIMIT,excludedPaths:exclude,skipped:scan.skipped,skippedCount:scan.skippedCount,manifestBytesRead,manifestByteLimit:TOTAL_BYTES},
    pillars:definitions,detections,detectedProjectCount:candidates.length,projectsTruncated:candidates.length>PROJECT_LIMIT,
    responsibilityHints,ownershipIncomplete,
    next:ownershipIncomplete?'Ownership hints are incomplete. Inspect omitted files and truncated trees, then expand or split boundaries before bootstrap. Do not publish the sampled map as complete.':'Review suggested responsibilities and directory boundaries against source, including unclassified and excluded areas, before bootstrap.',
    coveragePrompts:[...(deliveryFiles.length?[{responsibility:'Build and delivery',paths:deliveryFiles.slice(0,10),pathCount:deliveryFiles.length,pathsTruncated:deliveryFiles.length>10,
      questions:['How are versions chosen and releases triggered?','Which jobs build and test each artifact?','Where are artifacts published, and what gates publication?','Which distribution steps are external or not established by inspected source?'],
      basis:'Review prompts from detected filenames; validation does not establish completeness.'}]:[]),...formatArchitecturePrompts(scan.files)],
    warnings:warnings.slice(0,10),warningCount:warnings.length,unclassifiedSample:scan.files.filter(f=>!selected.has(f)).slice(0,30),
    note:'Heuristic candidates only. Frameworks are navigation signals, not facts or automatic pillar boundaries. Review and merge responsibility boundaries, expand sampled paths, and inspect unclassified or truncated areas. No facts or dependencies have been inferred.'};
}
