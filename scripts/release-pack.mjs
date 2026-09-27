import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run release:pack.');

const directory = path.join(root, 'release');
await mkdir(directory, { recursive: true });
// Keep prepack enabled: it rebuilds the runtime and published JSON schemas.
execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts=false', '--pack-destination', directory], {
  cwd: root,
  stdio: 'inherit',
});

const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
const checksum = createHash('sha256').update(await readFile(path.join(directory, filename))).digest('hex');
await writeFile(path.join(directory, `${filename}.sha256`), `${checksum}  ${filename}\n`);
console.log(`Release assets: release/${filename} and release/${filename}.sha256`);
