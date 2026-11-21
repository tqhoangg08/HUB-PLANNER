/** Owner operator evidence only. No deployment, provider writes or D1 mutations. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { githubAPI, snapshot } from '../release-assistant-api.mjs';
import { validateOwner, validateCI, validateActive, policyDigest } from '../release-assistant-core.mjs';
import { ACCOUNT, DB_ID, RELEASE } from './operator-authorization.mjs';

export const FRONTEND_ORIGIN = 'https://hotrosinhvienhub.id.vn';
// Read-only observation of the guarded v477 release, 2026-11-21. Owner reviews
// this pin with this operator PR; it is not an assertion that newer main deployed.
export const V477_ASSET_MANIFEST_SHA256 = '5a5cddda178f1817aba68e54f356ea16393dd3b4692b5f18b26b8f6fd215cdd0';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export async function verifyPublicationOperator(release, { github_read_token, cloudflare_read_token, fetchImpl = fetch }) {
  assert(release.sha === RELEASE.sha && release.run_id === RELEASE.run_id && release.worker_version === RELEASE.version
    && release.asset_manifest_sha256 === V477_ASSET_MANIFEST_SHA256 && /^[a-f0-9]{40}$/.test(release.operator_sha || ''), 'Reviewed v477/operator evidence required');
  assert([github_read_token, cloudflare_read_token].every(t => typeof t === 'string' && t.length && !/[\r\n]/.test(t)), 'Authenticated provider credentials required');
  const api = githubAPI(github_read_token, { fetchImpl });
  // Reuse the existing live branch/environment protection and exact-main CI
  // policy unchanged. No release dispatch, variables or permissions are changed.
  const state = await snapshot(api);
  validateOwner(state); const ci = validateCI(state); validateActive(state.runs);
  assert(state.user.id === 252552483 && state.repository.id === 1126820605
    && state.branch.commit.sha === release.operator_sha, 'Authenticated exact-main operator required');
  const [run, jobs, content] = await Promise.all([
    api(`/actions/runs/${RELEASE.run_id}`), api(`/actions/runs/${RELEASE.run_id}/jobs?per_page=100`),
    api(`/contents/cloudflare/worker/src/course-publication.ts?ref=${RELEASE.sha}`),
  ]);
  assert(run.id === RELEASE.run_id && run.repository?.id === 1126820605 && run.head_sha === RELEASE.sha && run.head_branch === 'main'
    && run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy-cloudflare-production.yml'
    && run.actor?.id === 252552483 && run.triggering_actor?.id === 252552483 && run.run_attempt === 1
    && run.status === 'completed' && run.conclusion === 'success', 'Guarded owner v477 release required');
  assert(jobs.total_count === jobs.jobs?.length && jobs.total_count < 100, 'Complete release jobs required');
  const job = jobs.jobs.find(j => j.name === 'release-public');
  assert(job?.conclusion === 'success' && ['Verify live settings and schema without applying migrations',
    'Verify solo owner approval, live protections and exact-SHA CI', 'Deploy Public Worker and frontend assets',
    'Verify serving Public version preserves V2 100 percent and document flags remain OFF']
    .every(name => job.steps?.some(s => s.name === name && s.conclusion === 'success')), 'Predeploy/owner/deploy/postdeploy receipts required');
  const gate = Buffer.from((await readFile(new URL('../../cloudflare/worker/src/course-publication.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  assert(content.type === 'file' && content.sha === createHash('sha1').update(`blob ${gate.length}\0`).update(gate).digest('hex'), 'Released gate code differs');
  const cf = async suffix => {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/hub-planner-public-dev-api${suffix}`,
      { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${cloudflare_read_token}` } });
    assert(r.ok, 'Live Worker evidence unavailable'); const b = await r.json(); assert(b.success === true && b.result, 'Invalid Worker evidence'); return b.result;
  };
  const [deployment, version, manifest] = await Promise.all([cf('/deployments'), cf(`/versions/${RELEASE.version}`),
    fetchImpl(`${FRONTEND_ORIGIN}/.vite/manifest.json`, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })]);
  const serving = deployment.deployments?.[0];
  assert(serving?.versions?.length === 1 && serving.versions[0].version_id === RELEASE.version && serving.versions[0].percentage === 100
    && version.id === RELEASE.version && Date.parse(version.metadata?.created_on) >= Date.parse(job.started_at)
    && Date.parse(version.metadata?.created_on) <= Date.parse(job.completed_at), 'Reviewed v477 must serve 100 percent');
  assert(version.resources?.bindings?.some(b => b.name === 'DB' && b.type === 'd1' && b.id === DB_ID)
    && ['COURSE_READ_AUTHORITY', 'COURSE_WRITE_AUTHORITY'].every(name => version.resources.bindings.some(b => b.name === name && b.text === 'd1')), 'Existing D1 binding/authority required');
  assert(manifest.ok && /application\/json/i.test(manifest.headers.get('Content-Type') || ''), 'Frontend manifest unavailable');
  const bytes = Buffer.from(await manifest.arrayBuffer());
  assert(bytes.length < 1000000 && createHash('sha256').update(bytes).digest('hex') === release.asset_manifest_sha256
    && Object.values(JSON.parse(bytes)).some(entry => entry.isEntry && typeof entry.file === 'string'), 'Reviewed frontend manifest differs');
  return Object.freeze({ operator_sha: release.operator_sha, release_sha: RELEASE.sha, ci_run: ci, policy_sha256: policyDigest(state),
    worker_version: RELEASE.version, asset_manifest_sha256: release.asset_manifest_sha256 });
}
