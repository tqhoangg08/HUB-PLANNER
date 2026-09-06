import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('existing profile bootstrap retries the bounded OAuth race without a write', () => {
  const apiSource = readFileSync(new URL('../utils/privateProfileApi.ts', import.meta.url), 'utf8');

  assert.match(apiSource, /PROFILE_BOOTSTRAP_RETRY_DELAYS_MS = \[0, 300, 900\]/);
  assert.match(apiSource, /PROFILE_BOOTSTRAP_MAX_WAIT_SECONDS = 14/);
  assert.match(apiSource, /privateApiRequest\('\/api\/user\/v1\/profile', \{[\s\S]*?AbortSignal\.timeout/);
  assert.doesNotMatch(apiSource, /method:\s*'PATCH'[\s\S]*PROFILE_BOOTSTRAP_RETRY_DELAYS_MS/);
});

test('profile bootstrap failure cannot fall through to empty onboarding data', () => {
  const hookSource = readFileSync(new URL('../hooks/useStudyData.ts', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../LegacyApp.tsx', import.meta.url), 'utf8');
  const failureBranch = hookSource.match(
    /const profile = await fetchOwnPrivateProfile\(\);[\s\S]*?catch \(error\) \{[\s\S]*?setProfileLoadError\('Không thể tải hồ sơ hiện có\. Vui lòng thử lại\.'\);[\s\S]*?return;[\s\S]*?\}\s*if \(!isActive\) return;/,
  );

  assert.ok(failureBranch, 'profile read failure must become a finite error state');
  assert.doesNotMatch(failureBranch[0], /loadDataIntoState\(INITIAL_STUDY_DATA\)/);
  assert.match(appSource, /profileLoadError[\s\S]*?Thử lại/);
});
