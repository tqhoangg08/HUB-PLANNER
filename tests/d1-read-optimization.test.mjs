import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';

test('isolated D1 preserves query results and reduces default reads', async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    await db.exec("CREATE TABLE school_announcements(id INTEGER PRIMARY KEY,title TEXT NOT NULL,title_search TEXT NOT NULL,link TEXT NOT NULL,date TEXT,is_new INTEGER NOT NULL DEFAULT 0,created_at TEXT,is_hidden INTEGER NOT NULL DEFAULT 0); CREATE INDEX school_announcements_visible_date_created_idx ON school_announcements(is_hidden,date DESC,created_at DESC);");
    await db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO school_announcements SELECT x,'synthetic','synthetic', 'https://invalid.example/'||x, CASE WHEN x%17=0 THEN NULL ELSE '2026-09-09' END,0,'2026-09-09',x%7=0 FROM n;");
    const select = 'SELECT id,title,link,is_new,date,created_at FROM school_announcements WHERE ';
    for (const suffix of ['', " AND title_search LIKE '%synthetic%'", " AND date >= '2026-09-01'", " AND date <= '2026-09-09'"]) {
      for (const offset of [0, 10, 50]) {
        const tail = suffix + ` ORDER BY date DESC,created_at DESC LIMIT 10 OFFSET ${offset}`;
        const before = await db.prepare(select + 'COALESCE(is_hidden,0)=0' + tail).all();
        const after = await db.prepare(select + 'is_hidden=0' + tail).all();
        assert.deepEqual(after.results, before.results);
        if (!suffix && !offset) {
          console.log('ISOLATED_ANNOUNCEMENT_ROWS_READ=' + JSON.stringify({before: before.meta.rows_read, after: after.meta.rows_read}));
          assert.ok(after.meta.rows_read <= before.meta.rows_read * 0.1);
        }
      }
    }
    await db.exec('CREATE TABLE auth_user(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE); CREATE TABLE app_auth_identifiers(student_code TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES auth_user(id));');
    await db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO auth_user SELECT 'u'||x,'synthetic'||x||'@invalid.example' FROM n;");
    await db.exec("INSERT INTO app_auth_identifiers SELECT 's'||substr(id,2),id FROM auth_user;");
    const source = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts','utf8');
    const sql = source.match(/`(SELECT email FROM auth_user[\s\S]*?)`/)[1];
    const before = await db.prepare('SELECT u.email FROM auth_user u LEFT JOIN app_auth_identifiers i ON i.user_id=u.id WHERE i.student_code=?1 OR u.email=?2 LIMIT 1').bind('s10000','synthetic10000@invalid.example').all();
    const after = await db.prepare(sql).bind('s10000','synthetic10000@invalid.example').all();
    assert.deepEqual(after.results,before.results);
    console.log('ISOLATED_AUTH_ROWS_READ=' + JSON.stringify({before:before.meta.rows_read,after:after.meta.rows_read}));
    assert.ok(after.meta.rows_read <= before.meta.rows_read*0.2);
  } finally { await mf.dispose(); }
});
