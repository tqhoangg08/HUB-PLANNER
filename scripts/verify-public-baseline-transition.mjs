import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const TRANSITION_BASE = 'eaa2a55860f07265d8d4fbe42157d0008a24707b';
const SHA = /^[a-f0-9]{40}$/;
const API = 'https://api.github.com/repos/tqhoangg08/HUB-PLANNER';
const REPO = 1126820605;
const OWNER = 252552483;
const scope = new Map([
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

function requireEvidence(ok, code) {
  if (!ok) throw Error(code);
}

export function describeTransition(head, { git = (...args) => execFileSync('git', args) } = {}) {
  requireEvidence(SHA.test(head || '') && head !== TRANSITION_BASE, 'EXACT_CANDIDATE_SHA_REQUIRED');
  requireEvidence(git('cat-file', '-t', head).toString().trim() === 'commit', 'CANDIDATE_COMMIT_REQUIRED');
  git('merge-base', '--is-ancestor', TRANSITION_BASE, head);
  const raw = git('diff-tree', '--no-commit-id', '-r', '--raw', '-z', '--no-abbrev',
    '--no-renames', TRANSITION_BASE, head, '--');
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
    remaining.delete(path);
  }
  return { base: TRANSITION_BASE, head, diff_sha256: createHash('sha256').update(raw).digest('hex') };
}

export function approvalText(pr, candidate) {
  return `HUB Public baseline transition v476 -> v477\npr=${pr}\nbase=${candidate.base}\nhead=${candidate.head}\ndiff_sha256=${candidate.diff_sha256}`;
}

/** Call explicitly during review. Draft validation has no owner credential or authority to post approval. */
export async function verifyTransition({ head, pr, comment, token, git, fetchImpl = fetch }) {
  requireEvidence(Number.isSafeInteger(pr) && pr > 0 && Number.isSafeInteger(comment) && comment > 0,
    'PR_AND_OWNER_COMMENT_REQUIRED');
  requireEvidence(typeof token === 'string' && token.trim() && !/[\r\n]/.test(token), 'GITHUB_READ_CREDENTIAL_REQUIRED');
  const candidate = describeTransition(head, { git });
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
    Number.isFinite(Date.parse(review.created_at)) && review.body === approvalText(pr, candidate),
  'AUTHENTIC_OWNER_TRANSITION_APPROVAL_REQUIRED');
  checkPull(await get(`/pulls/${pr}`));
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, head, pr, comment, ...extra] = process.argv.slice(2);
    if (command === 'describe' && pr === undefined) console.log(JSON.stringify(describeTransition(head)));
    else if (command === 'verify' && !extra.length) {
      const candidate = await verifyTransition({ head, pr: Number(pr), comment: Number(comment), token: process.env.GH_TOKEN });
      console.log(JSON.stringify({ ...candidate, owner_transition_approval: 'verified' }));
    } else throw Error('EXPECTED_DESCRIBE_OR_VERIFY');
  } catch (error) {
    console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'BASELINE_TRANSITION_UNVERIFIED');
    process.exitCode = 1;
  }
}
