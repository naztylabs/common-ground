import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { GroundError } from './errors.js';
import { relativePath } from './model.js';
import { isVersion, queryTerms, termMatch } from './matching.js';
import type { Store } from './store.js';

export const SourceSearch=z.object({
  query:z.string().trim().min(1).max(500),
  paths:z.array(relativePath).min(1).max(20).describe('Explicit source files or directories to search; repository-wide and excluded paths are not supported.'),
  limit:z.number().int().min(1).max(5).default(5),
}).strict();

const limits={entries:2000,files:200,fileBytes:1024*1024,totalBytes:4*1024*1024,excerptChars:300};
const excluded=new Set(['node_modules','dist','build','target','out','coverage','generated','vendor','vendored','bundled','dep','deps','dependencies','third_party','third-party','thirdparty','external','extern','venv','__pycache__','pods','carthage','deriveddata','bin','obj']);
const generated=/^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$|(?:\.min\.(?:js|css)|\.map|\.generated\.[^.]+)$/i;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const within=(file:string,scope:string)=>file===scope||file.startsWith(`${scope}/`);
const excludedPath=(file:string)=>file.split('/').some(part=>
  (part.startsWith('.')&&part!=='.github')||excluded.has(part.toLowerCase())||generated.test(part));
/** Pure eligibility check for suggestions; actual searches additionally reject symlinks. */
export function isSourceSearchPathAllowed(file:string):boolean {
  const parsed=relativePath.safeParse(file);
  return parsed.success&&!excludedPath(parsed.data);
}
type Source={path:string;text:string;matchedTerms:string[]};
type Candidate={path:string;line:number;excerpt:string;matchedTerms:string[];relevance:string;score:number};

function matchOffset(text:string,terms:string[]){
  let offset=0;
  // Keep original offsets while applying the same camel boundaries and technical
  // token grammar as words(). Check each token before locating a substring: 1.40
  // must not anchor 1.4, and "special" must not anchor the short token "ci".
  for(const segment of text.split(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/gu)){
    for(const token of segment.matchAll(/v?\d+(?:\.\d+)+(?:[-+][\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*)?|[\p{L}\p{N}]+/giu)){
      const matched=terms.filter(term=>termMatch(token[0],term)>0);
      if(matched.length){
        const positions=matched.map(term=>token[0].toLowerCase().indexOf(term)).filter(index=>index>=0);
        return offset+token.index+(positions.length?Math.min(...positions):0);
      }
    }
    offset+=segment.length;
  }
  return 0;
}

function excerpt(line:string,terms:string[]){
  const text=line.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim();
  if(text.length<=limits.excerptChars)return text;
  const versions=terms.filter(isVersion);
  const start=Math.max(0,matchOffset(text,versions.length?versions:terms)-80);
  return `${start?'…':''}${text.slice(start,start+limits.excerptChars)}${start+limits.excerptChars<text.length?'…':''}`;
}

/** Read-only lexical source evidence, intentionally separate from stored-knowledge lookup. */
export async function sourceSearch(store:Store,input:unknown){
  const args=SourceSearch.parse(input),terms=queryTerms(args.query);
  if(!terms.length||terms.length>32)throw new GroundError('SOURCE_SEARCH_QUERY','Use between one and 32 technical search terms.',['query'],'Narrow the query to a few source identifiers, concepts or versions.');
  const requested=[...new Set(args.paths)].sort(compare);
  for(const scope of requested){
    if(excludedPath(scope))throw new GroundError('SOURCE_SEARCH_PATH_EXCLUDED',`Excluded source-search path: ${scope}`,['paths'],'Select source files or directories outside dependencies, generated output and hidden configuration. .github is supported.');
    await store.safe(scope,true);
  }
  const scopes=requested.filter(scope=>!requested.some(other=>other!==scope&&within(scope,other)));
  const stats={entries:0,files:0,bytes:0,textFiles:0,skipped:{excluded:0,symlinks:0,binary:0,oversize:0,unreadable:0,changed:0,nonRegular:0,missing:0}};
  const reached=new Set<string>(),sources:Source[]=[];
  const stop=()=>reached.has('entries')||reached.has('files')||reached.has('totalBytes');
  const read=async(relative:string)=>{
    if(stats.files>=limits.files){reached.add('files');return;}
    stats.files++;
    let handle;
    try{
      const file=await store.safe(relative);
      handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const before=await handle.stat();
      if(!before.isFile()){stats.skipped.nonRegular++;return;}
      if(before.size>limits.fileBytes){stats.skipped.oversize++;return;}
      if(before.size>limits.totalBytes-stats.bytes){reached.add('totalBytes');return;}
      const buffer=Buffer.alloc(Math.min(before.size+1,limits.totalBytes-stats.bytes));
      let size=0;
      while(size<buffer.length){
        const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);
        if(!bytesRead)break;
        size+=bytesRead;stats.bytes+=bytesRead;
      }
      const after=await handle.stat();
      if(before.size!==size||before.size!==after.size||before.mtimeMs!==after.mtimeMs){stats.skipped.changed++;return;}
      const bytes=buffer.subarray(0,size);
      let text:string;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{stats.skipped.binary++;return;}
      if(bytes.includes(0)){stats.skipped.binary++;return;}
      stats.textFiles++;
      sources.push({path:relative,text,matchedTerms:terms.filter(term=>termMatch(`${relative}\n${text}`,term)>0)});
    }catch(error:any){
      if(error.code==='ELOOP'||String(error.message).startsWith('Symlinks are not supported'))stats.skipped.symlinks++;
      else if(error.code==='ENOENT')stats.skipped.missing++;
      else stats.skipped.unreadable++;
    }finally{await handle?.close();}
  };
  const visit=async(relative:string,enumerated=false):Promise<void>=>{
    if(stop())return;
    if(!enumerated){if(stats.entries>=limits.entries){reached.add('entries');return;}stats.entries++;}
    if(excludedPath(relative)){stats.skipped.excluded++;return;}
    let stat;
    try{stat=await fs.lstat(path.join(store.root,relative));}
    catch(error:any){if(error.code==='ENOENT')stats.skipped.missing++;else stats.skipped.unreadable++;return;}
    if(stat.isSymbolicLink()){stats.skipped.symlinks++;return;}
    if(stat.isFile()){await read(relative);return;}
    if(!stat.isDirectory()){stats.skipped.nonRegular++;return;}
    // Buffer only a bounded, complete directory listing before sorting. An overfull
    // directory is not searched in filesystem-dependent enumeration order.
    const children:string[]=[];
    try{
      const directory=await fs.opendir(await store.safe(relative));
      try{
        while(true){
          const entry=await directory.read();
          if(!entry)break;
          if(stats.entries>=limits.entries){reached.add('entries');return;}
          stats.entries++;children.push(`${relative}/${entry.name}`);
        }
      }finally{await directory.close();}
    }catch(error:any){
      if(String(error.message).startsWith('Symlinks are not supported'))stats.skipped.symlinks++;
      else stats.skipped.unreadable++;
      return;
    }
    for(const child of children.sort(compare)){await visit(child,true);if(stop())break;}
  };
  for(const scope of scopes){await visit(scope);if(stop())break;}
  const frequency=new Map(terms.map(term=>[term,sources.filter(source=>source.matchedTerms.includes(term)).length]));
  const broad=new Set(terms.filter(term=>!isVersion(term)&&sources.length>=3&&(frequency.get(term)??0)/sources.length>=0.75));
  const weights=new Map(terms.map(term=>[term,1+Math.log((sources.length+1)/((frequency.get(term)??0)+1))]));
  const direct:Candidate[]=[],shared:Candidate[]=[];
  let directCount=0,sharedCount=0;
  const rank=(a:Candidate,b:Candidate)=>b.score-a.score||compare(a.path,b.path)||a.line-b.line;
  for(const source of sources){
    if(!source.matchedTerms.length)continue;
    let start=0,lineNumber=1;
    while(start<source.text.length){
      const end=source.text.indexOf('\n',start),line=source.text.slice(start,end<0?undefined:end);
      const matched=terms.filter(term=>termMatch(line,term)>0);
      if(matched.length){
        const distinctive=matched.some(term=>!broad.has(term));
        const score=matched.reduce((total,term)=>total+(weights.get(term)??1)*(termMatch(line,term)+termMatch(source.path,term)),0);
        const candidate={path:source.path,line:lineNumber,excerpt:excerpt(line,matched),matchedTerms:matched,relevance:distinctive?'query-match':'shared-terms-only',score};
        const candidates=distinctive?direct:shared;
        if(distinctive)directCount++;else sharedCount++;
        candidates.push(candidate);candidates.sort(rank);if(candidates.length>args.limit)candidates.pop();
      }
      if(end<0)break;start=end+1;lineNumber++;
    }
  }
  const candidates=directCount?direct:shared,total=directCount||sharedCount;
  return {kind:'live-source-evidence',state:candidates.length?'matches':'no-matches',writesKnowledge:false,query:args.query,paths:scopes,
    items:candidates.map(({score,...item})=>item),total,resultLimit:args.limit,resultsTruncated:total>args.limit,
    downweightedTerms:[...broad],suppressedSharedTermMatches:directCount?sharedCount:0,
    scan:{...stats,truncated:reached.size>0,reachedLimits:[...reached],limits},
    basis:'Live local source lines from a bounded lexical search, separate from stored facts. Matches are navigation evidence, not an architectural answer; open the surrounding code and documentation. No project code was executed.',
  };
}
