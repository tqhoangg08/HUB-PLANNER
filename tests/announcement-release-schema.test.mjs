import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateAnnouncementReleaseSchema,ANNOUNCEMENT_MIGRATION} from '../scripts/announcement-release-schema.mjs';
import {announcementReleaseFixture} from './announcement-release-fixture.mjs';

const {objects,ledger}=announcementReleaseFixture();
test('0060 exact SQLite schema and full migration filename are accepted',()=>{
  assert.equal(validateAnnouncementReleaseSchema(objects,ledger),true);
});
test('unmigrated schema and a forged ledger for an unmigrated schema are rejected',()=>{
  const old=announcementReleaseFixture(false);
  assert.throws(()=>validateAnnouncementReleaseSchema(old.objects,old.ledger),/MIGRATION_LEDGER/);
  assert.throws(()=>validateAnnouncementReleaseSchema(old.objects,ledger),/SCHEMA_DRIFT/);
});
test('missing, duplicate, malformed or unrelated migration receipts fail closed',()=>{
  for(const invalid of [undefined,null,{},[],[null],[{name:'0060_other.sql'}],[...ledger,...ledger]])
    assert.throws(()=>validateAnnouncementReleaseSchema(objects,invalid),/MIGRATION_LEDGER/);
});
for(const object of objects)test(`0060 rejects missing, duplicate or altered ${object.type}: ${object.name}`,()=>{
  assert.throws(()=>validateAnnouncementReleaseSchema(objects.filter(o=>o!==object),ledger),/SCHEMA_DRIFT/);
  assert.throws(()=>validateAnnouncementReleaseSchema([...objects,object],ledger),/SCHEMA_DRIFT/);
  assert.throws(()=>validateAnnouncementReleaseSchema(objects.map(o=>o===object?{...o,sql:o.sql+' tampered'}:o),ledger),/SCHEMA_DRIFT/);
});
test('partial migration columns, wrong defaults/constraints and weakened push/ownership guards fail closed',()=>{
  for(const [name,from,to]of [
    ['school_announcements','is_highlighted INTEGER NOT NULL DEFAULT 0','is_highlighted TEXT'],
    ['school_announcements','CHECK(content_overridden IN (0,1))','CHECK(content_overridden IN (0,1,2))'],
    ['school_announcements','admin_revision INTEGER NOT NULL DEFAULT 0','admin_revision INTEGER NOT NULL DEFAULT 1'],
    ['school_announcement_push_queue','announcement_id INTEGER NOT NULL UNIQUE','announcement_id INTEGER NOT NULL'],
    ['school_announcements_hide_push','sent_at IS NULL AND failed_at IS NULL','sent_at IS NULL'],
    ['school_announcements_content_owner','NEW.admin_revision=OLD.admin_revision','NEW.admin_revision>=OLD.admin_revision'],
  ]){
    const changed=objects.map(o=>o.name===name?{...o,sql:o.sql.replace(from,to)}:o);
    assert.notDeepEqual(changed,objects,from);
    assert.throws(()=>validateAnnouncementReleaseSchema(changed,ledger),/SCHEMA_DRIFT/);
  }
});
test('SQL whitespace outside literals is harmless, but changed literals are rejected',()=>{
  assert.equal(validateAnnouncementReleaseSchema(objects.map(o=>({...o,sql:o.sql+'  ;\n'})),ledger),true);
  const changed=objects.map(o=>o.name==='school_announcements_hide_push'?{...o,sql:o.sql.replace("'ANNOUNCEMENT_HIDDEN'","'ANNOUNCEMENT HIDDEN'")}:o);
  assert.throws(()=>validateAnnouncementReleaseSchema(changed,ledger),/SCHEMA_DRIFT/);
});
test('required independent validation and release validation include announcement regressions without skips',()=>{
  const ci=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
  const release=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8');
  for(const source of [ci,release]){
    for(const file of ['admin-announcements.test.ts','announcement-d1-authority.test.ts','cloudflare-announcements-model.test.ts','push-delivery-write-optimization.test.ts','announcement-release-schema.test.mjs'])assert.ok(source.includes(`tests/${file}`));
    assert.doesNotMatch(source,/continue-on-error|migrations apply|skip_guard/);
  }
  assert.ok(ci.includes('run: node --test --experimental-strip-types tests/admin-announcements.browser.test.ts'));
  assert.match(ci,/name: AI Advisor independent validation/);
});
test('historical v472 release evidence is preserved byte-for-byte in Git form',()=>{
  const path='docs/public-release-baseline-2a898cfc.json';
  const old=spawnSync('git',['rev-parse',`bba1b6f357077646b9ce16070e4abf8fc0ac0304:${path}`],{encoding:'utf8'});
  const current=spawnSync('git',['hash-object',`--path=${path}`,path],{encoding:'utf8'});
  assert.equal(old.status,0);assert.equal(current.status,0);assert.equal(current.stdout,old.stdout);
  assert.equal(ANNOUNCEMENT_MIGRATION,'0060_school_announcement_management.sql');
});
