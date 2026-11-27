import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { approvalText, describeTransition, TRANSITION_BASE, COURSE_FACETS_TRANSITION, HOSTNAME_TRANSITION, verifyTransition } from '../scripts/verify-public-baseline-transition.mjs';
import { assertHk2ReleaseFreeze, readPreHostnameTransitionFile } from './fixtures/hk2-release-freeze.mjs';

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
  const current = readPreHostnameTransitionFile(sourcePath).replace(/\r\n/g, '\n').split('\n');
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

test('E transition binds both runtime blobs and rejects scope, mode, SHA, owner and digest drift', async () => {
  const { base, runtimeBlobs } = COURSE_FACETS_TRANSITION;
  const paths = [
    ...Object.keys(runtimeBlobs).map(path => ['M', path]),
    ['A', 'docs/public-release-transition-course-facets-e.json'],
    ['M', 'scripts/verify-public-baseline-transition.mjs'],
    ['A', 'tests/course-facets-e.test.mjs'],
    ['M', 'tests/fixtures/hk2-release-freeze.mjs'],
    ['M', 'tests/hk2-course-publication.test.mjs'],
    ['M', 'tests/hk2-production-transport.test.mjs'],
    ['M', 'tests/hk2-publication-session.test.mjs'],
    ['M', 'tests/hk2-publication-transport.test.mjs'],
    ['M', 'tests/release-baseline-transition.test.mjs'],
  ];
  const raw = paths.map(([status, path]) => {
    const before = runtimeBlobs[path]?.before ?? (status === 'A' ? '0' : '1').repeat(40);
    const after = runtimeBlobs[path]?.after ?? '2'.repeat(40);
    return `:${status === 'A' ? '000000' : '100644'} 100644 ${before} ${after} ${status}\0${path}\0`;
  }).join('');
  const git = (diff = raw) => (command, ...args) => {
    if (command === 'cat-file') return Buffer.from('commit\n');
    if (command === 'merge-base') {
      assert.deepEqual(args, ['--is-ancestor', base, candidate]);
      return Buffer.alloc(0);
    }
    assert.deepEqual(args.slice(-3), [base, candidate, '--']);
    return Buffer.from(diff);
  };
  const describe = diff => describeTransition(candidate, { transition: 'e', git: git(diff) });
  const expected = describe();
  assert.equal(expected.base, base);
  assert.throws(() => describe(raw.replace(Object.values(runtimeBlobs)[0].after, 'f'.repeat(40))),
    /TRANSITION_RUNTIME_BLOB_MISMATCH/);
  assert.throws(() => describe(raw.replace('100644 100644', '100644 100755')), /TRANSITION_SCOPE_MISMATCH/);
  assert.throws(() => describe(raw + `:100644 100644 ${'1'.repeat(40)} ${'2'.repeat(40)} M\0README.md\0`),
    /TRANSITION_SCOPE_MISMATCH/);

  const pr = 42, comment = 50;
  const pull = { state: 'open', number: pr, base: { ref: 'main', sha: base, repo }, head: { sha: candidate, repo } };
  const owner = { id: comment, issue_url: prefix + '/issues/42', body: approvalText(pr, expected, 'e'),
    user: { id: 252552483, type: 'User' }, created_at: '2026-11-25T01:00:00Z', updated_at: '2026-11-25T01:00:00Z' };
  const verify = (newPull = pull, newOwner = owner, diff = raw) => verifyTransition({
    head: candidate, pr, comment, token: 'mock-only', transition: 'e', git: git(diff),
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET');
      return Response.json(url.includes('/issues/comments/') ? newOwner : newPull);
    },
  });
  assert.deepEqual(await verify(), expected);
  await assert.rejects(verify({ ...pull, base: { ...pull.base, sha: 'e'.repeat(40) } }), /PR_SHA_OR_REPOSITORY_CHANGED/);
  await assert.rejects(verify({ ...pull, head: { ...pull.head, sha: 'e'.repeat(40) } }), /PR_SHA_OR_REPOSITORY_CHANGED/);
  await assert.rejects(verify(pull, { ...owner, user: { id: 7, type: 'User' } }), /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, { ...owner, body: owner.body.replace(expected.diff_sha256, '0'.repeat(64)) }),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, owner, raw.replace('2'.repeat(40), '3'.repeat(40))),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
});

test('the E candidate keeps the v477 pin, release evidence, and original predicate bytes', () => {
  const { base, previousBaseline } = COURSE_FACETS_TRANSITION;
  for (const path of [previousBaseline.receipt, 'scripts/check-public-release-state.mjs', '.github/workflows/deploy-cloudflare-production.yml']) {
    execFileSync('git', ['diff', '--exit-code', base, HOSTNAME_TRANSITION.base, '--', path]);
    assertHk2ReleaseFreeze(HOSTNAME_TRANSITION.base, [path]);
  }
  const path = 'cloudflare/worker/src/course-publication.ts';
  const previous = execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' });
  const key = /const verifiedOpenSql = `[^\x60]+`;/;
  const cache = /export const canCacheCourseRequest = [\s\S]+$/;
  const current = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(previous.match(key));
  assert.equal(current.match(key)?.[0], previous.match(key)[0]);
  assert.equal(current.match(cache)?.[0], previous.match(cache)?.[0]);
  assertHk2ReleaseFreeze('d0a91352ec7e32744e4f6e8331c88b56347717df', ['cloudflare'],
    { courseFacetsTransition: true });
});

test('hostname freeze transition is pinned to the merged Facets E tree and keeps both receipts', () => {
  const { base, previousBaseline, protectedBlobs, authorizesDeployment } = HOSTNAME_TRANSITION;
  assert.equal(base, '3141b8cd67a22a6c24661381350695083bb5f443');
  assert.equal(previousBaseline.version, '04e1f162-6ca5-4ef1-8161-aa74deefef68');
  assert.equal(authorizesDeployment, false);
  const configPath = 'cloudflare/wrangler.jsonc';
  const guardPath = 'scripts/check-public-release-state.mjs';
  assert.deepEqual(Object.keys(protectedBlobs).sort(), [configPath, guardPath]);
  assertHk2ReleaseFreeze(base, [configPath, guardPath, previousBaseline.receipt, previousBaseline.courseFacetsTransition]);
  const original = readPreHostnameTransitionFile(configPath);
  const current = readFileSync(configPath, 'utf8').replace(/\r\n/g, '\n');
  assert.match(original, /^  "workers_dev": true,$/m);
  assert.equal(current, original.replace('  "workers_dev": true,\n', '  "workers_dev": false,\n  "preview_urls": false,\n'));
});

test('hostname owner verifier checks exact files, modes, blobs, base, head and approval digest', async () => {
  const { base, protectedBlobs } = HOSTNAME_TRANSITION;
  const paths = [
    ['M', 'cloudflare/wrangler.jsonc'],
    ['A', 'docs/public-release-transition-disable-hostnames.json'],
    ['M', 'scripts/check-public-release-state.mjs'],
    ['M', 'scripts/verify-public-baseline-transition.mjs'],
    ['M', 'tests/fixtures/hk2-release-freeze.mjs'],
    ['M', 'tests/public-release-v2-rollout.test.mjs'],
    ['M', 'tests/release-baseline-transition.test.mjs'],
  ];
  const raw = paths.map(([status, path]) => {
    const added = status === 'A';
    const before = protectedBlobs[path]?.before ?? (added ? '0' : '1').repeat(40);
    const after = protectedBlobs[path]?.after ?? '2'.repeat(40);
    return `:${added ? '000000' : '100644'} 100644 ${before} ${after} ${status}\0${path}\0`;
  }).join('');
  const git = (diff = raw) => (command, ...args) => {
    if (command === 'cat-file') {
      assert.deepEqual(args, ['-t', candidate]);
      return Buffer.from('commit\n');
    }
    if (command === 'merge-base') {
      assert.deepEqual(args, ['--is-ancestor', base, candidate]);
      return Buffer.alloc(0);
    }
    assert.equal(command, 'diff-tree');
    assert.deepEqual(args.slice(-3), [base, candidate, '--']);
    return Buffer.from(diff);
  };
  const describe = diff => describeTransition(candidate, { transition: 'hostnames', git: git(diff) });
  const reviewed = describe();
  assert.equal(reviewed.base, base);
  assert.equal(reviewed.head, candidate);
  for (const { before, after } of Object.values(protectedBlobs)) {
    for (const blob of [before, after]) assert.throws(() => describe(raw.replace(blob, 'f'.repeat(40))), /TRANSITION_RUNTIME_BLOB_MISMATCH/);
  }
  assert.throws(() => describe(raw.replace('100644 100644', '100644 100755')), /TRANSITION_SCOPE_MISMATCH/);
  assert.throws(() => describe(raw + `:100644 100644 ${'1'.repeat(40)} ${'2'.repeat(40)} M\0README.md\0`),
    /TRANSITION_SCOPE_MISMATCH/);

  const pr = 51, comment = 61;
  const pull = { state: 'open', number: pr, base: { ref: 'main', sha: base, repo }, head: { sha: candidate, repo } };
  const owner = {
    id: comment, issue_url: prefix + '/issues/51', body: approvalText(pr, reviewed, 'hostnames'),
    user: { id: 252552483, type: 'User' }, created_at: '2026-11-27T02:00:00Z', updated_at: '2026-11-27T02:00:00Z',
  };
  const verify = (livePull = pull, liveComment = owner, diff = raw) => verifyTransition({
    head: candidate, pr, comment, token: 'mock-only', transition: 'hostnames', git: git(diff),
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET');
      return Response.json(url.includes('/issues/comments/') ? liveComment : livePull);
    },
  });
  assert.deepEqual(await verify(), reviewed);
  await assert.rejects(verify({ ...pull, base: { ...pull.base, sha: 'e'.repeat(40) } }), /PR_SHA_OR_REPOSITORY_CHANGED/);
  await assert.rejects(verify({ ...pull, head: { ...pull.head, sha: 'e'.repeat(40) } }), /PR_SHA_OR_REPOSITORY_CHANGED/);
  await assert.rejects(verify(pull, { ...owner, user: { ...owner.user, id: 7 } }), /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, { ...owner, body: owner.body.replace(reviewed.diff_sha256, '0'.repeat(64)) }),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, { ...owner, body: owner.body.replaceAll('\n', '\r\n') }),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, { ...owner, updated_at: '2026-11-27T02:01:00Z' }),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
  await assert.rejects(verify(pull, owner, raw.replace('2'.repeat(40), '3'.repeat(40))),
    /AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED/);
});
