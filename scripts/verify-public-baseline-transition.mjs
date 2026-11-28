import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TRANSITION_BASE = 'eaa2a55860f07265d8d4fbe42157d0008a24707b';
const SHA = /^[a-f0-9]{40}$/;
const API = 'https://api.github.com/repos/tqhoangg08/HUB-PLANNER';
const REPO = 1126820605;
const OWNER = 252552483;
const v477Scope = new Map([
  ['scripts/check-public-release-state.mjs', 'M'],
  ['scripts/verify-public-baseline-transition.mjs', 'A'],
  ['tests/fixtures/hk2-release-freeze.mjs', 'A'],
  ['tests/release-baseline-transition.test.mjs', 'A'],
  ['tests/public-release-v2-rollout.test.mjs', 'M'],
  ['tests/hk2-production-transport.test.mjs', 'M'],
  ['tests/hk2-publication-transport.test.mjs', 'M'],
  ['tests/hk2-publication-session.test.mjs', 'M'],
  ['docs/public-release-baseline-04e1f162.json', 'A'],
  ['docs/github-environment-release-approval.md', 'M'],
]);

export const COURSE_FACETS_TRANSITION = JSON.parse(readFileSync(
  new URL('../docs/public-release-transition-course-facets-e.json', import.meta.url), 'utf8'));
export const HOSTNAME_TRANSITION = JSON.parse(readFileSync(
  new URL('../docs/public-release-transition-disable-hostnames.json', import.meta.url), 'utf8'));
export const V478_BASELINE = JSON.parse(readFileSync(
  new URL('../docs/public-release-baseline-65f4241b.json', import.meta.url), 'utf8'));
const v478Scope = new Map([
  ...Object.keys(V478_BASELINE.transition.protectedBlobs).map(path => [path, 'M']),
  ['docs/public-release-baseline-65f4241b.json', 'A'],
  ['scripts/verify-public-baseline-transition.mjs', 'M'],
  ['tests/fixtures/hk2-release-freeze.mjs', 'M'],
  ['tests/public-release-v2-rollout.test.mjs', 'M'],
  ['tests/release-baseline-transition.test.mjs', 'M'],
]);
const hostnameScope = new Map([
  ...Object.keys(HOSTNAME_TRANSITION.protectedBlobs).map(path => [path, 'M']),
  ['docs/public-release-transition-disable-hostnames.json', 'A'],
  ['scripts/verify-public-baseline-transition.mjs', 'M'],
  ['tests/fixtures/hk2-release-freeze.mjs', 'M'],
  ['tests/public-release-v2-rollout.test.mjs', 'M'],
  ['tests/release-baseline-transition.test.mjs', 'M'],
]);
const eScope = new Map([
  ...Object.keys(COURSE_FACETS_TRANSITION.runtimeBlobs).map(path => [path, 'M']),
  ['docs/public-release-transition-course-facets-e.json', 'A'],
  ['scripts/verify-public-baseline-transition.mjs', 'M'],
  ['tests/course-facets-e.test.mjs', 'A'],
  ['tests/fixtures/hk2-release-freeze.mjs', 'M'],
  ['tests/hk2-course-publication.test.mjs', 'M'],
  ['tests/hk2-production-transport.test.mjs', 'M'],
  ['tests/hk2-publication-session.test.mjs', 'M'],
  ['tests/hk2-publication-transport.test.mjs', 'M'],
  ['tests/release-baseline-transition.test.mjs', 'M'],
]);
const transitions = new Map([
  ['v477', { base: TRANSITION_BASE, scope: v477Scope, title: 'HUB Public baseline transition v476 -> v477', blobs: {} }],
  ['e', { base: COURSE_FACETS_TRANSITION.base, scope: eScope,
    title: 'HUB Public course facets E transition (v477 remains pinned)', blobs: COURSE_FACETS_TRANSITION.runtimeBlobs }],
  ['hostnames', { base: HOSTNAME_TRANSITION.base, scope: hostnameScope,
    title: 'HUB Public auxiliary hostname transition (v477 remains pinned)', blobs: HOSTNAME_TRANSITION.protectedBlobs }],
  ['v478', { base: V478_BASELINE.transition.base, scope: v478Scope,
    title: 'HUB Public baseline transition v477 -> v478', blobs: V478_BASELINE.transition.protectedBlobs }],
]);

function transitionSpec(name) {
  const spec = transitions.get(name);
  requireEvidence(spec, 'UNKNOWN_BASELINE_TRANSITION');
  return spec;
}

function requireEvidence(ok, code) {
  if (!ok) throw Error(code);
}

export function describeTransition(head, { transition = 'v477', git = (...args) => execFileSync('git', args) } = {}) {
  const { base, scope, blobs } = transitionSpec(transition);
  requireEvidence(SHA.test(head || '') && head !== base, 'EXACT_CANDIDATE_SHA_REQUIRED');
  requireEvidence(git('cat-file', '-t', head).toString().trim() === 'commit', 'CANDIDATE_COMMIT_REQUIRED');
  git('merge-base', '--is-ancestor', base, head);
  const raw = git('diff-tree', '--no-commit-id', '-r', '--raw', '-z', '--no-abbrev',
    '--no-renames', base, head, '--');
  const entries = raw.toString('utf8').split('\0');
  requireEvidence(entries.pop() === '' && entries.length === scope.size * 2, 'TRANSITION_SCOPE_MISMATCH');
  const remaining = new Map(scope);
  for (let i = 0; i < entries.length; i += 2) {
    const [metadata, path] = entries.slice(i, i + 2);
    const status = remaining.get(path);
    const match = /^:(000000|100644) 100644 ([a-f0-9]{40}) ([a-f0-9]{40}) ([AM])$/.exec(metadata);
    requireEvidence(match && match[4] === status &&
      (status === 'A' ? match[1] === '000000' && /^0{40}$/.test(match[2]) :
        match[1] === '100644' && !/^0{40}$/.test(match[2])) && !/^0{40}$/.test(match[3]) &&
      match[2] !== match[3], 'TRANSITION_SCOPE_MISMATCH');
    if (Object.hasOwn(blobs, path)) {
      const expected = blobs[path];
      requireEvidence(match[2] === expected.before && match[3] === expected.after, 'TRANSITION_RUNTIME_BLOB_MISMATCH');
    }
    remaining.delete(path);
  }
  return { base, head, diff_sha256: createHash('sha256').update(raw).digest('hex') };
}

export function approvalText(pr, candidate, transition = 'v477') {
  return `${transitionSpec(transition).title}\npr=${pr}\nbase=${candidate.base}\nhead=${candidate.head}\ndiff_sha256=${candidate.diff_sha256}`;
}

/** Call explicitly during review. Draft validation has no owner credential or authority to post approval. */
export async function verifyTransition({ head, pr, comment, token, git, transition = 'v477', fetchImpl = fetch }) {
  requireEvidence(Number.isSafeInteger(pr) && pr > 0 && Number.isSafeInteger(comment) && comment > 0,
    'PR_AND_OWNER_COMMENT_REQUIRED');
  requireEvidence(typeof token === 'string' && token.trim() && !/[\r\n]/.test(token), 'GITHUB_READ_CREDENTIAL_REQUIRED');
  const candidate = describeTransition(head, { git, transition });
  const get = async path => {
    const response = await fetchImpl(API + path, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    requireEvidence(response.ok, 'GITHUB_TRANSITION_EVIDENCE_UNAVAILABLE');
    return response.json();
  };
  const checkPull = pull => requireEvidence(pull.state === 'open' && pull.number === pr &&
    pull.base?.ref === 'main' && pull.base?.sha === candidate.base && pull.base?.repo?.id === REPO &&
    pull.head?.repo?.id === REPO && pull.head?.sha === candidate.head, 'PR_SHA_OR_REPOSITORY_CHANGED');
  checkPull(await get(`/pulls/${pr}`));
  const review = await get(`/issues/comments/${comment}`);
  requireEvidence(review.id === comment && review.issue_url === `${API}/issues/${pr}` &&
    review.user?.id === OWNER && review.user?.type === 'User' && review.created_at === review.updated_at &&
    Number.isFinite(Date.parse(review.created_at)) && review.body === approvalText(pr, candidate, transition),
  'AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED');
  checkPull(await get(`/pulls/${pr}`));
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, head, pr, comment, ...extra] = process.argv.slice(2);
    const [, transition = 'v477'] = (command ?? '').split('-');
    if (['describe', 'describe-e', 'describe-hostnames', 'describe-v478'].includes(command) && pr === undefined) {
      console.log(JSON.stringify(describeTransition(head, { transition })));
    }
    else if (['verify', 'verify-e', 'verify-hostnames', 'verify-v478'].includes(command) && !extra.length) {
      const candidate = await verifyTransition({ head, pr: Number(pr), comment: Number(comment), token: process.env.GH_TOKEN, transition });
      console.log(JSON.stringify({ ...candidate, owner_transition_approval: 'verified' }));
    } else throw Error('EXPECTED_DESCRIBE_OR_VERIFY');
  } catch (error) {
    console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'BASELINE_TRANSITION_UNVERIFIED');
    process.exitCode = 1;
  }
}
