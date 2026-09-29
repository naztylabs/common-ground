import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { Store } from './store.js';
import type { RegistryRecord } from './model.js';

export const markdownPath = '.common-ground/local/knowledge.md';
const localName = 'local/knowledge.md';
const text = (value: string) => value.replace(/[\\`*_[\]<>#|]/g, '\\$&');
const paragraph = (value: string) => text(value).replace(/\r?\n/g, '\n\n');
const sourceLink = (file: string) => `[${text(file)}](../../${file.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')})`;
const factLink = (key: string) => `[${text(key)}](#fact-${key})`;
function quote(value: string) {
  const fence = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `${fence}text\n${value}\n${fence}`;
}

/** Complete, deterministic view of shared knowledge; no timestamps or local drafts. */
export function renderKnowledge(registry: RegistryRecord | null): string {
  const lines = ['# Common Ground knowledge', '',
    'Generated from [knowledge.json](../knowledge.json). This local file is disposable; edit the shared registry through the reviewed knowledge workflow.', '',
    'This is a snapshot of stored knowledge, not proof that every assertion is currently true. Verify current source and run `cground validate` before relying on it.', ''];
  if (!registry) return [...lines, '## No approved knowledge yet', '',
    'Review the [proposed responsibility map](bootstrap.json) with your developer. After approval and fact population, this file will contain the complete shared knowledge.', ''].join('\n');
  const chapters = registry.pillars.flatMap(p => p.chapters);
  lines.push(`Schema version: ${registry.schemaVersion}. Pillars: ${registry.pillars.length}. Chapters: ${chapters.length}. Facts: ${chapters.reduce((n,c) => n + c.facts.length,0)}.`, '',
    `Registry fingerprint (SHA-256): ${createHash('sha256').update(JSON.stringify(registry)).digest('hex')}`, '', '## Contents', '');
  if (!registry.pillars.length) lines.push('No pillars have been recorded.', '');
  for (const p of registry.pillars) {
    lines.push(`- [${text(p.title)}](#pillar-${p.id})`);
    for (const c of p.chapters) lines.push(`  - [${text(c.title)}](#chapter-${p.id}/${c.id}) — ${c.facts.length} facts`);
  }
  lines.push('');
  for (const p of registry.pillars) {
    lines.push(`<a id="pillar-${p.id}"></a>`, '', `## ${text(p.title)}`, '', `**Pillar ID:** ${p.id}`, '',
      `**Scope:** ${paragraph(p.scope)}`, '', `**Excludes:** ${paragraph(p.excludes)}`, '');
    for (const c of p.chapters) {
      const key = `${p.id}/${c.id}`;
      lines.push(`<a id="chapter-${key}"></a>`, '', `### ${text(c.title)}`, '', `**Chapter ID:** ${key} · **Revision:** ${c.revision}`, '',
        `**Scope:** ${paragraph(c.scope)}`, '', `**Excludes:** ${paragraph(c.excludes)}`, '', '**Owned paths**', '',
        ...c.paths.map(file => `- ${sourceLink(file)}`), '');
      if (!c.facts.length) lines.push('No facts recorded in this chapter.', '');
      for (const f of c.facts) {
        const factKey = `${key}/${f.id}`;
        lines.push(`<a id="fact-${factKey}"></a>`, '', `#### ${f.id}`, '', paragraph(f.statement), '',
          `**Fact ID:** ${factKey}`, '', '**Source scope**', '', ...f.sourceScope.map(file => `- ${sourceLink(file)}`), '',
          '**Depends on**', '', ...(f.dependsOn.length ? f.dependsOn.map(dep => `- ${factLink(dep)}`) : ['None.']), '', '**Evidence**', '');
        for (const e of f.evidence) lines.push(sourceLink(e.path), '', quote(e.quote), '');
      }
      // Preserve every stored baseline without burying the prose in machine metadata.
      lines.push('<details>', '<summary>Stored source hashes and dependency fingerprints</summary>', '', '**Source hashes**', '', '| Source | SHA-256 |', '| --- | --- |',
        ...Object.entries(c.sources).sort(([a],[b]) => a.localeCompare(b)).map(([file,hash]) => `| ${sourceLink(file)} | ${text(hash)} |`), '',
        '**Dependency fingerprints**', '', '| Fact | Fingerprint |', '| --- | --- |',
        ...Object.entries(c.dependencyFingerprints).sort(([a],[b]) => a.localeCompare(b)).map(([dep,hash]) => `| ${factLink(dep)} | ${text(hash)} |`), '', '</details>', '');
    }
  }
  return lines.join('\n');
}

/** Caller holds the store writer lock when publishing shared records. */
export async function writeKnowledgeExport(store: Store, registry: RegistryRecord | null) {
  const content = renderKnowledge(registry);
  await store.safe(markdownPath, true);
  try {
    if (await fs.readFile(store.file(localName), 'utf8') === content) return {path:markdownPath,changed:false};
  } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  await fs.mkdir(store.file('local'), {recursive:true});
  const temporary = store.file(`${localName}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary,content,{flag:'wx'});
    await fs.rename(temporary,store.file(localName));
  } finally { await fs.rm(temporary,{force:true}); }
  return {path:markdownPath,changed:true};
}

export async function refreshKnowledgeExport(store: Store) {
  return store.lock(async () => {
    let registry: RegistryRecord | null;
    try { registry = await store.read(); }
    catch (e: any) { if (e.code !== 'ENOENT') throw e; registry = null; }
    return writeKnowledgeExport(store,registry);
  });
}
