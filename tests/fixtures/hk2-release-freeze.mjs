import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { COURSE_FACETS_TRANSITION } from '../../scripts/verify-public-baseline-transition.mjs';

const guardPath = 'scripts/check-public-release-state.mjs';
const v477Guard = {
  before: '2b56893bcc93f4db3d766135727414777b6260d1',
  after: '956d1cf1268cbaf461978e0cab21941c30c84824',
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

/** Compare the entire historical scope, with only exact transition blobs permitted. */
export function assertHk2ReleaseFreeze(anchor, paths, { v477PinTransition = false, courseFacetsTransition = false } = {}) {
  const expected = {
    ...(v477PinTransition ? { [guardPath]: v477Guard } : {}),
    ...(courseFacetsTransition ? COURSE_FACETS_TRANSITION.runtimeBlobs : {}),
  };
  const targets = Object.keys(expected).sort();
  if (!targets.length) {
    git('diff', '--exit-code', anchor, '--', ...paths);
    return;
  }
  if (v477PinTransition) assert.ok(paths.includes(guardPath));
  if (courseFacetsTransition) assert.ok(paths.includes('cloudflare'));
  const actual = git('diff', '--name-status', '-z', '--no-renames', anchor, '--', ...paths);
  assert.equal(actual, targets.map(path => `M\0${path}\0`).join(''), 'Unexpected change in the historical release freeze');
  for (const path of targets) {
    assert.equal(git('ls-tree', anchor, '--', path).trim(),
      `100644 blob ${expected[path].before}\t${path}`);
    assert.match(git('ls-files', '--stage', '--', path), /^100644 [0-9a-f]{40} 0\t[^\n]+\n$/);
    assert.ok(lstatSync(path).isFile(), 'The reviewed file must remain a regular file');
    assert.equal(git('hash-object', `--path=${path}`, path).trim(),
      expected[path].after, `File differs from the exact transition: ${path}`);
  }
}
