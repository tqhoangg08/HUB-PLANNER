import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';

const server = await createServer({configFile:false,plugins:[react()],cacheDir:'.cache/event-contribution-deps',
  optimizeDeps:{entries:['tests/event-contribution-harness.html']},server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const browser = await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
test.after(async () => { await browser.close(); await server.close(); });
await mkdir('.cache/drl-ui',{recursive:true});
for (const width of [1440,390]) test(`actual contribution form: consistent typography, catalog errors and recovery at ${width}px`,async () => {
  const page = await browser.newPage({viewport:{width,height:950}});
  let status = 401, catalogCalls = 0;
  const calls = [];
  await page.route((url) => url.pathname === '/api' || url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push({path,method:route.request().method()});
    if (path === '/api/auth/get-session') return route.fulfill({json:null});
    if (path === '/api/private/v1/event-drl/catalog') {
      catalogCalls++;
      if (status !== 200) return route.fulfill({status,json:{error:'Fixture catalog failure'}});
      return route.fulfill({json:{success:true,organizers:['Đoàn Trường','Hội Sinh viên','Khoa Ngoại ngữ'],
        rules:[{rule_id:'III_FIXTURE',section:'III',rule_group:null,content:'Hoạt động chính trị',condition_text:'Ban tổ chức',points:5,unit:'hoạt động'}]}});
    }
    return route.fulfill({json:{success:true,data:[],count:0,total:0,items:[]}});
  });
  try {
    await page.goto(`${server.resolvedUrls.local[0]}tests/event-contribution-harness.html${width < 600 ? '?mobile' : ''}`,{waitUntil:'domcontentloaded',timeout:60_000});
    await page.getByRole('button',{name:'Gửi đóng góp',exact:true}).first().click();
    const form = page.locator('form').filter({has:page.locator('#event-drl-rule')});
    await form.getByRole('status').filter({hasText:'Vui lòng đăng nhập để tải danh mục đơn vị tổ chức và mục ĐRL.'}).waitFor();
    const organizer = form.getByRole('combobox').filter({hasNot:page.locator('option')});
    await organizer.fill('Đơn vị tự nhập');
    await organizer.press('Tab');
    const before = await organizer.inputValue();
    const fonts = await form.locator('input:not([type=checkbox]):not([type=hidden]),select,textarea').evaluateAll((nodes) =>
      nodes.filter((node) => node.getClientRects().length).map((node) => ({tag:node.tagName,font:getComputedStyle(node).fontSize})));
    assert.ok(fonts.length > 6);
    assert.deepEqual([...new Set(fonts.map((node) => node.font))],['14px']);
    const labelFonts = await form.locator('label').evaluateAll((nodes) => nodes.filter((node) => node.textContent.trim() && node.getClientRects().length)
      .map((node) => getComputedStyle(node).fontSize));
    assert.deepEqual([...new Set(labelFonts)],['14px']);
    await page.screenshot({path:`.cache/drl-ui/contribute-auth-${width}.png`,animations:'disabled'});
    status = 503;
    await form.getByRole('button',{name:'Tải lại danh mục'}).click();
    await form.getByRole('status').filter({hasText:'Không tải được danh mục đơn vị tổ chức và mục ĐRL. Vui lòng thử lại.'}).waitFor();
    assert.equal(await organizer.inputValue(),before);
    status = 200;
    await form.getByRole('button',{name:'Tải lại danh mục'}).click();
    await form.locator('#event-drl-rule option[value=III_FIXTURE]').waitFor({state:'attached'});
    await organizer.fill('Khoa');
    await form.getByRole('option',{name:'Khoa Ngoại ngữ',exact:true}).click();
    assert.equal(await organizer.inputValue(),'Khoa Ngoại ngữ');
    await form.getByRole('combobox',{name:'Quy tắc ĐRL chính thức'}).selectOption('III_FIXTURE');
    assert.equal(catalogCalls,3);
    assert.equal(await form.getByRole('button',{name:'Tải lại danh mục'}).count(),0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    assert.ok(calls.every((call) => call.method === 'GET'));
    await organizer.fill('');
    await form.getByRole('option',{name:'Đoàn Trường',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`.cache/drl-ui/contribute-ready-${width}.png`,animations:'disabled'});
  } finally { await page.close(); }
});
