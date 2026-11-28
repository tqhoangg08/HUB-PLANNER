import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retainPreviousFrontendAssets } from './retain-previous-frontend-assets.mjs';

const baseline = JSON.parse(await readFile(
  new URL('../docs/public-release-baseline-65f4241b.json', import.meta.url), 'utf8'
));

export async function packageS1ReleaseAssets(archive, dist, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '') || !(await lstat(archive)).isDirectory()) {
    throw new Error('Reviewed v478 asset archive and manifest SHA-256 required');
  }
  const contents = (await readdir(archive)).sort();
  const manifestPath = join(archive, 'manifest.json');
  const assets = join(archive, 'assets');
  if (contents.join(',') !== 'assets,manifest.json' ||
      !(await lstat(manifestPath)).isFile() || !(await lstat(assets)).isDirectory()) {
    throw new Error('Invalid v478 asset archive layout');
  }
  const raw = await readFile(manifestPath);
  if (createHash('sha256').update(raw).digest('hex') !== expectedDigest) {
    throw new Error('Reviewed v478 manifest SHA-256 mismatch');
  }
  const manifest = JSON.parse(raw);
  const fields = 'assets,deploymentId,releaseRunId,releaseSha,schema,workerVersion';
  if (!manifest || Object.keys(manifest).sort().join(',') !== fields ||
      manifest.schema !== 1 || manifest.workerVersion !== baseline.version ||
      manifest.releaseSha !== baseline.sha || manifest.releaseRunId !== baseline.runId ||
      manifest.deploymentId !== baseline.deployment.id) {
    throw new Error('v478 asset manifest release identity mismatch');
  }
  if (!manifest.assets || (await readdir(assets)).some(name => !Object.hasOwn(manifest.assets, 'assets/' + name))) {
    throw new Error('Unexpected file in v478 asset archive');
  }

  return retainPreviousFrontendAssets(archive, dist, manifestPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [archive, dist, digest, ...extra] = process.argv.slice(2);
    if (!archive || !dist || !digest || extra.length) throw new Error('Missing reviewed asset archive, dist or digest');
    const result = await packageS1ReleaseAssets(archive, dist, digest);
    console.log(JSON.stringify({ previousVersion: baseline.version, manifestSha256: digest, ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
