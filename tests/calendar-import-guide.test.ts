import assert from 'node:assert/strict';
import test from 'node:test';
import { getCalendarHandoffPresentation, getCalendarImportGuide } from '../utils/calendarImportGuide.ts';

test('only successful download handoffs open the import guide', () => {
  assert.equal(getCalendarHandoffPresentation('share', 15).showGuide, false);
  assert.match(getCalendarHandoffPresentation('share', 15).successMessage || '', /15 buổi học/);
  assert.equal(getCalendarHandoffPresentation('download', 15).showGuide, true);
  assert.equal(getCalendarHandoffPresentation('download-after-share-failure', 15).showGuide, true);
  assert.deepEqual(getCalendarHandoffPresentation('cancelled', 15), { showGuide: false, successMessage: null });
});

test('iPhone and iPad receive the iOS steps and manual Safari install hint', () => {
  const iphone = getCalendarImportGuide({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', viewportWidth: 390 });
  assert.equal(iphone.device, 'ios');
  assert.match(iphone.title, /iPhone\/iPad/);
  assert.match(iphone.steps.join(' '), /ứng dụng Lịch/);
  assert.match(iphone.note || '', /Tệp > Tải về/);
  assert.equal(iphone.showPwaInstallCard, true);
  assert.equal(iphone.manualInstallHint, 'Chia sẻ → Thêm vào Màn hình chính');

  const ipad = getCalendarImportGuide({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
  assert.equal(ipad.device, 'ios');
});

test('Android, Windows and macOS get their own import instructions', () => {
  const android = getCalendarImportGuide({ userAgentData: { platform: 'Android', mobile: true } });
  assert.equal(android.device, 'android');
  assert.match(android.steps.join(' '), /Downloads/);
  assert.match(android.steps.join(' '), /lịch hoặc tài khoản/);
  assert.match(android.manualInstallHint || '', /Menu trình duyệt/);

  const windows = getCalendarImportGuide({ userAgentData: { platform: 'Windows', mobile: false } });
  assert.equal(windows.device, 'windows');
  assert.match(windows.steps.join(' '), /Outlook/);
  assert.equal(windows.showPwaInstallCard, false);

  const macos = getCalendarImportGuide({ userAgentData: { platform: 'macOS', mobile: false } });
  assert.equal(macos.device, 'macos');
  assert.match(macos.steps.join(' '), /Import/);
});

test('unknown devices get a generic guide; standalone PWA hides install advice', () => {
  const generic = getCalendarImportGuide({ userAgent: 'Unknown browser' });
  assert.equal(generic.device, 'generic');
  assert.equal(generic.title, 'Hoàn tất thêm lịch');
  assert.equal(generic.steps.length, 4);

  const standalone = getCalendarImportGuide({ userAgent: 'Android', standalone: true });
  assert.equal(standalone.showPwaInstallCard, false);
  const mobileBrowser = getCalendarImportGuide({ userAgent: 'Android', standalone: false });
  assert.equal(mobileBrowser.showPwaInstallCard, true);
});
