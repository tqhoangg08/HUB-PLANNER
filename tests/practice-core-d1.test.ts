import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('cloudflare/migrations/0038_practice_core_d1_authority.sql', 'utf8')
  .replace(/^--.*\r?\n/gm, '');

test('Practice core D1 schema preserves metadata, attempts, pro access, and indexed owner reads', () => {
  for (const table of ['practice_sets', 'practice_attempts', 'practice_pro_access']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /storage_provider TEXT NOT NULL DEFAULT 'supabase'/);
  assert.match(migration, /content_key TEXT NOT NULL/);
  assert.match(migration, /weak_topics_json TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(migration, /practice_sets_owner_updated_idx/);
  assert.match(migration, /practice_attempts_user_submitted_idx/);
  assert.match(migration, /practice_pro_access_expires_idx/);
  assert.match(migration, /practice_core_migrations/);
});

test('Practice core migration is explicit, bounded, owner-safe, and avoids unchanged rewrites', () => {
  const script = readFileSync('scripts/migrate-practice-core-to-d1.mjs', 'utf8');
  const accountDelete = readFileSync('cloudflare/worker/src/account-delete.ts', 'utf8');
  const sourceCleanup = readFileSync('supabase/migrations/20260915160000_remove_practice_core_from_account_delete_preflight.sql', 'utf8');
  assert.match(script, /--apply --remote/);
  assert.match(script, /const LOOKUP_BATCH_SIZE = 80/);
  assert.match(script, /mapLegacyPolicyConsentOwners/);
  assert.match(script, /PRACTICE_CORE_OWNER_MAPPING_INCOMPLETE/);
  assert.match(script, /estimatedD1RowsReadUpperBound/);
  assert.match(script, /estimatedD1RowsWrittenUpperBound/);
  assert.match(script, /fileURLToPath/);
  assert.match(script, /WHERE practice_sets\.canonical_hash IS NOT excluded\.canonical_hash/);
  assert.match(script, /WHERE practice_attempts\.canonical_hash IS NOT excluded\.canonical_hash/);
  assert.match(script, /WHERE practice_pro_access\.canonical_hash IS NOT excluded\.canonical_hash/);
  assert.doesNotMatch(script, /practice-sets.*put\(|SUPABASE_STORAGE/i);
  assert.doesNotMatch(accountDelete, /delete_practice_pro_access_for_account_cleanup|source_delete:practice_sets|source_patch:practice_sets/);
  assert.doesNotMatch(sourceCleanup, /practice_sets|practice_attempts|practice_pro_access|delete_practice_pro_access/);
});
