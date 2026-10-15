import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const server = await createServer({ configFile:false, plugins:[react()], cacheDir:'.cache/drl-browser-policy-deps',
  optimizeDeps:{entries:['tests/drl-policy-harness.html']}, server:{host:'127.0.0.1',port:0},logLevel:'error' });
await server.listen();
const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true });
test.after(async () => { await browser.close(); await server.close(); });
await mkdir('.cache/drl-ui', {recursive:true});
for (const width of [1440,390]) test(`full appendix and keyboard dialog at ${width}px`, async () => {
  const page = await browser.newPage({viewport:{width,height:844}});
  page.on('pageerror',(error) => console.error('Policy harness page error:',error.message));
  try {
    await page.goto(`${server.resolvedUrls.local[0]}tests/drl-policy-harness.html`);
    const snapshot = await page.getByLabel('Dữ liệu đã chọn').textContent();
    assert.equal(JSON.parse(snapshot).points,'10');
    await page.getByRole('button',{name:'Mở phụ lục'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('heading',{level:3}).count(),5);
    assert.equal(await dialog.locator('tbody tr').count(),64);
    assert.ok((await dialog.textContent()).includes('đóng dấu tròn'));
    assert.ok((await dialog.textContent()).includes('mini game'));
    assert.ok((await dialog.textContent()).includes('+ 5/hoạt động'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await dialog.getByText('Điều 8 — Các trường hợp đặc thù').click();
    assert.ok((await dialog.textContent()).includes('giai đoạn 3'));
    await page.screenshot({path:`.cache/drl-ui/appendix-${width}.png`});
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(),0);
    assert.equal(await page.getByRole('button',{name:'Mở phụ lục'}).evaluate((node) => node === document.activeElement),true);
    assert.equal(await page.getByLabel('Dữ liệu đã chọn').textContent(),snapshot);
    await page.getByLabel('Phiên bản quy chế').selectOption('hub-drl-2026-5549-v1');
    await page.getByLabel('Tìm tiêu chí, vai trò, cấp tổ chức').fill('Ban tổ chức');
    await page.getByRole('combobox',{name:'Quy tắc ĐRL chính thức',exact:true}).selectOption('hub-drl-2026-5549-v1:III:34');
    const chosen = JSON.parse(await page.getByLabel('Dữ liệu đã chọn').textContent());
    assert.equal(chosen.points,'5'); assert.equal(chosen.drl_academic_year,'2026-2027');
    await page.getByLabel('Năm học áp dụng').fill('2025-2026');
    assert.equal(await page.getByRole('combobox',{name:'Quy tắc ĐRL chính thức',exact:true}).isDisabled(),true);
  } finally { await page.close(); }
});
