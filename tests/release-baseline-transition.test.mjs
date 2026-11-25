import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { approvalText, describeTransition, TRANSITION_BASE, verifyTransition } from '../scripts/verify-public-baseline-transition.mjs';
import { assertHk2ReleaseFreeze } from './fixtures/hk2-release-freeze.mjs';

const candidate = 'c'.repeat(40);
const repo = { id: 1126820605 };
const prefix = 'https://api.github.com/repos/tqhoangg08/HUB-PLANNER';
const files = [
  ['M', 'scripts/check-public-release-state.mjs'],
  ['A', 'scripts/verify-public-baseline-transition.mjs'],
  ['A', 'tests/fixtures/hk2-release-freeze.mjs'],
  ['A', 'tests/release-baseline-transition.test.mjs'],
  ['M', 'tests/public-release-v2-rollout.test.mjs'],
  ['M', 'tests/hk2-production-transport.test.mjs'],
  ['M', 'tests/hk2-publication-transport.test.mjs'],
  ['M', 'tests/hk2-publication-session.test.mjs'],
  ['A', 'docs/public-release-baseline-04e1f162.json'],
  ['M', 'docs/github-environment-release-approval.md'],
];

function diff(replace = s => s) {
  return Buffer.from(replace(files.map(([status, file]) =>
    `:${status === 'A' ? '000000' : '100644'} 100644 ${(status === 'A' ? '0' : '1').repeat(40)} ${'2'.repeat(40)} ${status}\0${file}\0`).join('')));
}

function gitWith(raw) {
  return (...args) => {
    const [command, option, base, head] = args;
    if (command === 'cat-file') {
      assert.deepEqual(args.slice(1), ['-t', candidate]);
      return Buffer.from('commit\n');
    }
    if (command === 'merge-base') {
      assert.deepEqual([option, base, head], ['--is-ancestor', TRANSITION_BASE, candidate]);
      return Buffer.alloc(0);
    }
    assert.deepEqual(args, ['diff-tree', '--no-commit-id', '-r', '--raw', '-z',
      '--no-abbrev', '--no-renames', TRANSITION_BASE, candidate, '--']);
    return raw;
  };
}

function provider(mutate = () => {}) {
  const git = gitWith(diff());
  const expected = describeTransition(candidate, { git });
  const pull = { state: 'open', number: 1, base: { ref: 'main', sha: TRANSITION_BASE, repo }, head: { sha: candidate, repo } };
  const comment = { id: 30, issue_url: prefix + '/issues/1', body: approvalText(1, expected),
    user: { id: 252552483, type: 'User' }, created_at: '2026-11-25T01:00:00Z', updated_at: '2026-11-25T01:00:00Z' };
  let reads = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-only');
    const call = ++reads;
    assert.equal(url, prefix + (call === 2 ? '/issues/comments/30' : '/pulls/1'));
    const body = structuredClone(call === 2 ? comment : pull);
    mutate(body, call);
    return Response.json(body);
  };
  return { expected, args: { head: candidate, pr: 1, comment: 30, token: 'fixture-only', git, fetchImpl } };
}

test('v477 transition requires provider-authenticated owner approval of the exact entire Git diff and SHA', async () => {
  const { expected, args } = provider();
  assert.deepEqual(await verifyTransition(args), expected);
  for (const mutate of [
    (body, call) => { if (call === 1) body.head.sha = 'a'.repeat(40); },
    (body, call) => { if (call === 3) body.base.sha = 'b'.repeat(40); },
    (body, call) => { if (call === 2) body.user.id = 7; },
    (body, call) => { if (call === 2) body.issue_url = prefix + '/issues/2'; },
    (body, call) => { if (call === 2) body.updated_at = '2026-11-25T01:01:00Z'; },
    (body, call) => { if (call === 2) body.body += '\n'; },
  ]) await assert.rejects(verifyTransition(provider(mutate).args), /PR_SHA_OR_REPOSITORY_CHANGED|AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verifyTransition({ ...provider().args, git: gitWith(diff(raw => raw.replace('2'.repeat(40), '3'.repeat(40)))) }),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/); // Even a different blob on an in-scope path.
  await assert.rejects(verifyTransition({ ...args, fetchImpl: async () => new Response('', { status: 404 }) }),
    /GITHUB_TRANSITION_EVIDENCE_UNAVAILABLE/);
  await assert.rejects(verifyTransition({ ...args, token: undefined, fetchImpl: assert.fail }),
    /GITHUB_READ_CREDENTIAL_REQUIRED/);
});

test('transition rejects an implicit HEAD, different scope or file mode before asking any provider', () => {
  for (const sha of [undefined, 'HEAD', candidate.slice(0, 8), TRANSITION_BASE])
    assert.throws(() => describeTransition(sha, { git: assert.fail }), /EXACT_CANDIDATE_SHA_REQUIRED/);
  for (const alter of [
    raw => raw.replace('docs/github-environment-release-approval.md', 'cloudflare/worker/src/courses.ts'),
    raw => raw + `:100644 100644 ${'1'.repeat(40)} ${'2'.repeat(40)} M\0README.md\0`,
    raw => raw.replace('100644 100644', '100644 100755'),
  ]) assert.throws(() => describeTransition(candidate, { git: gitWith(diff(alter)) }), /TRANSITION_SCOPE_MISMATCH/);
});

test('only the three exact provenance/pin lines change in the Public state guard; v477 evidence records its limitations', () => {
  const sourcePath = 'scripts/check-public-release-state.mjs';
  const old = execFileSync('git', ['show', `${TRANSITION_BASE}:${sourcePath}`], { encoding: 'utf8' }).split('\n');
  const current = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  assert.equal(current.length, old.length);
  assert.deepEqual(current.flatMap((line, i) => line === old[i] ? [] : [i + 1]), [13, 14, 15]);
  assertHk2ReleaseFreeze('7b951b27c416d7b3d767a1dbebbb7332d5c8a7ab', [sourcePath], { v477PinTransition: true });
  const record = JSON.parse(readFileSync('docs/public-release-baseline-04e1f162.json', 'utf8'));
  assert.equal(record.mainAtPreparation, TRANSITION_BASE);
  assert.equal(record.sha, '8416837eb5ce648ce9c1c6237b4eed81802dbd03');
  assert.equal(record.runId, '44764100186');
  assert.equal(record.version, '04e1f162-6ca5-4ef1-8161-aa74deefef68');
  assert.equal(record.deployment.id, 'b9c2b81c-547a-4ab4-9e8c-2c70befb3bda');
  assert.deepEqual(record.deployment.traffic, [{ versionId: record.version, percentage: 100 }]);
  assert.deepEqual(record.release.stepConclusions, { validate: 'success', predeploy: 'success', ownerApproval: 'success', deploy: 'success', postdeploy: 'success' });
  assert.ok(record.release.receipts.includes(`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${record.previousVersion}`));
  assert.ok(record.release.receipts.includes(`Current Version ID: ${record.version}`));
  assert.ok(record.release.receipts.includes(`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${record.version}`));
  for (const sha of [record.sha, record.mainAtPreparation])
    assert.equal(execFileSync('git', ['rev-parse', `${sha}:cloudflare/worker/src/course-publication.ts`], { encoding: 'utf8' }).trim(),
      record.publicationGateGitBlob);
  assert.deepEqual(record.evidenceLimits, { schemaReverified: false, servingFrontendManifestReverified: false,
    originalBuildArtifactAvailable: false, frontendByteParityVerified: false });
  assert.equal(record.authorizesDeployment, false);
});
