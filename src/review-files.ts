import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';

const document = (name: string) => /\.(md|mdx|rst|adoc)$/i.test(name) || /^readme(?:\.[^/]+)?$/i.test(name);
const excluded = (file: string) => file.split('/').some(p => ['.git','node_modules','.common-ground','dist','build','target','.nx','.next','coverage'].includes(p) || p.startsWith('.env'));

/** Bounded discovery of local documentation; never follows symlinks or remote links. */
export async function reviewDocuments(store: Store, paths: string[]) {
  const directories = new Set<string>();
  const files = new Set<string>();
  for (const file of paths) {
    await store.safe(file, true);
    if (excluded(file)) continue;
    let directory = path.posix.dirname(file);
    try { if ((await fs.stat(path.join(store.root, file))).isDirectory()) directory = file; }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    if (directory !== '.') directories.add(directory);
    if (document(file)) files.add(file);
  }
  // A root-level source change does not force a recursive scan of the whole monorepo.
  const direct = new Set<string>(['.']);
  for (const directory of directories) {
    let current = directory;
    while (current !== '.') { direct.add(current); current = path.posix.dirname(current); }
  }
  for (const directory of direct) {
    let entries;
    try { entries = await fs.readdir(path.join(store.root, directory), {withFileTypes:true}); }
    catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
    for (const entry of entries) {
      const file = path.posix.join(directory, entry.name);
      if (excluded(file) || entry.isSymbolicLink()) continue;
      if (entry.isFile() && document(entry.name)) files.add(file);
      // Include sibling directory READMEs without crawling every sibling subsystem.
      if (entry.isDirectory()) for (const child of await fs.readdir(path.join(store.root, file), {withFileTypes:true})) {
        if (child.isFile() && /^readme(?:\.[^/]+)?$/i.test(child.name)) files.add(`${file}/${child.name}`);
      }
    }
  }
  if (directories.size) {
    const scan = await store.walk([...directories], 10000);
    if (scan.truncated) throw new Error('Documentation discovery exceeds the beta scan limit; narrow chapter evidence scopes before review.');
    for (const file of scan.files) if (document(file)) files.add(file);
  }
  // Follow relative documentation references transitively, with cycles deduplicated.
  for (const file of files) {
    if (files.size > 1000) throw new Error('Documentation review exceeds the beta limit of 1,000 files.');
    let content;
    try {
      const safe = await store.safe(file);
      if ((await fs.stat(safe)).size > 2_000_000) throw new Error(`Documentation file too large: ${file}`);
      content = await fs.readFile(safe, 'utf8');
    } catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
    for (const match of content.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)[^)]*\)/g)) {
      let target = match[1].replace(/^<|>$/g, '').split('#')[0];
      try { target = decodeURIComponent(target); } catch { continue; }
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target) || target.includes('\\')) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (relative.startsWith('../') || excluded(relative) || !document(relative)) continue;
      await store.safe(relative, true);
      files.add(relative);
    }
  }
  return [...files].sort();
}
