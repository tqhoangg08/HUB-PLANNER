import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { COURSE_FACETS_TRANSITION, HOSTNAME_TRANSITION, V478_BASELINE } from '../../scripts/verify-public-baseline-transition.mjs';

const guardPath = 'scripts/check-public-release-state.mjs';
const v477Guard = {
  before: '2b56893bcc93f4db3d766135727414777b6260d1',
  after: '956d1cf1268cbaf461978e0cab21941c30c84824',
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

export function readPreHostnameTransitionFile(path) {
  return git('show', `${HOSTNAME_TRANSITION.base}:${path}`);
}

function assertExactScope(anchor, paths, expected, end) {
  const targets = Object.keys(expected).sort();
  const revisions = end ? [anchor, end] : [anchor];
  const actual = git('diff', '--name-status', '-z', '--no-renames', ...revisions, '--', ...paths);
  assert.equal(actual, targets.map(path => `M\0${path}\0`).join(''), 'Unexpected change in the historical release freeze');
  if (!end) assert.equal(git('ls-files', '--others', '--exclude-standard', '-z', '--', ...paths), '',
    'Untracked file in the historical release freeze');
  for (const path of targets) {
    assert.equal(git('ls-tree', anchor, '--', path).trim(),
      `100644 blob ${expected[path].before}\t${path}`);
    if (end) {
      assert.equal(git('ls-tree', end, '--', path).trim(),
        `100644 blob ${expected[path].after}\t${path}`);
      continue;
    }
    assert.match(git('ls-files', '--stage', '--', path), /^100644 [0-9a-f]{40} 0\t[^\n]+\n$/);
    assert.ok(lstatSync(path).isFile(), 'The reviewed file must remain a regular file');
    assert.equal(git('hash-object', `--path=${path}`, path).trim(),
      expected[path].after, `File differs from the exact transition: ${path}`);
  }
}

/** Verify every relevant freeze segment at its pinned anchor and then the working copy. */
export function assertHk2ReleaseFreeze(anchor, paths, { v477PinTransition = false, courseFacetsTransition = false } = {}) {
  const expected = {
    ...(v477PinTransition ? { [guardPath]: v477Guard } : {}),
    ...(courseFacetsTransition ? COURSE_FACETS_TRANSITION.runtimeBlobs : {}),
  };
  if (v477PinTransition) assert.ok(paths.includes(guardPath));
  if (courseFacetsTransition) assert.ok(paths.includes('cloudflare'));
  const transitions = [HOSTNAME_TRANSITION, V478_BASELINE.transition];
  const start = transitions.findIndex(t => t.base === anchor);
  let segmentAnchor = anchor;
  let segmentBlobs = expected;
  for (const { base, protectedBlobs } of transitions.slice(Math.max(start, 0))) {
    const next = Object.fromEntries(Object.entries(protectedBlobs)
      .filter(([path]) => paths.some(scope => path === scope || path.startsWith(scope + '/'))));
    if (!Object.keys(next).length) continue;
    assertExactScope(segmentAnchor, paths, segmentBlobs, base);
    segmentAnchor = base;
    segmentBlobs = next;
  }
  assertExactScope(segmentAnchor, paths, segmentBlobs);
}
