import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './store.js';
import { Update } from './model.js';
const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data,null,2) }] });
export async function search(store: Store, query: string, limit = 8) {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const registry = await store.read();
  const matches = registry.pillars.flatMap(p => p.facts.map(f => ({ pillarId:p.id, fact:f, score:terms.reduce((n,t)=>n+Number(`${p.title} ${p.scope} ${f.statement} ${f.evidence.map(e=>e.path).join(' ')}`.toLowerCase().includes(t)),0) }))).filter(m=>m.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  const states = new Map();
  for (const m of matches) if (!states.has(m.pillarId)) states.set(m.pillarId,await store.status(registry.pillars.find(p=>p.id===m.pillarId)!));
  return matches.map(m=>({...m,freshness:states.get(m.pillarId)}));
}
export function createServer(store: Store) {
  const server = new McpServer({ name:'common-ground', version:'0.1.0-beta.1' });
  const register = (name: string, description: string, inputSchema: any, readOnly: boolean, fn: (args: any)=>Promise<unknown>) => server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:false}},async (args: any)=>{try{return result(await fn(args));}catch(e:any){return {...result({error:e.message}),isError:true};}});
  register('list_pillars','List established responsibility boundaries. Never create a new pillar when an existing one owns the work.',{},true,async()=> (await store.read()).pillars.map(({id,title,scope,excludes,paths,revision})=>({id,title,scope,excludes,paths,revision})));
  register('read_pillar','Read all facts and evidence, plus checkout freshness. Matching evidence does not prove semantic truth.',{id:z.string()},true,async({id})=>{const p=(await store.read()).pillars.find(p=>p.id===id);if(!p)throw new Error('Unknown pillar');return {pillar:p,freshness:await store.status(p)};});
  register('search_knowledge','Retrieve a bounded set of relevant facts and freshness using local keyword search.',{query:z.string().min(1),limit:z.number().int().min(1).max(20).optional()},true,({query,limit})=>search(store,query,limit));
  register('prepare_update','Only after authorized work directly invalidates facts: revalidate the ENTIRE pillar, preserve unrelated facts, ask the developer if uncertain. No new facts or pillars. No-op when facts are unchanged.',Update.shape,false,args=>store.prepare(args));
  register('commit_update','Publish a prepared revision only after a full pillar review and resolving uncertainty with the developer. Rejects source or knowledge changes since preparation.',{proposalId:z.string()},false,({proposalId})=>store.commit(proposalId));
  return server;
}
export async function serve(store: Store) { await createServer(store).connect(new StdioServerTransport()); }
