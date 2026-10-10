import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

test('PR CI is credential-free validation, never a production deployment',()=>{
  const ci=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
  assert.match(ci,/pull_request:/);
  assert.match(ci,/contents: read/);
  assert.match(ci,/persist-credentials: false/);
  assert.match(ci,/fetch-depth: 2/); // HEAD^ must exist for the diff check.
  assert.doesNotMatch(ci,/pull_request_target|workflow_run|secrets\.|wrangler|--remote|deploy-cloudflare-production|setup-advisor-app-staging/);
  for(const command of ['npm ci','npm run test:advisor','npm run typecheck','npm run cf:typecheck','npm run build','npm test'])assert.ok(ci.includes(command));
});

test('initial release configuration leaves completeness off and canary at seven percent',()=>{
  const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
  assert.equal(parsed.error,undefined);
  assert.equal(parsed.config.vars.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED,'false');
  assert.equal(parsed.config.vars.AI_ADVISOR_V2_MODE,'canary');
  assert.equal(String(parsed.config.vars.AI_ADVISOR_V2_CANARY_PERCENT),'7');
  assert.ok(!String(parsed.config.main).includes('staging'));
});

test('clean CI lockfile retains optional WASM peer dependency closure',()=>{
  const {packages}=JSON.parse(readFileSync('package-lock.json','utf8'));
  const core=packages['node_modules/@emnapi/core'];
  const threads=packages['node_modules/@emnapi/wasi-threads'];
  assert.ok(core&&threads,'npm10 clean CI reproduced missing optional peers');
  assert.equal(core.dependencies['@emnapi/wasi-threads'],threads.version);
  assert.equal(core.optional,true);
  assert.equal(threads.optional,true);
  for(const dependency of [core,threads]){
    assert.match(dependency.resolved,/^https:\/\/registry\.npmjs\.org\/@emnapi\//);
    assert.match(dependency.integrity,/^sha512-/);
  }
});

test('0054 preserves old document rows and old SQL while new sources default to unprepared',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE ai_documents(id TEXT PRIMARY KEY, content_hash TEXT, version INTEGER, indexing_status TEXT, deleted_at TEXT)");
    db.exec("INSERT INTO ai_documents VALUES('active','hash',1,'completed',NULL),('deleted','hash2',1,'deleted','date')");
    const before=db.prepare('SELECT * FROM ai_documents ORDER BY id').all();
    const migration=readFileSync('cloudflare/migrations/0054_ai_document_search_ingestion_state.sql','utf8');
    assert.doesNotMatch(migration,/\b(DROP|DELETE|UPDATE|INSERT|REPLACE)\b/i);
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT id,content_hash,version,indexing_status,deleted_at FROM ai_documents ORDER BY id').all(),before);
    assert.deepEqual(db.prepare('SELECT id FROM ai_documents WHERE deleted_at IS NULL AND indexing_status=\'completed\'').all().map(r=>r.id),['active']);
    assert.ok(db.prepare('SELECT ai_search_status,ai_search_revision,ocr_uncertain_tokens,gemini_indexing_status FROM ai_documents').all().every(r=>r.ai_search_status==='not_prepared'&&r.ai_search_revision===null&&r.ocr_uncertain_tokens===0&&r.gemini_indexing_status===null));
    assert.throws(()=>db.exec("UPDATE ai_documents SET ai_search_status='invented'"),/CHECK constraint/);
    // Not idempotent raw SQL: a partial/repeated application must STOP, not be
    // blindly rerun. The operator uses the migration ledger and schema probe.
    assert.throws(()=>db.exec(migration),/duplicate column/);
  }finally{db.close();}
});
