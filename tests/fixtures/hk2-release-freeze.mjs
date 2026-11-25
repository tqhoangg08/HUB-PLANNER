import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';

const guardPath = 'scripts/check-public-release-state.mjs';
const v477Guard = {
  before: '2b56893bcc93f4db3d766135727414777b6260d1',
  after: '956d1cf1268cbaf461978e0cab21941c30c84824',
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

/** Preserve every path in the historical freeze. The v477 exception is one exact blob transition. */
export function assertHk2ReleaseFreeze(anchor, paths, { v477PinTransition = false } = {}) {
  if (!v477PinTransition) {
    git('diff', '--exit-code', anchor, '--', ...paths);
    return;
  }
  assert.ok(paths.includes(guardPath));
  const actual = git('diff', '--name-status', '-z', '--no-renames', anchor, '--', ...paths);
  assert.equal(actual, `M\0${guardPath}\0`, 'Unexpected change in the publication release freeze');
  assert.equal(git('ls-tree', anchor, '--', guardPath).trim(),
    `100644 blob ${v477Guard.before}\t${guardPath}`);
  assert.match(git('ls-files', '--stage', '--', guardPath), /^100644 [0-9a-f]{40} 0\t[^\n]+\n$/);
  assert.ok(lstatSync(guardPath).isFile(), 'The reviewed guard must remain a regular file');
  assert.equal(git('hash-object', `--path=${guardPath}`, guardPath).trim(),
    v477Guard.after, 'Predeploy guard differs from the exact v477 pin transition');
}
