import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker/src/index.ts';
import {runNotificationQueueControl} from '../cloudflare/worker/src/notification-cron.ts';

const env = {SUPABASE_URL:'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40), NOTIFICATION_REENABLE_CUTOFF:'2026-08-31T11:23:39Z', NOTIFICATION_JOBS_ENABLED:'true', NOTIFICATION_JOBS_MODE:'enabled'};
test('configured triggers match the five observed production triggers', () => {
 const config = JSON.parse(readFileSync('cloudflare/wrangler.jsonc','utf8'));
 assert.deepEqual(config.triggers.crons.sort(), ['*/15 * * * *','7-59/15 * * * *','*/10 * * * *','*/5 * * * *','37 19 * * *'].sort());
 for (const key of ['NOTIFICATION_JOBS_MODE','NOTIFICATION_JOBS_ENABLED','NOTIFICATION_REENABLE_CUTOFF']) assert.equal(config.vars[key],env[key]);
});
test('queue adapter preserves server-authenticated action and cutoff without recipient overrides', async () => {
 const original = globalThis.fetch;
 try {
  globalThis.fetch = async (input,init) => {
   assert.equal(String(input),'https://fixture.invalid/functions/v1/push');
   assert.equal(init?.method,'POST');
   assert.deepEqual(JSON.parse(String(init?.body)),{resource:'announcement-queue',action:'dry_run',notificationCutoff:'2026-08-31T11:23:39.000Z'});
   return Response.json({success:true});
  };
  await runNotificationQueueControl(env,'dry_run');
 } finally { globalThis.fetch=original; }
});
test('scheduled push dispatches once, disabled gate dispatches nothing (mock transport only)',async () => {
 const original=globalThis.fetch; let calls=0;
 try {
  globalThis.fetch=async (_input,init)=>{calls++;assert.equal(JSON.parse(String(init?.body)).action,'process');return Response.json({success:true});};
  for(const enabled of ['true','false']) {
   const pending:Promise<unknown>[]=[];
   await worker.scheduled({cron:'7-59/15 * * * *',scheduledTime:0} as never,{...env,NOTIFICATION_JOBS_ENABLED:enabled} as never,{waitUntil:(p:Promise<unknown>)=>pending.push(p)} as never);
   await Promise.all(pending);
  }
  assert.equal(calls,1);
 } finally {globalThis.fetch=original;}
});
