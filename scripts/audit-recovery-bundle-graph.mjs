import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST_ROOT = resolve('dist');
const manifest = JSON.parse(readFileSync(resolve(DIST_ROOT, '.vite', 'manifest.json'), 'utf8'));
const findChunkKey = (sourceName) => Object.keys(manifest).find((key) =>
  key.endsWith(sourceName) || String(manifest[key]?.file || '').includes(sourceName.replace(/\.tsx$/, '-')),
);
const recoveryKey = findChunkKey('recovery-entry.tsx');
const legacyKey = findChunkKey('legacy-entry.tsx');
const bootstrapKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry === true);

if (!bootstrapKey || !recoveryKey || !legacyKey) {
  throw new Error('RECOVERY_GRAPH_ENTRY_MISSING');
}

const reachableKeys = new Set();
const visit = (key, includeDynamicImports) => {
  if (reachableKeys.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error('RECOVERY_GRAPH_CHUNK_MISSING');
  reachableKeys.add(key);
  for (const importedKey of chunk.imports || []) visit(importedKey, includeDynamicImports);
  if (includeDynamicImports) {
    for (const importedKey of chunk.dynamicImports || []) visit(importedKey, true);
  }
};
visit(bootstrapKey, false);
visit(recoveryKey, true);

const reachableFiles = [...reachableKeys].map((key) => manifest[key].file).sort();
const source = reachableFiles
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(resolve(DIST_ROOT, file), 'utf8'))
  .join('\n');
const productionHtml = readFileSync(resolve(DIST_ROOT, 'index.html'), 'utf8');
const legacyFile = manifest[legacyKey].file;

const results = {
  RECOVERY_SUPABASE_REACHABLE: /supabase(?:\.auth|-js|Url|Key)/i.test(source),
  RECOVERY_BEARER_AUTH_REACHABLE: /Authorization.{0,40}Bearer|Bearer.{0,40}Authorization/i.test(source),
  RECOVERY_LEGACY_SESSION_STORAGE_REACHABLE: /(?:local|session)Storage/i.test(source),
  RECOVERY_LEGACY_CHUNK_REACHABLE: reachableKeys.has(legacyKey),
  RECOVERY_LEGACY_MODULEPRELOAD: new RegExp(`<link[^>]+modulepreload[^>]+${legacyFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(productionHtml),
};

console.log(`RECOVERY_ENTRY_CHUNKS=${reachableFiles.join(',')}`);
for (const [name, value] of Object.entries(results)) {
  console.log(`${name}=${value ? 'True' : 'False'}`);
}

if (Object.values(results).some(Boolean)) process.exitCode = 1;
