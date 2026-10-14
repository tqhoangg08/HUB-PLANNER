import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {validatePublicReleaseState} from '../scripts/check-public-release-state.mjs';
import {assertRehearsalTarget,canonicalRehearsalRows} from '../scripts/rehearse-advisor-d1-staging.mjs';
// Included by test:advisor and independent CI, without changing unrelated scripts.
import './public-release-v2-rollout.test.mjs';
import './wrangler-keep-vars.test.mjs';

test('PR CI uses no owner/Cloudflare secrets and remains read-only validation, never a production deployment',()=>{
  const ci=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
  assert.match(ci,/pull_request:/);
  assert.match(ci,/contents: read/);
  assert.match(ci,/persist-credentials: false/);
  assert.match(ci,/fetch-depth: 2/); // HEAD^ must exist for the diff check.
  assert.doesNotMatch(ci,/pull_request_target|workflow_run|secrets\.|wrangler|--remote|deploy-cloudflare-production|setup-advisor-app-staging/);
  for(const command of ['npm ci','npm run test:advisor','npm run typecheck','npm run cf:typecheck','npm run build','npm test'])assert.ok(ci.includes(command));
});

test('main merge cannot deploy Auth or apply pending migrations; Public release is manual and separately approved',()=>{
  const workflow=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8');
  assert.doesNotMatch(workflow,/\bpush:|\bpull_request:|wrangler\.auth|migrations apply|deploy:auth/);
  assert.match(workflow,/default: false/);assert.match(workflow,/environment: public-production/);
  assert.match(workflow,/needs: validate/);assert.match(workflow,/PUBLIC_RELEASE_GITHUB_READ_TOKEN/);
  assert.match(workflow,/actions: read/); // GET protected environment metadata only.
  assert.match(workflow,/check-public-release-state/);
  assert.match(workflow,/wrangler deploy --config cloudflare\/wrangler.jsonc --keep-vars/);
});

for(const job of ['validate','release-public'])test(`Public release ${job} uses CI-verified action SHAs and disables install lifecycle scripts`,()=>{
  const workflow=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8');
  const ci=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
  const block=workflow.split(`  ${job}:`)[1].split(/^  [a-z][a-z-]*:/m)[0];
  const pins={checkout:'11d5960a326750d5838078e36cf38b85af677262',
    'setup-node':'49933ea5288caeca8642d1e84afbd3f7d6820020'};
  for(const [action,sha]of Object.entries(pins)){
    assert.ok(ci.includes(`actions/${action}@${sha}`),'pin must match independently validated workflow');
    assert.deepEqual([...block.matchAll(new RegExp(`uses: actions/${action}@([^\\s]+)`,'g'))].map(m=>m[1]),[sha]);
  }
  assert.match(block,/persist-credentials: false/);
  assert.deepEqual([...block.matchAll(/run: (npm ci[^\r\n]*)/g)].map(m=>m[1]),['npm ci --ignore-scripts']);
  assert.doesNotMatch(block,/npm (?:rebuild|install)|--ignore-scripts=false/);
  assert.match(block,/npm run build/); // Explicit build still runs; dependency install hooks do not.
});
test('rehearsal never restores production or the original app staging DB',()=>{
  assert.equal(assertRehearsalTarget('isolated','hub-pr88-0054-rehearsal-aaaa','app'),undefined);
  for(const [id,name]of [['88d702e1-60d3-490a-8514-38ef881cf133','hub-pr88-0054-rehearsal-aaaa'],['app','hub-pr88-0054-rehearsal-aaaa'],['isolated','hub-planner-public-dev']])assert.throws(()=>assertRehearsalTarget(id,name,'app'));
});

test('rehearsal digests preserve all rows without relying on rowid or result order',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE fixture(id TEXT PRIMARY KEY,v TEXT) WITHOUT ROWID; INSERT INTO fixture VALUES('b','2'),('a','1')");
    const rows=db.prepare('SELECT * FROM fixture').all();
    assert.deepEqual(canonicalRehearsalRows(rows),canonicalRehearsalRows([...rows].reverse().map(r=>({v:r.v,id:r.id}))));
    assert.notDeepEqual(canonicalRehearsalRows(rows),canonicalRehearsalRows(rows.slice(1)));
  } finally {db.close();}
});

test('additional-topic staging has the existing empty course schema before context retrieval',()=>{
  const setup=readFileSync('scripts/setup-advisor-app-staging.mjs','utf8');
  assert.match(setup,/prepare-context/);assert.match(setup,/live.name!==NAME/);
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of ['0001_create_school_announcements','0002_create_course_schedules','0003_reduce_read_amplification','0018_add_course_authority_foundation','0011_create_user_schedules'])db.exec(readFileSync(`cloudflare/migrations/${name}.sql`,'utf8'));
    assert.deepEqual(db.prepare("SELECT id FROM course_schedules WHERE catalogue_visibility='published' AND retired_at IS NULL AND subject_name_search LIKE ? ORDER BY source_position LIMIT 8").all('%hoc%'),[]);
    assert.equal(db.prepare('SELECT COUNT(*) AS rows FROM course_schedules').get().rows,0);
    assert.deepEqual(db.prepare('SELECT us.semester,cs.subject_name FROM user_schedules us LEFT JOIN course_schedules cs ON cs.id=us.course_id WHERE us.user_id=? ORDER BY us.created_at DESC LIMIT 24').all('synthetic'),[]);
    assert.match(setup,/0011_create_user_schedules.sql/);
  }finally{db.close();}
});
test('Public live-state preflight rejects canary drift and missing 0054 without writing anything',()=>{
  const config={name:'hub-planner-public-dev-api',main:'worker/src/index.ts',vars:{AI_ADVISOR_V2_MODE:'canary',AI_ADVISOR_V2_CANARY_PERCENT:'100',AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'},assets:{binding:'ASSETS'},ai:{binding:'AI'},observability:{enabled:true}};
  const settings={bindings:[{name:'ASSETS',type:'assets'},{name:'AI',type:'ai'},...Object.entries(config.vars).map(([name,text])=>({name,type:'plain_text',text}))],observability:config.observability};
  const schema=['ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status'].map(name=>({name}));
  assert.equal(validatePublicReleaseState(config,settings,schema),true);
  assert.throws(()=>validatePublicReleaseState(config,settings,[]),/0054/);
  assert.throws(()=>validatePublicReleaseState(config,{...settings,bindings:settings.bindings.map(b=>b.name==='AI_ADVISOR_V2_MODE'?{...b,text:'on'}:b)},schema));
  assert.throws(()=>validatePublicReleaseState(config,{...settings,observability:{enabled:false}},schema));
  const unset={...settings,bindings:settings.bindings.filter(b=>!b.name.startsWith('AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST'))};
  assert.throws(()=>validatePublicReleaseState(config,unset,schema),/INITIAL_DOCUMENT_POLICY_MUST_BE_OFF/);
  for(const [name,text] of [['AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED','true'],['AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT','1'],['AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT','']]) {
    assert.throws(()=>validatePublicReleaseState(config,{...unset,bindings:[...unset.bindings,{name,type:'plain_text',text}]},schema));
  }
});

test('full V2 rollout configuration leaves both document opt-ins off and preserves canary fallback mode',()=>{
  const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
  assert.equal(parsed.error,undefined);
  assert.equal(parsed.config.vars.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED,'false');
  assert.equal(parsed.config.vars.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED,'false');
  assert.equal(parsed.config.vars.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT,'0');
  assert.equal(parsed.config.vars.AI_ADVISOR_V2_MODE,'canary');
  assert.equal(String(parsed.config.vars.AI_ADVISOR_V2_CANARY_PERCENT),'100');
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
