/** Separate publication operation. No route, production transport, deploy hook or auto-open. */
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { loadBulkPackage, createBulkPlan, captureSnapshot, validateBulkSnapshot, MANIFEST_SHA256, PAYLOAD_SHA256 } from './bulk-import.mjs';
import { FIELDS, SEMESTER, sha256, planImport } from './catalogue.mjs';
import { verifyPublicationOperator } from './publication-operator.mjs';

const REPO = 'tqhoangg08/HUB-PLANNER', REPO_ID = 1126820605, OWNER_ID = 252552483;
const WORKER_API = 'https://api.cloudflare.com/client/v4/accounts/6cd8bac6009a55f96bdf9df7c2057548/workers/scripts/hub-planner-public-dev-api';
const SHA = /^[a-f0-9]{64}$/, COMMIT = /^[a-f0-9]{40}$/;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const verifiedStates = new WeakMap(), authorized = new WeakMap();
const receiptColumns = ['actor_scope','actor_id','idempotency_key','request_hash','operation','response_json','created_at'];
const sortRows = rows => [...rows].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const matrix = (rows, columns) => sortRows(rows).map(r => columns.map(c => r[c] ?? null));

function validateBackup(backup, plan) {
  assert(backup?.database_id === plan.snapshot.database_id && SHA.test(backup.export_sha256)
    && SHA.test(backup.protected_source_sha256) && backup.protected_source_sha256 === backup.protected_restored_sha256
    && typeof backup.export_reference === 'string' && backup.export_reference.length > 0
    && Number.isSafeInteger(backup.export_bytes) && backup.export_bytes > 0
    && backup.restore_environment === 'isolated' && backup.production_restored === false
    && Number.isFinite(Date.parse(backup.exported_at)) && Date.parse(backup.exported_at) <= Date.parse(plan.snapshot.checked_at)
    && Date.parse(backup.restore_verified_at) >= Date.parse(backup.exported_at)
    && Date.parse(backup.restore_verified_at) <= Date.now() + 30_000, 'Backup/isolated restore evidence incomplete');
}

export async function verifyHk2Publication(db, { plan, backup, release }) {
  const pkg = await loadBulkPackage();
  // Reuse #160 validation of the approved initial snapshot and any terminal history.
  same(await createBulkPlan(pkg, plan.snapshot, { historical: true }), plan, 'Import plan differs from frozen package');
  assert(plan.rows.length === 2357 && plan.batches === 95 && plan.batch_size === 25
    && plan.snapshot.response.result[2].results.length === 0, 'Exactly one complete 95-batch import required');
  validateBackup(backup, plan);
  assert(COMMIT.test(release?.sha) && Number.isSafeInteger(release.run_id) && release.run_id > 0
    && typeof release.worker_version === 'string' && release.worker_version.length > 0
    && SHA.test(release.asset_manifest_sha256), 'Compatible release evidence missing');
  if (release.operator_sha !== undefined) assert(COMMIT.test(release.operator_sha), 'Exact operator SHA required');
  const snapshot = await captureSnapshot(db, plan.snapshot.database_id);
  await validateBulkSnapshot(snapshot);
  const rows = snapshot.response.result[2].results, columns = snapshot.response.result[1].results.map(r => r.name);
  const check = planImport(pkg.catalogue.records, rows, pkg.catalogue.temporary_items);
  same(check.counts, { additions: 0, identical: 2357, blocked: 0, conflicts: 0, temporary_items: 3 }, 'Incomplete/duplicate/conflicting HK2 catalogue');
  same(matrix(rows, columns), matrix(plan.rows, columns), 'Catalogue metadata/provenance changed');
  assert(rows.every(r => r.instructor === null && r.is_user_added === 0 && r.course_code !== '_262_'), 'Invalid official scope');
  const ledger = snapshot.response.result[6].results;
  const own = ledger.filter(r => r.actor_scope === 'system' && r.actor_id === 'hk2-bulk-v1' && r.idempotency_key.startsWith(`${plan.plan_id}:`));
  const foreign = ledger.filter(r => !own.includes(r));
  same(foreign.map(r => receiptColumns.map(c => r[c])), plan.snapshot.response.result[6].results.map(r => receiptColumns.map(c => r[c])), 'Foreign ledger changed');
  assert(own.length === 95, 'Exactly 95 apply receipts required');
  let previous = null, chained = false;
  for (let i = 0; i < 95; i++) {
    const receipt = own.find(r => r.idempotency_key === `${plan.plan_id}:apply:${i}`);
    assert(receipt && receipt.operation === 'hk2_bulk_apply' && Number.isFinite(Date.parse(receipt.created_at)), 'Missing/invalid apply receipt');
    const body = JSON.parse(receipt.response_json), batch = plan.rows.slice(i * 25, (i + 1) * 25);
    const { semester, sequence, previous_receipt_hash, ...core } = body;
    same({ ...core, version: 1 }, { version: 1, plan_id: plan.plan_id, action: 'apply', batch_index: i,
      payload_sha256: PAYLOAD_SHA256, snapshot_sha256: plan.snapshot_sha256, batch_sha256: sha256(JSON.stringify(batch)), ids: batch.map(r => r.id) }, 'Apply receipt conflict');
    if (body.version === 2) {
      chained = true; assert(semester === SEMESTER && sequence === i && previous_receipt_hash === previous, 'Receipt chain invalid');
    } else assert(body.version === 1 && !chained && semester === undefined && sequence === undefined && previous_receipt_hash === undefined, 'Receipt downgrade/format invalid');
    same(receipt.request_hash, sha256(JSON.stringify(body)), 'Receipt hash invalid'); previous = receipt.request_hash;
  }
  // The eight markers/NULL clocks, all source fields and three temporary items are
  // already pinned/validated by loadBulkPackage + exact record/plan comparison.
  const verification = Object.freeze({ version: 1, action: 'OPEN_HK2_2026_2027', database_id: snapshot.database_id,
    checked_at: snapshot.checked_at, plan_id: plan.plan_id, manifest_sha256: MANIFEST_SHA256, payload_sha256: PAYLOAD_SHA256,
    official_count: 2357, batch_count: 95, courses_sha256: sha256(JSON.stringify(matrix(rows, columns))),
    ledger_sha256: sha256(JSON.stringify(ledger)), backup_restore_sha256: sha256(JSON.stringify(backup)),
    release_sha256: sha256(JSON.stringify(release)), release_sha: release.sha,
    ...(release.operator_sha ? { operator_sha: release.operator_sha } : {}) });
  const digest = sha256(JSON.stringify(verification));
  verifiedStates.set(verification, { snapshot, digest, backup: structuredClone(backup), release: structuredClone(release) });
  return verification;
}

export function publicationApprovalText(verification, expiresAt) {
  const state = verifiedStates.get(verification); assert(state, 'Fresh in-process verification required');
  return `HUB-HK2-PUBLICATION-APPROVAL ${verification.operator_sha ? 'v2' : 'v1'}\naction=OPEN_HK2_2026_2027\ndatabase=${verification.database_id}\nverification_sha256=${state.digest}\nbackup_restore_sha256=${verification.backup_restore_sha256}\nrelease_sha=${verification.release_sha}${verification.operator_sha ? `\noperator_sha=${verification.operator_sha}` : ''}\nexpires_at=${expiresAt}`;
}

export function backupRestoreAttestationText(verification) {
  const state = verifiedStates.get(verification); assert(state, 'Fresh in-process verification required');
  return `HUB-HK2-BACKUP-RESTORE-VERIFIED v1\ndatabase=${verification.database_id}\nbackup_restore_sha256=${verification.backup_restore_sha256}\nexport_sha256=${state.backup.export_sha256}\nprotected_restored_sha256=${state.backup.protected_restored_sha256}`;
}

// Only GETs to a fixed GitHub repository. Owner identity is obtained from GitHub,
// never accepted from a caller's JSON, role claim or backup document.
async function github(path, token) {
  assert(path === '/user' || path.startsWith(`/repos/${REPO}`), 'Wrong authorization repository');
  const response = await fetch(`https://api.github.com${path}`, { method: 'GET', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HUB-Planner-HK2-publication',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  assert(response.ok, 'GitHub authorization evidence unavailable'); return response.json();
}

export async function authorizeHk2Publication(verification, { approval_comment_id, backup_comment_id, expires_at, github_read_token, cloudflare_read_token }) {
  const state = verifiedStates.get(verification); assert(state, 'Fresh in-process verification required');
  assert(Date.now() - Date.parse(verification.checked_at) <= 15 * 60_000, 'Publication verification expired');
  assert(typeof github_read_token === 'string' && github_read_token.length > 0, 'Authenticated owner read credential required');
  assert(typeof cloudflare_read_token === 'string' && cloudflare_read_token.length > 0, 'Live Worker read credential required');
  assert(Number.isSafeInteger(approval_comment_id) && approval_comment_id > 0 && Number.isSafeInteger(backup_comment_id)
    && backup_comment_id > 0 && backup_comment_id !== approval_comment_id, 'Separate owner comments required');
  assert(Date.parse(expires_at) > Date.now() && Date.parse(expires_at) <= Date.parse(verification.checked_at) + 15 * 60_000, 'Approval expired/unbounded');
  const base = `/repos/${REPO}`;
  const [identity, repo, branch, approval, backup, run, jobs, content] = await Promise.all([
    github('/user', github_read_token),
    github(base, github_read_token), github(`${base}/branches/main`, github_read_token),
    github(`${base}/issues/comments/${approval_comment_id}`, github_read_token), github(`${base}/issues/comments/${backup_comment_id}`, github_read_token),
    github(`${base}/actions/runs/${state.release.run_id}`, github_read_token), github(`${base}/actions/runs/${state.release.run_id}/jobs?per_page=100`, github_read_token),
    github(`${base}/contents/cloudflare/worker/src/course-publication.ts?ref=${verification.release_sha}`, github_read_token),
  ]);
  assert(identity.id === OWNER_ID && identity.type === 'User', 'Authenticated owner identity required');
  assert(repo.id === REPO_ID && repo.full_name === REPO && repo.owner?.id === OWNER_ID && repo.owner.type === 'User', 'Repository owner mismatch');
  const operator = verification.operator_sha ? await verifyPublicationOperator(state.release, { github_read_token, cloudflare_read_token }) : null;
  assert(branch.name === 'main' && branch.commit?.sha === (operator?.operator_sha || verification.release_sha), 'Exact current main release/operator required');
  for (const [comment, id] of [[approval, approval_comment_id], [backup, backup_comment_id]]) {
    assert(comment.id === id && comment.user?.id === OWNER_ID && comment.user.type === 'User'
      && comment.issue_url?.startsWith(`https://api.github.com/repos/${REPO}/issues/`)
      && Number.isFinite(Date.parse(comment.created_at)) && comment.updated_at === comment.created_at, 'Authentic unedited owner comment required');
  }
  assert(Date.parse(approval.created_at) >= Date.parse(verification.checked_at)
    && Date.parse(backup.created_at) >= Date.parse(state.backup.restore_verified_at), 'Owner evidence predates verification');
  same(approval.body, publicationApprovalText(verification, expires_at), 'Owner publication approval does not bind this verification');
  same(backup.body, backupRestoreAttestationText(verification), 'Owner has not independently attested this backup/restore proof');
  assert(run.id === state.release.run_id && run.repository?.id === REPO_ID && run.head_sha === verification.release_sha && run.head_branch === 'main'
    && run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy-cloudflare-production.yml'
    && run.actor?.id === OWNER_ID && run.triggering_actor?.id === OWNER_ID && run.run_attempt === 1
    && run.status === 'completed' && run.conclusion === 'success', 'Successful guarded owner release required');
  assert(jobs.total_count <= 100 && jobs.jobs?.length === jobs.total_count, 'Incomplete release job evidence');
  const releaseJob = jobs.jobs.find(j => j.name === 'release-public');
  assert(releaseJob?.conclusion === 'success' && ['Verify solo owner approval, live protections and exact-SHA CI', 'Deploy Public Worker and frontend assets']
    .every(name => releaseJob.steps?.some(s => s.name === name && s.conclusion === 'success')), 'Guarded frontend/Worker deployment not proven');
  const bytes = Buffer.from((await readFile(new URL('../../cloudflare/worker/src/course-publication.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert(content.type === 'file' && content.sha === blob, 'Released gate code differs from verified operator code');
  // A successful historical release alone cannot prove that v476/another version
  // has not since been restored. Read the actual serving deployment; never mutate it.
  const live = async path => {
    const response = await fetch(`${WORKER_API}${path}`, { method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${cloudflare_read_token}` } });
    assert(response.ok, 'Live Worker evidence unavailable'); const body = await response.json();
    assert(body.success === true && body.result, 'Live Worker evidence invalid'); return body.result;
  };
  assert(/^[a-f0-9-]{36}$/.test(state.release.worker_version), 'Worker version UUID required');
  const deployment = (await live('/deployments')).deployments?.[0];
  assert(deployment?.versions?.length === 1 && deployment.versions[0].percentage === 100
    && deployment.versions[0].version_id === state.release.worker_version, 'Compatible Worker must serve all traffic');
  const version = await live(`/versions/${state.release.worker_version}`);
  assert(version.id === state.release.worker_version && Date.parse(version.metadata?.created_on) >= Date.parse(releaseJob.started_at)
    && Date.parse(version.metadata?.created_on) <= Date.parse(releaseJob.completed_at), 'Serving Worker not from guarded release');
  // Re-read live main and approval immediately before granting a short-lived capability.
  same((await github(`${base}/branches/main`, github_read_token)).commit?.sha, operator?.operator_sha || verification.release_sha, 'Main changed during approval');
  same(await github(`${base}/issues/comments/${approval_comment_id}`, github_read_token), approval, 'Approval changed during authorization');
  same(await github(`${base}/issues/comments/${backup_comment_id}`, github_read_token), backup, 'Backup attestation changed during authorization');
  const capability = Object.freeze({ action: verification.action });
  authorized.set(capability, { verification, approval_comment_id, owner_id: OWNER_ID, expires_at: Math.min(Date.parse(expires_at), Date.now() + 60_000) });
  return capability;
}

const sqlArray = columns => {
  const chunks = []; for (let i = 0; i < columns.length; i += 20) chunks.push(`json_array(${columns.slice(i,i+20).join(',')})`);
  return `json_array(${chunks.join(',')})`;
};
const nested = (rows, columns) => matrix(rows, columns).map(values => {
  const chunks = []; for (let i=0;i<values.length;i+=20) chunks.push(values.slice(i,i+20)); return chunks;
});

export async function openHk2Publication(db, verification, capability) {
  const auth = authorized.get(capability), state = verifiedStates.get(verification);
  assert(auth?.verification === verification && state && auth.expires_at > Date.now(), 'Authenticated owner publication capability required');
  authorized.delete(capability); // one operation; a failed/uncertain call requires fresh provider verification
  const id = `hk2-publication:${auth.approval_comment_id}`, at = new Date().toISOString();
  const current = await db.prepare('SELECT state,receipt_id,verification_sha256 FROM hk2_catalogue_publications WHERE semester=?').bind(SEMESTER).first();
  if (current?.state === 'OPEN' && current.receipt_id === id && current.verification_sha256 === state.digest) return { changed: false, receipt_id: id };
  assert(current?.state === 'CLOSED', 'Publication migration/state unavailable');
  const columns = state.snapshot.response.result[1].results.map(r => r.name);
  const rows = state.snapshot.response.result[2].results, ledger = state.snapshot.response.result[6].results;
  const guard = `(SELECT json_group_array(${sqlArray(columns)}) FROM (SELECT * FROM course_schedules WHERE semester='${SEMESTER}' ORDER BY id)) IS ?
    AND (SELECT json_group_array(json_array(${receiptColumns.join(',')})) FROM (SELECT * FROM course_mutation_receipts WHERE actor_id='hk2-bulk-v1' ORDER BY actor_scope,idempotency_key)) IS ?
    AND EXISTS (SELECT 1 FROM hk2_catalogue_publications WHERE semester='${SEMESTER}' AND state='CLOSED' AND revision=0 AND receipt_id IS NULL)`;
  const rowJson = JSON.stringify(nested(rows, columns)), ledgerJson = JSON.stringify(ledger.map(r => receiptColumns.map(c => r[c])));
  assert(Buffer.byteLength(rowJson) < 1_900_000 && Buffer.byteLength(ledgerJson) < 1_900_000, 'Publication guard exceeds D1 limit');
  await db.batch([
    db.prepare(`INSERT INTO hk2_catalogue_publication_receipts(id,action,verification_sha256,backup_restore_sha256,owner_id,owner_comment_id,release_sha,import_ledger_json,created_at)
      SELECT ?,CASE WHEN ${guard} THEN 'OPEN_HK2_2026_2027' ELSE NULL END,?,?,?,?,?,?,?`)
      .bind(id, rowJson, ledgerJson, state.digest, verification.backup_restore_sha256, auth.owner_id, auth.approval_comment_id, verification.release_sha, ledgerJson, at),
    db.prepare(`UPDATE hk2_catalogue_publications SET state='OPEN',revision=1,manifest_sha256=?,payload_sha256=?,official_count=2357,batch_count=95,
      verification_sha256=?,receipt_id=?,opened_at=? WHERE semester=? AND state='CLOSED' AND revision=0`)
      .bind(MANIFEST_SHA256, PAYLOAD_SHA256, state.digest, id, at, SEMESTER),
  ]);
  const opened = await db.prepare('SELECT state,receipt_id FROM hk2_catalogue_publications WHERE semester=?').bind(SEMESTER).first();
  assert(opened?.state === 'OPEN' && opened.receipt_id === id, 'Publication outcome uncertain; reconcile receipt');
  return { changed: true, receipt_id: id };
}
