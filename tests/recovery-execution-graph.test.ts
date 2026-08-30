import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import test from 'node:test';
import { selectApplicationEntry } from '../app/bootstrap/selectApplicationEntry.ts';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const resolveLocalImport = (fromFile: string, specifier: string) => {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(fromFile), specifier);
  if (extname(candidate) && existsSync(candidate)) return candidate;
  for (const extension of SOURCE_EXTENSIONS) {
    if (existsSync(`${candidate}${extension}`)) return `${candidate}${extension}`;
    if (existsSync(resolve(candidate, `index${extension}`))) return resolve(candidate, `index${extension}`);
  }
  return null;
};

const collectStaticSourceGraph = (entry: string) => {
  const files = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
      const imported = resolveLocalImport(file, match[1]);
      if (imported) visit(imported);
    }
  };
  visit(resolve(entry));
  return files;
};

test('bootstrap selects the recovery entry before any legacy module import', () => {
  assert.equal(selectApplicationEntry('/login', true), 'recovery');
  assert.equal(selectApplicationEntry('/forgot-password', true), 'recovery');
  assert.equal(selectApplicationEntry('/reset-password', true), 'recovery');
  assert.equal(selectApplicationEntry('/account', true), 'recovery');
  assert.equal(selectApplicationEntry('/dashboard', true), 'legacy');
  assert.equal(selectApplicationEntry('/login', false), 'legacy');

  const bootstrap = readFileSync('index.tsx', 'utf8');
  assert.match(bootstrap, /selectApplicationEntry\([\s\S]*window\.location\.pathname/);
  assert.match(bootstrap, /entry === 'recovery'[\s\S]*import\('\.\/recovery-entry'\)/);
  assert.match(bootstrap, /import\('\.\/legacy-entry'\)/);
  assert.doesNotMatch(bootstrap, /from ['"]\.\/(?:LegacyApp|legacy-entry|utils\/logWebError|utils\/appNotifications)['"]/);
  assert.ok(bootstrap.indexOf("entry === 'recovery'") < bootstrap.indexOf("import('./legacy-entry')"));
});

test('browser Supabase bootstrap dependency has been removed', () => {
  assert.equal(existsSync('utils/supabase.ts'), false);
  const bootstrap = readFileSync('index.tsx', 'utf8');
  assert.match(bootstrap, /Application startup failed/);
  assert.match(bootstrap, /category: classifyBootstrapFailure\(error\)/);
  assert.doesNotMatch(bootstrap, /console\.error\([^\n]*error\.message/);
  assert.doesNotMatch(bootstrap, /HUB_BROWSER_SUPABASE/);
});

test('recovery static source graph excludes legacy auth and browser storage modules', () => {
  const files = collectStaticSourceGraph('recovery-entry.tsx');
  const relativeFiles = [...files].map((file) => file.replace(`${resolve('.')}\\`, '').replaceAll('\\', '/'));
  const source = [...files].map((file) => readFileSync(file, 'utf8')).join('\n');

  assert.equal(relativeFiles.includes('legacy-entry.tsx'), false);
  assert.equal(relativeFiles.includes('LegacyApp.tsx'), false);
  assert.equal(relativeFiles.includes('utils/logWebError.ts'), false);
  assert.equal(relativeFiles.includes('utils/appNotifications.ts'), false);
  assert.equal(relativeFiles.includes('utils/supabase.ts'), false);
  assert.doesNotMatch(source, /supabase\.auth|Authorization\s*[:=].*Bearer|localStorage|sessionStorage/i);
});

test('legacy entry retains the existing legacy startup extensions', () => {
  const legacyEntry = readFileSync('legacy-entry.tsx', 'utf8');
  assert.match(legacyEntry, /import LegacyApp from '\.\/LegacyApp'/);
  assert.match(legacyEntry, /installAppNotificationBridge\(\)/);
  assert.match(legacyEntry, /installGlobalWebErrorHandlers\(\)/);
  assert.match(legacyEntry, /bootstrapBrowser\(\)/);
});

test('release manifest remains an operational record without constraining later cleanup work', () => {
  const manifest = readFileSync('docs/releases/4k4-r1-google-only-recovery.md', 'utf8');
  const inventorySection = manifest.split('## Exact candidate files')[1]?.split('## Release scope')[0] || '';
  const documented = [...inventorySection.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]).sort();
  assert.ok(documented.length > 0);
  assert.ok(documented.every((file) => typeof file === 'string' && file.length > 0));
});
