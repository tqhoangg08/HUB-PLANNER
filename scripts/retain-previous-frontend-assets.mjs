import { constants } from 'node:fs';
import { copyFile, lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HASHED_ASSET = /^[\w.@+-]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');

export async function retainPreviousFrontendAssets(previousDist, nextDist, manifestPath) {
  const source = join(await realpath(previousDist), 'assets');
  const target = join(await realpath(nextDist), 'assets');
  if (source === target || !(await lstat(source)).isDirectory() || !(await lstat(target)).isDirectory()) {
    throw new Error('Separate builds with regular assets directories are required.');
  }
  const { assets } = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('Invalid asset manifest.');
  const names = (await readdir(source)).filter(
    name => HASHED_ASSET.test(name) && !/\.(?:map|html|webmanifest)$/i.test(name)
  ).sort();
  if (!names.length || names.length !== Object.keys(assets).length ||
      !names.every(name => Object.hasOwn(assets, 'assets/' + name) && SHA256.test(assets['assets/' + name]))) {
    throw new Error('The manifest must cover exactly the hashed assets in the reviewed previous build.');
  }

  const missing = [];
  for (const name of names) {
    const oldFile = join(source, name);
    const nextFile = join(target, name);
    const expected = assets['assets/' + name];
    if (!(await lstat(oldFile)).isFile() || await digest(oldFile) !== expected) {
      throw new Error('Previous asset digest mismatch: ' + name);
    }
    const newStat = await lstat(nextFile).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!newStat) missing.push(name);
    else if (!newStat.isFile() || await digest(nextFile) !== expected) {
      throw new Error('Hashed asset collision: ' + name);
    }
  }
  for (const name of missing) {
    await copyFile(join(source, name), join(target, name), constants.COPYFILE_EXCL);
  }
  return { verified: names.length, copied: missing.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [previous, next, manifest, ...other] = process.argv.slice(2);
  try {
    if (!previous || !next || !manifest || other.length) {
      throw new Error('Usage: node scripts/retain-previous-frontend-assets.mjs <previous-dist> <next-dist> <reviewed-manifest>');
    }
    console.log(JSON.stringify(await retainPreviousFrontendAssets(previous, next, manifest)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
