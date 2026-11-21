/** Operator-only approval boundary; never imported by the application. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateCI } from '../release-assistant-core.mjs';

const REPO = 'tqhoangg08/HUB-PLANNER', OWNER = 252552483;
export const ACCOUNT = '6cd8bac6009a55f96bdf9df7c2057548';
export const DB_ID = '88d702e1-60d3-490a-8514-38ef881cf133';
export const RELEASE = Object.freeze({ run_id: 44764100186, sha: '8416837eb5ce648ce9c1c6237b4eed81802dbd03', version: '04e1f162-6ca5-4ef1-8161-aa74deefef68' });
const grants = new WeakMap(), hex = /^[a-f0-9]{64}$/;
const backupChecks = ['integrity_ok','schema_equal','all_tables_equal','foreign_keys_equal','foreign_keys_clean',
  'sequences_equal','hk1_equal','hk1_expected','hk2_zero'];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateBackupEvidence(backup, plan) {
  const restored = backup?.restore, file = backup?.backup;
  assert(backup?.status === 'PASS' && backup.production_database_id === DB_ID && hex.test(file?.sha256)
    && file.complete === true && Number.isSafeInteger(file.bytes) && file.bytes > 0
    && backup.export_status === 'complete' && backup.bookmarks?.export_at === file.exportBookmark
    && restored?.status === 'PASS' && restored.production_restored === false && restored.migration_executed === false
    && restored.local_database?.remote === false && restored.local_database.fresh_state === true
    && restored.local_database.uuid !== DB_ID && restored.backup_file.sha256 === file.sha256
    && restored.application_tables > 0 && restored.tables?.length === restored.application_tables
    && backupChecks.every(key => restored.checks?.[key] === true)
    && new Set(restored.tables.map(t => t.table)).size === restored.tables.length
    && ['course_schedules','user_schedules','user_schedule_course_snapshots','user_course_requests'].every(name => restored.tables.some(t => t.table === name))
    && restored.tables.every(t => t.match === true && hex.test(t.reference?.sha256)
      && t.reference.sha256 === t.restored?.sha256 && t.reference.rows === t.restored.rows)
    && backup.schema_completeness?.status === 'PASS'
    && backup.schema_completeness.live_schema_sha256 === backup.schema_completeness.export_schema_sha256,
  'Verified isolated backup/restore evidence required');
  const exported = Date.parse(file.completedAt), verified = Date.parse(restored.verified_at);
  assert(Number.isFinite(exported) && Number.isFinite(verified) && exported <= verified && verified <= Date.now() + 30_000
    && exported <= Date.parse(plan.snapshot.checked_at), 'Backup postdates snapshot or restore timestamps are invalid');
  return digest(backup);
}

export function importApprovalText(plan, backup, operatorSha, expiresAt) {
  const hash = validateBackupEvidence(backup, plan);
  return `HUB-HK2-IMPORT-APPROVAL v1\naction=apply\ndatabase=${DB_ID}\nsemester=HK2_2026_2027\nplan_id=${plan.plan_id}\nsnapshot_sha256=${plan.snapshot_sha256}\nmanifest_sha256=${plan.manifest_sha256}\npayload_sha256=${plan.payload_sha256}\nadditions=2357\nbatches=95\nbackup_restore_sha256=${hash}\nexport_sha256=${backup.backup.sha256}\noperator_sha=${operatorSha}\nworker_version=${RELEASE.version}\nbackup_restore_verified=true\nexpires_at=${expiresAt}`;
}

/** Only provider-authenticated owner comments create an in-memory capability.
 * Neither a JSON role/approval nor possession of a D1 credential suffices.
 */
export async function authorizeProductionImport(plan, backup, {
  operatorSha, approvalCommentId, expiresAt, githubToken, cloudflareToken, fetchImpl = fetch,
}) {
  assert(plan.snapshot.database_id === DB_ID && plan.rows.length === 2357 && plan.batches === 95
    && plan.batch_size === 25 && plan.snapshot.response.result[2].results.length === 0
    && plan.dry_run.counts.additions === 2357 && plan.dry_run.counts.identical === 0, 'Complete original production plan required');
  const backupHash = validateBackupEvidence(backup, plan);
  assert(/^[a-f0-9]{40}$/.test(operatorSha) && Number.isSafeInteger(approvalCommentId) && approvalCommentId > 0,
    'Exact operator SHA and owner comment required');
  assert(Date.parse(expiresAt) > Date.now() && Date.parse(expiresAt) <= Date.now() + 60 * 60_000, 'Approval expired/unbounded');
  assert([githubToken, cloudflareToken].every(t => typeof t === 'string' && t.length > 0 && !/[\r\n]/.test(t)), 'Authenticated provider credentials required');
  const get = async (url, token) => {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'HUB-HK2-operator' } });
    assert(response.ok, 'Authenticated provider evidence unavailable'); return response.json();
  };
  const base = `https://api.github.com/repos/${REPO}`;
  const gh = path => get(path === '/user' ? 'https://api.github.com/user' : `${base}${path}`, githubToken);
  const cf = async path => {
    const body = await get(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/hub-planner-public-dev-api${path}`, cloudflareToken);
    assert(body.success === true && body.result, 'Cloudflare evidence unavailable'); return body.result;
  };
  const [identity, repo, branch, comment, checks, runs, release, jobs, content, deployment, version] = await Promise.all([
    gh('/user'), gh(''), gh('/branches/main'), gh(`/issues/comments/${approvalCommentId}`),
    gh(`/commits/${operatorSha}/check-runs?per_page=100`), gh(`/actions/runs?head_sha=${operatorSha}&per_page=100`),
    gh(`/actions/runs/${RELEASE.run_id}`), gh(`/actions/runs/${RELEASE.run_id}/jobs?per_page=100`),
    gh(`/contents/cloudflare/worker/src/course-publication.ts?ref=${RELEASE.sha}`), cf('/deployments'), cf(`/versions/${RELEASE.version}`),
  ]);
  assert(identity.id === OWNER && identity.type === 'User' && repo.id === 1126820605 && repo.full_name === REPO
    && repo.owner?.id === OWNER && repo.owner.type === 'User' && repo.default_branch === 'main', 'Authenticated repository owner required');
  assert(branch.name === 'main' && branch.commit?.sha === operatorSha, 'Operator must run exact reviewed current main');
  assert(checks.total_count === checks.check_runs?.length && runs.total_count === runs.workflow_runs?.length
    && checks.total_count < 100 && runs.total_count < 100, 'Incomplete CI evidence');
  const ciRun = validateCI({ branch, checkRuns: checks.check_runs, ciRuns: runs.workflow_runs });
  assert(comment.id === approvalCommentId && comment.user?.id === OWNER && comment.user.type === 'User'
    && new RegExp(`^https://api\\.github\\.com/repos/${REPO}/issues/[1-9][0-9]*$`).test(comment.issue_url)
    && Number.isFinite(Date.parse(comment.created_at)) && Date.parse(comment.created_at) <= Date.now() + 30_000 && comment.created_at === comment.updated_at
    && Date.parse(comment.created_at) >= Date.parse(plan.snapshot.checked_at)
    && Date.parse(comment.created_at) >= Date.parse(backup.restore.verified_at)
    && comment.body === importApprovalText(plan, backup, operatorSha, expiresAt), 'Authentic unedited owner approval must bind plan, backup and action');
  assert(release.id === RELEASE.run_id && release.repository?.id === 1126820605 && release.head_sha === RELEASE.sha
    && release.head_branch === 'main' && release.event === 'workflow_dispatch' && release.run_attempt === 1
    && release.path === '.github/workflows/deploy-cloudflare-production.yml' && release.actor?.id === OWNER
    && release.triggering_actor?.id === OWNER && release.status === 'completed' && release.conclusion === 'success', 'Guarded deployed release required');
  assert(jobs.total_count === jobs.jobs?.length && jobs.total_count < 100, 'Incomplete release jobs');
  const job = jobs.jobs.find(j => j.name === 'release-public');
  assert(job?.conclusion === 'success' && ['Verify solo owner approval, live protections and exact-SHA CI',
    'Deploy Public Worker and frontend assets', 'Verify serving Public version preserves V2 100 percent and document flags remain OFF']
    .every(name => job.steps?.some(s => s.name === name && s.conclusion === 'success')), 'Guarded release job required');
  const bytes = Buffer.from((await readFile(new URL('../../cloudflare/worker/src/course-publication.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  assert(content.type === 'file' && content.sha === createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), 'Deployed publication gate differs');
  const serving = deployment.deployments?.[0];
  assert(serving?.versions?.length === 1 && serving.versions[0].version_id === RELEASE.version && serving.versions[0].percentage === 100
    && version.id === RELEASE.version && Date.parse(version.metadata?.created_on) >= Date.parse(job.started_at)
    && Date.parse(version.metadata?.created_on) <= Date.parse(job.completed_at), 'Reviewed gate Worker must serve 100 percent');
  for (const name of ['COURSE_READ_AUTHORITY', 'COURSE_WRITE_AUTHORITY']) assert(version.resources?.bindings?.some(b => b.name === name && b.text === 'd1'), 'Existing D1 authority required');
  assert(version.resources.bindings.some(b => b.name === 'DB' && b.type === 'd1' && b.id === DB_ID), 'Wrong live D1 binding');
  const authorization = Object.freeze({ plan_id: plan.plan_id, action: 'apply', course_write_authority: 'd1',
    expires_at: new Date(Math.min(Date.parse(expiresAt), Date.now() + 60_000)).toISOString() });
  grants.set(authorization, { plan, expires: Date.parse(authorization.expires_at), ciRun, backupHash, comment, gh, cf, operatorSha });
  return authorization;
}

export function assertProductionAuthorization(plan, authorization, action) {
  const grant = grants.get(authorization);
  assert(action === 'apply' && grant?.plan === plan && grant.expires > Date.now(),
    'Production execution is disabled without authenticated one-batch owner authorization');
}

export async function consumeProductionAuthorization(plan, authorization) {
  assertProductionAuthorization(plan, authorization, 'apply');
  const grant = grants.get(authorization); grants.delete(authorization); // never retry a mutation with an old grant
  const [comment, branch, deployment] = await Promise.all([
    grant.gh(`/issues/comments/${grant.comment.id}`), grant.gh('/branches/main'), grant.cf('/deployments'),
  ]);
  assert(digest(comment) === digest(grant.comment) && branch.commit?.sha === grant.operatorSha && grant.expires > Date.now(), 'Approval revoked, expired or main changed');
  const versions = deployment.deployments?.[0]?.versions;
  assert(versions?.length === 1 && versions[0].version_id === RELEASE.version && versions[0].percentage === 100, 'Live deployment changed');
  return { ci_run: grant.ciRun, owner_comment_id: grant.comment.id, backup_restore_sha256: grant.backupHash };
}
