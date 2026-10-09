import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../dist/store.js';

const cli = process.env.CGROUND_TEST_CLI ?? path.resolve('dist/cli.js');
const guard = fileURLToPath(new URL('./support/network-guard.mjs', import.meta.url));

for (const profile of ['compact', 'full']) for (const restricted of [false, true]) {
  test(`${profile} stdio remains local and validates untrusted data${restricted ? ' without string code generation' : ''}`, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cground-security-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, 'app'));
    await fs.writeFile(path.join(root, 'app/contract.txt'), 'synthetic-format=v1\n');
    const store = new Store(root);
    await store.approveDefinitions([{
      id: 'app', title: 'Synthetic application', scope: 'Synthetic contracts.', excludes: 'Other systems.',
      chapters: [{ id: 'contract', title: 'Contract', scope: 'Synthetic contracts.', excludes: 'Other systems.', paths: ['app'] }],
    }]);
    await store.seed('app/contract', [{
      id: 'format', statement: 'The synthetic contract uses v1.',
      evidence: [{ path: 'app/contract.txt', quote: 'synthetic-format=v1' }], sourceScope: ['app/contract.txt'], dependsOn: [],
    }]);
    const before = await fs.readFile(store.file('knowledge.json'));
    const beforeStat = await fs.stat(store.file('knowledge.json'));
    const localBefore = (await fs.readdir(store.file('local'))).sort();
    const client = new Client({ name: 'synthetic-security', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...(restricted ? ['--disallow-code-generation-from-strings'] : []), '--import', guard, cli, 'serve', '--profile', profile, '--root', root],
      stderr: 'pipe',
    });
    let diagnostics = '';
    transport.stderr.on('data', chunk => { diagnostics += chunk; });
    t.after(async () => { await client.close(); assert.doesNotMatch(diagnostics, /CGROUND_TEST_NETWORK_DENIED/); });
    try { await client.connect(transport); }
    catch (error) { throw new Error(`${error.message}\nServer diagnostics: ${diagnostics}`, { cause: error }); }
    const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(client.getServerVersion().version, manifest.version);
    assert.equal((await client.listTools()).tools.length, profile === 'compact' ? 6 : 14);
    const call = (operation, args) => client.callTool({ name: 'cground', arguments: { operation, args } });
    const data = async (operation, args) => {
      const result = await call(operation, args);
      assert.equal(result.isError, undefined, JSON.stringify(result));
      return JSON.parse(result.content[0].text);
    };
    const lookup = await data('lookup', { query: 'synthetic contract', verify: true });
    assert.equal(lookup.items[0].factId, 'app/contract/format');
    assert.equal(lookup.items[0].freshness.status, 'evidence-unchanged');
    const search = await data('source-search', { query: 'synthetic-format', paths: ['app'] });
    assert.equal(search.items[0].path, 'app/contract.txt');
    // Code-looking request text remains data, including on the SDK's normal JIT path.
    const marker = path.join(root, 'executed');
    const payload = `"; globalThis.process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); //`;
    await data('lookup', { query: payload });
    await data('source-search', { query: payload, paths: ['app'] });
    await assert.rejects(fs.access(marker), { code: 'ENOENT' });
    for (const args of [{ query: 'synthetic', paths: ['../outside'] }, { query: 42, paths: ['app'] }]) {
      assert.equal((await call('source-search', args)).isError, true);
    }
    assert.deepEqual(await fs.readFile(store.file('knowledge.json')), before);
    assert.equal((await fs.stat(store.file('knowledge.json'))).mtimeMs, beforeStat.mtimeMs);
    assert.deepEqual((await fs.readdir(store.file('local'))).sort(), localBefore);
  });
}
