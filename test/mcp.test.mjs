import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../dist/store.js';
test('real stdio MCP handshake, discovery, retrieval, and validation errors',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-mcp-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/a.txt'),'format=v1');
 const store=new Store(root);await store.approveDefinitions([{id:'app',title:'Application',scope:'Application schemas and contracts.',excludes:'CI configuration.',paths:['app']}]);
 const client=new Client({name:'beta-test',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/cli.js'),'serve','--root',root],stderr:'pipe'});await client.connect(transport);t.after(()=>client.close());
 const listed=await client.listTools();assert.equal(listed.tools.length,5);assert.ok(!listed.tools.some(x=>/create|approve|seed/.test(x.name)));
 const result=await client.callTool({name:'list_pillars',arguments:{}});assert.match(result.content[0].text,/Application/);
 const missing=await client.callTool({name:'read_pillar',arguments:{id:'missing'}});assert.equal(missing.isError,true);
});
