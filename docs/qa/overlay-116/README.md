# Mobile overlay automated acceptance evidence

Real device acceptance: **NOT VERIFIED**. These are local emulated browser runs.

## Executed command logs

| Command | Result | Log |
| --- | --- | --- |
| npm run test:overlay | PASS (exit 0) | [log](final-test-overlay.log) |
| npm run typecheck | PASS (exit 0) | [log](final-typecheck.log) |
| npm run cf:typecheck | PASS (exit 0) | [log](final-cf-typecheck.log) |
| npm test | PASS (exit 0) | [log](final-test.log) |
| npm run build | PASS (exit 0) | [log](final-build-verified.log) |
| git diff --check | PASS (exit 0) | [log](final-diff-check.log) |
| npm run test:overlay:browser | PASS (exit 0) | [log](final-overlay-browser.log) |
| Chromium mobile matrix | PASS (exit 0) | [log](chromium-acceptance-verified.log) |
| WebKit mobile matrix | PASS (exit 0) | [log](webkit-acceptance-final.log) |

## Full-resolution samples

| Engine / device | Scene / viewport | Screenshot |
| --- | --- | --- |
| chromium / android360 | SchoolAnnouncements-1 / before | [image](samples/chromium-android360-SchoolAnnouncements-1-before.png) |
| chromium / android360 | SchoolAnnouncements-1 / during | [image](samples/chromium-android360-SchoolAnnouncements-1-during.png) |
| chromium / android360 | SchoolAnnouncements-1 / after | [image](samples/chromium-android360-SchoolAnnouncements-1-after.png) |
| chromium / android360 | SchoolAnnouncements-1 / compact | [image](samples/chromium-android360-SchoolAnnouncements-1-compact.png) |
| chromium / android360 | DrlScoreGuide-1 / during | [image](samples/chromium-android360-DrlScoreGuide-1-during.png) |
| chromium / android360 | EventFilterControls-1 / during | [image](samples/chromium-android360-EventFilterControls-1-during.png) |
| chromium / android360 | MobileSchedule-8 / compact | [image](samples/chromium-android360-MobileSchedule-8-compact.png) |
| chromium / android360 | FloatingSupportTab-1 / compact | [image](samples/chromium-android360-FloatingSupportTab-1-compact.png) |
| webkit / iphoneSE | SchoolAnnouncements-1 / before | [image](samples/webkit-iphoneSE-SchoolAnnouncements-1-before.png) |
| webkit / iphoneSE | SchoolAnnouncements-1 / during | [image](samples/webkit-iphoneSE-SchoolAnnouncements-1-during.png) |
| webkit / iphoneSE | SchoolAnnouncements-1 / after | [image](samples/webkit-iphoneSE-SchoolAnnouncements-1-after.png) |
| webkit / iphoneSE | SchoolAnnouncements-1 / compact | [image](samples/webkit-iphoneSE-SchoolAnnouncements-1-compact.png) |
| webkit / iphoneSE | DrlScoreGuide-1 / during | [image](samples/webkit-iphoneSE-DrlScoreGuide-1-during.png) |
| webkit / iphoneSE | EventFilterControls-1 / during | [image](samples/webkit-iphoneSE-EventFilterControls-1-during.png) |
| webkit / iphoneSE | MobileSchedule-8 / compact | [image](samples/webkit-iphoneSE-MobileSchedule-8-compact.png) |
| webkit / iphoneSE | FloatingSupportTab-1 / compact | [image](samples/webkit-iphoneSE-FloatingSupportTab-1-compact.png) |

## chromium: 328 scenarios PASS

| Device | Group | Cases | Screenshots |
| --- | --- | ---: | --- |
| iphone13 | account | 6 | [contact sheet](chromium-iphone13-account.png) |
| iphone13 | notices-support | 10 | [contact sheet](chromium-iphone13-notices-support.png) |
| iphone13 | admin | 9 | [contact sheet](chromium-iphone13-admin.png) |
| iphone13 | schedule | 23 | [contact sheet](chromium-iphone13-schedule.png) |
| iphone13 | learning | 18 | [contact sheet](chromium-iphone13-learning.png) |
| iphone13 | events-drl | 10 | [contact sheet](chromium-iphone13-events-drl.png) |
| iphone13 | lost-found | 6 | [contact sheet](chromium-iphone13-lost-found.png) |
| iphoneSE | account | 6 | [contact sheet](chromium-iphoneSE-account.png) |
| iphoneSE | notices-support | 10 | [contact sheet](chromium-iphoneSE-notices-support.png) |
| iphoneSE | admin | 9 | [contact sheet](chromium-iphoneSE-admin.png) |
| iphoneSE | schedule | 23 | [contact sheet](chromium-iphoneSE-schedule.png) |
| iphoneSE | learning | 18 | [contact sheet](chromium-iphoneSE-learning.png) |
| iphoneSE | events-drl | 10 | [contact sheet](chromium-iphoneSE-events-drl.png) |
| iphoneSE | lost-found | 6 | [contact sheet](chromium-iphoneSE-lost-found.png) |
| pixel7 | account | 6 | [contact sheet](chromium-pixel7-account.png) |
| pixel7 | notices-support | 10 | [contact sheet](chromium-pixel7-notices-support.png) |
| pixel7 | admin | 9 | [contact sheet](chromium-pixel7-admin.png) |
| pixel7 | schedule | 23 | [contact sheet](chromium-pixel7-schedule.png) |
| pixel7 | learning | 18 | [contact sheet](chromium-pixel7-learning.png) |
| pixel7 | events-drl | 10 | [contact sheet](chromium-pixel7-events-drl.png) |
| pixel7 | lost-found | 6 | [contact sheet](chromium-pixel7-lost-found.png) |
| android360 | account | 6 | [contact sheet](chromium-android360-account.png) |
| android360 | notices-support | 10 | [contact sheet](chromium-android360-notices-support.png) |
| android360 | admin | 9 | [contact sheet](chromium-android360-admin.png) |
| android360 | schedule | 23 | [contact sheet](chromium-android360-schedule.png) |
| android360 | learning | 18 | [contact sheet](chromium-android360-learning.png) |
| android360 | events-drl | 10 | [contact sheet](chromium-android360-events-drl.png) |
| android360 | lost-found | 6 | [contact sheet](chromium-android360-lost-found.png) |

## webkit: 164 scenarios PASS

| Device | Group | Cases | Screenshots |
| --- | --- | ---: | --- |
| iphone13 | account | 6 | [contact sheet](webkit-iphone13-account.png) |
| iphone13 | admin | 9 | [contact sheet](webkit-iphone13-admin.png) |
| iphone13 | learning | 18 | [contact sheet](webkit-iphone13-learning.png) |
| iphone13 | events-drl | 10 | [contact sheet](webkit-iphone13-events-drl.png) |
| iphone13 | notices-support | 10 | [contact sheet](webkit-iphone13-notices-support.png) |
| iphone13 | lost-found | 6 | [contact sheet](webkit-iphone13-lost-found.png) |
| iphone13 | schedule | 23 | [contact sheet](webkit-iphone13-schedule.png) |
| iphoneSE | account | 6 | [contact sheet](webkit-iphoneSE-account.png) |
| iphoneSE | admin | 9 | [contact sheet](webkit-iphoneSE-admin.png) |
| iphoneSE | learning | 18 | [contact sheet](webkit-iphoneSE-learning.png) |
| iphoneSE | events-drl | 10 | [contact sheet](webkit-iphoneSE-events-drl.png) |
| iphoneSE | notices-support | 10 | [contact sheet](webkit-iphoneSE-notices-support.png) |
| iphoneSE | lost-found | 6 | [contact sheet](webkit-iphoneSE-lost-found.png) |
| iphoneSE | schedule | 23 | [contact sheet](webkit-iphoneSE-schedule.png) |

The JSON report retains individual geometry, input/date/time checks, reachable primary actions, warnings, isolated API requests and SHA-256 paths for every raw screenshot. Raw full-size screenshots are retained under the recorded local `.cache` directories. Contact sheets include all modal scenes and a representative before/during/after sequence per device and group.
