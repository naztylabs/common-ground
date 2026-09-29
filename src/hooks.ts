import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from './store.js';

const exec = promisify(execFile);
async function git(root: string, args: string[]) {
  return (await exec('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;
}
const hook = `#!/bin/sh
# Common Ground advisory pre-commit hook
if command -v cground >/dev/null 2>&1; then
  cground hook check
elif [ "$(git config --local --get commonGround.hookNotifications)" != "false" ]; then
  printf '%s\\n' 'Common Ground: check unavailable; install cground to review knowledge before sharing.' >&2
fi
exit 0
`;

export async function installHook(store: Store) {
  let root: string;
  try { root = (await git(store.root, ['rev-parse', '--show-toplevel'])).trim(); }
  catch { return 'No Git checkout; run cground init after git init to enable the pre-commit reminder.'; }
  if (path.resolve(root) !== path.resolve(store.root)) return 'Initialize at the Git root to enable the pre-commit reminder.';
  // Hook managers own their entry point. Never replace their configuration or scripts.
  let custom = '';
  try { custom = (await git(root, ['config', '--get', 'core.hooksPath'])).trim(); } catch {}
  if (custom) return 'Existing hook manager preserved. Add cground hook check to its pre-commit hook to enable reminders.';
  const target = path.resolve(root, (await git(root, ['rev-parse', '--git-path', 'hooks/pre-commit'])).trim());
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile() || await fs.readFile(target, 'utf8') !== hook)
      return 'Existing pre-commit hook preserved. Add cground hook check to it to enable reminders.';
    await fs.chmod(target, 0o755);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, hook, { flag: 'wx', mode: 0o755 });
  }
  return 'Pre-commit reminder installed (advisory). Control notifications with cground hook mute / unmute.';
}

export async function hookNotifications(store: Store, enabled: boolean) {
  await git(store.root, ['config', '--local', 'commonGround.hookNotifications', String(enabled)]);
  return `Pre-commit notifications ${enabled ? 'enabled' : 'muted'} for this checkout. Checks remain advisory. Run cground hook ${enabled ? 'mute' : 'unmute'} to ${enabled ? 'mute' : 'restore'} them.`;
}

// Export the index so unstaged edits cannot hide stale facts in the proposed commit.
// No commands from the repository are executed, and no knowledge is rewritten.
export async function checkHook(store: Store): Promise<string> {
  let muted = false;
  let temporary: string | undefined;
  try {
    try { muted = (await git(store.root, ['config', '--local', '--get', 'commonGround.hookNotifications'])).trim() === 'false'; } catch {}
    // Muted notifications have no observable result; avoid exporting and hashing the index.
    if (muted) return '';
    const root = (await git(store.root, ['rev-parse', '--show-toplevel'])).trim();
    const staged = (await git(root, ['diff', '--cached', '--name-only', '-z'])).split('\0');
    if (!staged.some(Boolean)) return '';
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cground-index-'));
    // Disable checkout filters: validation must not run project scripts or fetch LFS data.
    let filters: string[] = [];
    try { filters = (await git(root, ['config', '--name-only', '--get-regexp', '^filter\\..*\\.(smudge|process|required)$'])).trim().split('\n').filter(Boolean); } catch (e: any) { if(e.code !== 1) throw e; }
    const overrides = filters.flatMap(key => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`]);
    await git(root, [...overrides, 'checkout-index', '--all', `--prefix=${temporary}/`]);
    const snapshot = new Store(temporary);
    const knowledgePath = '.common-ground/knowledge.json';
    const notes: string[] = [];
    // Local receipts are ignored and must never be imported from the index.
    await snapshot.safe('.common-ground/local', true);
    await fs.rm(snapshot.file('local'), { recursive: true, force: true });
    let registry;
    try { registry = await snapshot.read(); }
    catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
      return muted ? '' : 'Common Ground: no knowledge.json is staged. Complete setup and review the knowledge before sharing it. Commit allowed.';
    }
    // A no-op review remains valid only if its complete fingerprints match this index.
    const working = new Store(root);
    for (const { key } of snapshot.chapters(registry)) {
      const receipt = `local/review-${key.replace('/', '--')}.json`;
      try {
        await working.safe(`.common-ground/${receipt}`);
        const content = await fs.readFile(working.file(receipt), 'utf8');
        await fs.mkdir(snapshot.file('local'), { recursive: true });
        await fs.writeFile(snapshot.file(receipt), content);
      } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    }
    for (const { key, chapter } of snapshot.chapters(registry)) {
      const state = await snapshot.status(key, registry);
      try { await snapshot.validateFacts(chapter); }
      catch { notes.push(`${key}: evidence needs review`); continue; }
      if (state.status !== 'evidence-unchanged') notes.push(`${key}: ${state.status}`);
    }
    if (staged.includes(knowledgePath)) notes.push('Ready to make these facts available to the team? Review git diff --cached -- .common-ground/knowledge.json before sharing.');
    if (!notes.length || muted) return '';
    return `Common Ground — staged knowledge review:\n${notes.map(n => `  ${n}`).join('\n')}\nReview .common-ground/knowledge.json against the staged source. Commit allowed.\nMute reminders: cground hook mute`;
  } catch (e: any) {
    return muted ? '' : `Common Ground: staged knowledge check could not complete: ${e.message}\nReview .common-ground/knowledge.json before sharing. Commit allowed.`;
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}
