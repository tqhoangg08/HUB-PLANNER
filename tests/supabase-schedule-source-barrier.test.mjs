import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';

const MIGRATION = 'supabase/migrations/20260812120000_schedule_cutover_source_barrier.sql';
const BRIDGE_MIGRATION = 'supabase/migrations/20260813120000_add_better_auth_schedule_import_bridge.sql';
const BARRIER_MESSAGE = 'HUB_SCHEDULE_SOURCE_WRITES_DISABLED';

const findPgBin = () => {
  if (process.env.PG_BIN && existsSync(path.join(process.env.PG_BIN, 'initdb.exe'))) return process.env.PG_BIN;
  if (process.platform === 'win32' && existsSync('C:/Program Files/PostgreSQL')) {
    for (const version of readdirSync('C:/Program Files/PostgreSQL').sort((a, b) => Number(b) - Number(a))) {
      const candidate = path.join('C:/Program Files/PostgreSQL', version, 'bin');
      if (existsSync(path.join(candidate, 'initdb.exe'))) return candidate;
    }
  }
  return null;
};

const freePort = async () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const rolePrefix = (role, userId = '') => `
  set role ${role};
  set request.jwt.claim.role = '${role}';
  set request.jwt.claim.sub = '${userId}';
`;

const setupSql = `
  create role anon noinherit;
  create role authenticated noinherit;
  create role service_role noinherit bypassrls;
  create role ordinary_client noinherit;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;

  create table public.course_schedules (
    id uuid primary key default gen_random_uuid(), course_code text not null,
    subject_name text not null, credits integer default 3, shift text,
    day_of_week text, weeks text, room text, campus text, semester text,
    phase text, instructor text default '', is_user_added boolean default false,
    created_at timestamptz not null default now()
  );
  create table public.user_schedules (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    course_id uuid not null references public.course_schedules(id) on delete cascade,
    semester text not null, custom_data jsonb, created_at timestamptz not null default now(),
    unique (user_id, course_id)
  );
  create table public.account_delete_audit (id uuid primary key);
  create table public.profiles (id uuid primary key, email text);

  alter table public.course_schedules enable row level security;
  alter table public.user_schedules enable row level security;
  create policy course_authenticated_all on public.course_schedules
    for all to authenticated using (true) with check (true);
  create policy schedules_own on public.user_schedules for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
  grant select, insert, update, delete, truncate on public.course_schedules to authenticated, service_role;
  grant select, insert, update, delete, truncate on public.user_schedules to authenticated, service_role;
  grant select, insert on public.account_delete_audit to service_role;

  insert into public.course_schedules (id, course_code, subject_name, semester, is_user_added)
  values
    ('10000000-0000-4000-8000-000000000001', 'COURSE_A', 'Course A', 'HK1', false),
    ('10000000-0000-4000-8000-000000000002', 'COURSE_B', 'Course B', 'HK1', false),
    ('10000000-0000-4000-8000-000000000003', 'COURSE_FREE', 'Unreferenced', 'HK1', false);
  insert into public.user_schedules (id, user_id, course_id, semester, custom_data)
  values ('20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', 'HK1', '{"label":"original"}');
  insert into public.profiles(id,email)
  values
    ('30000000-0000-4000-8000-000000000001','student@st.buh.edu.vn'),
    ('30000000-0000-4000-8000-000000000002','student2@st.buh.edu.vn');
`;

test('source barrier has correct legacy/frozen/d1 semantics and no lease liveness surface', async (t) => {
  const pgBin = findPgBin();
  assert.ok(pgBin, 'A faithful local PostgreSQL runtime is required');
  mkdirSync(path.resolve('.cache'), { recursive: true });
  const root = mkdtempSync(path.resolve('.cache', 'hub-schedule-barrier-'));
  const data = path.join(root, 'data');
  const log = path.join(root, 'postgres.log');
  const port = await freePort();
  const binary = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
  const args = ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
  const psql = (sql) => execFileSync(binary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
  const run = (sql) => spawnSync(binary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8', windowsHide: true,
  });
  const expectBarrier = (sql) => {
    const result = run(sql);
    assert.notEqual(result.status, 0, 'mutation unexpectedly succeeded');
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(BARRIER_MESSAGE));
  };
  const asyncPsql = (sql) => new Promise((resolve) => {
    const child = spawn(binary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (status) => resolve({ status, stdout, stderr }));
  });

  execFileSync(binary('initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], {
    stdio: 'ignore', windowsHide: true,
  });
  const logFd = openSync(log, 'a');
  const postgres = spawn(binary('postgres'), ['-D', data, '-F', '-p', String(port), '-h', '127.0.0.1'], {
    stdio: ['ignore', logFd, logFd], windowsHide: true,
  });
  t.after(async () => {
    await new Promise((resolve) => {
      if (postgres.exitCode !== null) return resolve();
      postgres.once('exit', resolve);
      postgres.kill('SIGKILL');
    });
    closeSync(logFd);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (spawnSync(binary('pg_isready'), ['-h', '127.0.0.1', '-p', String(port)], { stdio: 'ignore' }).status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, readFileSync(log, 'utf8'));

  psql(setupSql);
  const before = psql(`select jsonb_build_object(
    'courses', (select count(*) from public.course_schedules),
    'schedules', (select count(*) from public.user_schedules),
    'course_hash', (select md5(string_agg(row_to_json(c)::text, '' order by c.id)) from public.course_schedules c),
    'schedule_hash', (select md5(string_agg(row_to_json(s)::text, '' order by s.id)) from public.user_schedules s))`);
  execFileSync(binary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-f', path.resolve(MIGRATION)], {
    stdio: 'ignore', windowsHide: true,
  });
  execFileSync(binary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-f', path.resolve(BRIDGE_MIGRATION)], {
    stdio: 'ignore', windowsHide: true,
  });
  assert.equal(psql(`select mode from hub_private.schedule_source_control where singleton`), 'legacy');
  const after = psql(`select jsonb_build_object(
    'courses', (select count(*) from public.course_schedules),
    'schedules', (select count(*) from public.user_schedules),
    'course_hash', (select md5(string_agg(row_to_json(c)::text, '' order by c.id)) from public.course_schedules c),
    'schedule_hash', (select md5(string_agg(row_to_json(s)::text, '' order by s.id)) from public.user_schedules s))`);
  assert.equal(after, before);
  assert.equal(psql(`select count(*) from pg_class where relnamespace='hub_private'::regnamespace and relname like '%lease%'`), '0');

  assert.notEqual(run(`insert into hub_private.schedule_source_control(singleton, mode) values(false, 'legacy')`).status, 0);
  assert.notEqual(run(`insert into hub_private.schedule_source_control(singleton, mode) values(true, 'legacy')`).status, 0);
  assert.notEqual(run(`update hub_private.schedule_source_control set mode='invalid' where singleton`).status, 0);
  psql(`delete from hub_private.schedule_source_control where singleton`);
  expectBarrier(`${rolePrefix('service_role')} insert into public.course_schedules(course_code,subject_name,semester) values('MISSING_CONTROL','Missing','HK1')`);
  psql(`insert into hub_private.schedule_source_control(singleton, mode) values(true, 'legacy')`);

  const user = '30000000-0000-4000-8000-000000000001';
  psql(`${rolePrefix('authenticated', user)}
    insert into public.user_schedules (user_id,course_id,semester)
    values ('${user}','10000000-0000-4000-8000-000000000002','HK1');
    update public.user_schedules set custom_data='{"legacy":true}' where course_id='10000000-0000-4000-8000-000000000002';
    delete from public.user_schedules where course_id='10000000-0000-4000-8000-000000000002';
    insert into public.course_schedules (course_code,subject_name,semester,is_user_added)
    values ('LEGACY','Legacy','HK1',true);`);

  const duplicateImport = psql(`${rolePrefix('authenticated', user)}
    select public.replace_user_schedule_import_source('HK1', '[
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"},
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"}
    ]'::jsonb)`);
  assert.match(duplicateImport, /"count": 1/);
  assert.equal(psql(`select count(*) from public.user_schedules where user_id='${user}' and semester='HK1'`), '1');

  const importResult = psql(`${rolePrefix('authenticated', user)}
    select public.replace_user_schedule_import_source('HK1', '[
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"},
      {"course":{"course_code":"CUSTOM","subject_name":"Custom","credits":2}}
    ]'::jsonb)`);
  assert.match(importResult, /"count": 2/);
  assert.equal(psql(`select count(*) from public.user_schedules where user_id='${user}' and semester='HK1'`), '2');
  assert.equal(psql(`select count(*) from public.course_schedules c join public.user_schedules s on s.course_id=c.id where c.course_code='CUSTOM'`), '1');

  assert.notEqual(run(`${rolePrefix('authenticated', user)}
    select public.replace_user_schedule_import_source('HK1', '[
      {"course":{"course_code":"MASS_ASSIGN","subject_name":"Rejected","is_user_added":false}}
    ]'::jsonb)`).status, 0);
  assert.equal(psql(`select count(*) from public.course_schedules where course_code='MASS_ASSIGN'`), '0');

  const atomicBefore = psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`);
  assert.notEqual(run(`${rolePrefix('authenticated', user)}
    select public.replace_user_schedule_import_source('HK1', '[
      {"course":{"course_code":"ROLLBACK","subject_name":"Rollback"}},
      {"systemCourseId":"not-a-uuid"}
    ]'::jsonb)`).status, 0);
  assert.equal(psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`), atomicBefore);
  assert.equal(psql(`select count(*) from public.course_schedules where course_code='ROLLBACK'`), '0');

  assert.equal(psql(`select has_function_privilege('anon','public.replace_user_schedule_import_source_server(uuid,text,jsonb)','execute')`), 'f');
  assert.equal(psql(`select has_function_privilege('authenticated','public.replace_user_schedule_import_source_server(uuid,text,jsonb)','execute')`), 'f');
  assert.equal(psql(`select has_function_privilege('ordinary_client','public.replace_user_schedule_import_source_server(uuid,text,jsonb)','execute')`), 'f');
  assert.equal(psql(`select has_function_privilege('service_role','public.replace_user_schedule_import_source_server(uuid,text,jsonb)','execute')`), 't');
  assert.notEqual(run(`set role ordinary_client;
    select public.replace_user_schedule_import_source_server('${user}','HK1','[]'::jsonb)`).status, 0);
  assert.notEqual(run(`${rolePrefix('anon')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[]'::jsonb)`).status, 0);
  assert.notEqual(run(`${rolePrefix('authenticated', user)}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[]'::jsonb)`).status, 0);
  const serverImport = psql(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"}
    ]'::jsonb)`);
  assert.match(serverImport, /"count": 1/);
  const duplicateServerImport = psql(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"},
      {"systemCourseId":"10000000-0000-4000-8000-000000000001"}
    ]'::jsonb)`);
  assert.match(duplicateServerImport, /"count": 1/);
  const secondUser = '30000000-0000-4000-8000-000000000002';
  const serverOwnerImport = psql(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${secondUser}','HK1','[
      {"systemCourseId":"10000000-0000-4000-8000-000000000002"}
    ]'::jsonb)`);
  assert.match(serverOwnerImport, /"count": 1/);
  assert.equal(psql(`select count(*) from public.user_schedules where user_id='${secondUser}' and course_id='10000000-0000-4000-8000-000000000002'`), '1');
  assert.equal(psql(`select count(*) from public.user_schedules where user_id='${user}' and course_id='10000000-0000-4000-8000-000000000002'`), '0');
  assert.notEqual(run(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[
      {"systemCourseId":"10000000-0000-4000-8000-000000000001","user_id":"${secondUser}"}
    ]'::jsonb)`).status, 0);
  const serverAtomicBefore = psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`);
  assert.notEqual(run(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[
      {"course":{"course_code":"SERVER_ROLLBACK","subject_name":"Rollback"}},
      {"systemCourseId":"not-a-uuid"}
    ]'::jsonb)`).status, 0);
  assert.equal(psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`), serverAtomicBefore);
  assert.equal(psql(`select count(*) from public.course_schedules where course_code='SERVER_ROLLBACK'`), '0');

  psql(`begin;
    lock table public.user_schedules, public.course_schedules in access exclusive mode;
    update hub_private.schedule_source_control set mode='frozen', updated_at=now() where singleton and mode='legacy';
    commit;`);
  for (const sql of [
    `${rolePrefix('authenticated', user)} insert into public.user_schedules(user_id,course_id,semester) values('${user}','10000000-0000-4000-8000-000000000002','HK1')`,
    `${rolePrefix('service_role')} update public.user_schedules set semester='HK2' where user_id='${user}'`,
    `${rolePrefix('service_role')} delete from public.user_schedules where user_id='${user}'`,
    `${rolePrefix('service_role')} truncate public.user_schedules`,
    `${rolePrefix('authenticated', user)} insert into public.course_schedules(course_code,subject_name,semester) values('F','F','HK1')`,
    `${rolePrefix('service_role')} update public.course_schedules set subject_name='F' where id='10000000-0000-4000-8000-000000000001'`,
    `${rolePrefix('service_role')} delete from public.course_schedules where id='10000000-0000-4000-8000-000000000001'`,
    `${rolePrefix('service_role')} truncate public.course_schedules cascade`,
  ]) expectBarrier(sql);
  assert.equal(psql(`${rolePrefix('authenticated', user)} select count(*) from public.user_schedules`), '1');
  assert.equal(psql(`${rolePrefix('authenticated', user)} select count(*) from public.course_schedules`), '5');
  const frozenAtomicBefore = psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`);
  expectBarrier(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[
      {"course":{"course_code":"FROZEN_ORPHAN","subject_name":"Must Roll Back"}}
    ]'::jsonb)`);
  assert.equal(psql(`select (select count(*) from public.course_schedules)||':'||(select count(*) from public.user_schedules)`), frozenAtomicBefore);
  assert.equal(psql(`select count(*) from public.course_schedules where course_code='FROZEN_ORPHAN'`), '0');

  for (const role of ['anon', 'authenticated', 'service_role']) {
    const roleUser = role === 'authenticated' ? user : '';
    assert.notEqual(run(`${rolePrefix(role, roleUser)} update hub_private.schedule_source_control set mode='legacy'`).status, 0);
  }
  assert.equal(psql(`select has_function_privilege('anon','public.get_schedule_source_control()','execute')`), 'f');
  assert.equal(psql(`select has_function_privilege('authenticated','public.get_schedule_source_control()','execute')`), 't');
  assert.equal(psql(`select has_function_privilege('service_role','public.get_schedule_source_control()','execute')`), 't');
  assert.equal(psql(`select has_function_privilege('authenticated','public.replace_user_schedule_import_source(text,jsonb)','execute')`), 't');
  assert.equal(psql(`select has_function_privilege('service_role','public.replace_user_schedule_import_source(text,jsonb)','execute')`), 'f');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(psql(`select has_function_privilege('${role}','hub_private.enforce_schedule_source_barrier()','execute')`), 'f');
  }

  psql(`update hub_private.schedule_source_control set mode='d1', updated_at=now() where singleton and mode='frozen'`);
  for (const sql of [
    `${rolePrefix('service_role')} insert into public.user_schedules(user_id,course_id,semester) values('${user}','10000000-0000-4000-8000-000000000002','HK1')`,
    `${rolePrefix('service_role')} update public.user_schedules set semester='HK2' where user_id='${user}'`,
    `${rolePrefix('service_role')} delete from public.user_schedules where user_id='${user}'`,
    `${rolePrefix('service_role')} truncate public.user_schedules`,
  ]) expectBarrier(sql);
  expectBarrier(`${rolePrefix('service_role')}
    select public.replace_user_schedule_import_source_server('${user}','HK1','[]'::jsonb)`);
  psql(`${rolePrefix('service_role')}
    insert into public.course_schedules(id,course_code,subject_name,semester,is_user_added)
    values('10000000-0000-4000-8000-000000000099','D1_NEW','New','HK1',false);
    update public.course_schedules set subject_name='Course A updated' where id='10000000-0000-4000-8000-000000000001';`);
  assert.equal(psql(`select subject_name from public.course_schedules where id='10000000-0000-4000-8000-000000000001'`), 'Course A updated');
  expectBarrier(`${rolePrefix('service_role')} delete from public.course_schedules where id='10000000-0000-4000-8000-000000000099'`);
  expectBarrier(`${rolePrefix('service_role')} delete from public.course_schedules where id='10000000-0000-4000-8000-000000000001'`);
  expectBarrier(`${rolePrefix('service_role')} update public.course_schedules set semester='HK2' where id='10000000-0000-4000-8000-000000000001'`);
  expectBarrier(`${rolePrefix('service_role')} update public.course_schedules set is_user_added=true where id='10000000-0000-4000-8000-000000000003'`);
  expectBarrier(`${rolePrefix('service_role')} update public.course_schedules set id='10000000-0000-4000-8000-000000000098' where id='10000000-0000-4000-8000-000000000003'`);
  assert.equal(psql(`select count(*) from public.user_schedules where user_id='${user}'`), '1');

  psql(`update hub_private.schedule_source_control set mode='legacy', updated_at=now() where singleton and mode='d1'`);
  const freeze = asyncPsql(`begin;
    lock table public.user_schedules, public.course_schedules in access exclusive mode;
    update hub_private.schedule_source_control set mode='frozen', updated_at=now() where singleton and mode='legacy';
    select pg_sleep(1);
    commit;`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const competing = asyncPsql(`${rolePrefix('service_role')}
    insert into public.user_schedules(user_id,course_id,semester)
    values('${user}','10000000-0000-4000-8000-000000000002','HK1')`);
  const [freezeResult, competingResult] = await Promise.all([freeze, competing]);
  assert.equal(freezeResult.status, 0);
  assert.notEqual(competingResult.status, 0);
  assert.match(competingResult.stderr, new RegExp(BARRIER_MESSAGE));

  const definerSecurity = psql(`select count(*) from pg_proc
    where proname in ('enforce_schedule_source_barrier','get_schedule_source_control')
      and prosecdef=true and proconfig=array['search_path=pg_catalog']
      and proowner='postgres'::regrole`);
  assert.equal(definerSecurity, '2');
  assert.equal(psql(`select prosecdef from pg_proc where proname='replace_user_schedule_import_source'`), 'f');
});

test('migration is additive, has no lease system, and hub_private is not configured as a Data API schema', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.doesNotMatch(sql, /schedule_source_write_leases|acquire_schedule_source_write_lease|release_schedule_source_write_lease/i);
  assert.doesNotMatch(sql, /\b(?:drop\s+table|update\s+public\.(?:user_schedules|course_schedules)|delete\s+from\s+public\.course_schedules|truncate\s+public\.)/i);
  assert.match(sql, /values \(true, 'legacy'\)/i);
  assert.match(sql, /current_mode = 'frozen'/i);
  assert.match(sql, /current_mode = 'd1'/i);
  assert.match(sql, /revoke all on function public\.replace_user_schedule_import_source\(text, jsonb\) from public, anon, authenticated, service_role/i);
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.doesNotMatch(config, /schemas\s*=\s*\[[^\]]*hub_private/i);
});
