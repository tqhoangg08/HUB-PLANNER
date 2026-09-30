import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

test.after(async () => {
  await browser.close();
  await server.close();
});

const openHarness = async (view) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (view === 'onboarding') {
    await page.route('**/api/user/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const payload = path.endsWith('/student-directory/classes')
        ? { classes: ['ĐHC 01', 'ĐHC 02', 'KTA 01'] }
        : path.endsWith('/student-directory')
          ? { matched: true, studentCode: '000000000001', fullName: 'Sinh viên thử nghiệm',
            gender: 'Nữ', generalClass: 'ĐHC 01', cohort: '41', trainingProgram: 'Đại học chính quy chuẩn' }
          : { success: true, publicProfile: null, privateProfile: null };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
  }
  await page.goto(`${baseUrl}tests/student-directory-fields-harness.html?view=${view}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return { context, page };
};

const checkPicker = async (page, selector) => {
  const picker = page.locator(selector);
  await picker.click();
  const list = page.getByRole('listbox');
  await list.waitFor();
  assert.equal(await list.getByRole('option').last().innerText(), 'Không tìm thấy, tự nhập');
  await picker.fill('kta');
  assert.equal(await list.getByRole('option').count(), 2);
  assert.equal(await list.getByRole('option').first().innerText(), 'KTA 01');
  assert.equal(await list.getByRole('option').last().innerText(), 'Không tìm thấy, tự nhập');
  await list.getByRole('option', { name: 'Không tìm thấy, tự nhập' }).click();
  const manual = page.locator('[data-class-entry="manual"] input');
  await manual.waitFor();
  await manual.fill('Lớp tự nhập');
  assert.equal(await manual.inputValue(), 'Lớp tự nhập');
};

test('onboarding prefills directory fields, locks name, allows cohort and searchable/manual class', async () => {
  const { context, page } = await openHarness('onboarding');
  try {
    const name = page.locator('#onboarding-name');
    await name.waitFor();
    await page.waitForFunction(() => document.querySelector('#onboarding-name')?.value === 'Sinh viên thử nghiệm');
    assert.equal(await name.getAttribute('readonly'), '');
    assert.equal(await page.locator('#onboarding-gender').inputValue(), 'Nữ');
    assert.deepEqual(await page.locator('#onboarding-gender option').allTextContents(),
      ['-- Chọn giới tính --', 'Nam', 'Nữ']);
    assert.equal(await page.locator('#onboarding-cohort').inputValue(), 'K41');
    assert.equal(await page.locator('#onboarding-cohort').isEnabled(), true);
    await page.locator('#onboarding-cohort').selectOption('K42');
    assert.equal(await page.locator('#onboarding-cohort').inputValue(), 'K42');
    assert.equal(await page.locator('#onboarding-class').inputValue(), 'ĐHC 01');
    await checkPicker(page, '#onboarding-class');
    assert.equal(await page.getByText('Theo dữ liệu sinh viên HUB · Không thể thay đổi').count(), 0);
  } finally { await context.close(); }
});

test('profile update uses the same gender, name, cohort and class rules', async () => {
  const { context, page } = await openHarness('profile');
  try {
    const name = page.getByPlaceholder('Nhập tên...');
    assert.equal(await name.inputValue(), 'Sinh viên thử nghiệm');
    assert.equal(await name.getAttribute('readonly'), '');
    const gender = page.locator('select').filter({ has: page.locator('option[value="Nam"]') });
    assert.deepEqual(await gender.locator('option').allTextContents(), ['Chọn giới tính', 'Nam', 'Nữ']);
    await gender.selectOption('Nam');
    assert.equal(await gender.inputValue(), 'Nam');
    const cohort = page.locator('select').filter({ has: page.locator('option[value="K42"]') });
    assert.equal(await cohort.isEnabled(), true);
    await cohort.selectOption('K42');
    assert.equal(await cohort.inputValue(), 'K42');
    await checkPicker(page, '#profile-class');
    assert.equal(await page.getByText('Theo dữ liệu sinh viên HUB · Không thể thay đổi').count(), 0);
  } finally { await context.close(); }
});
