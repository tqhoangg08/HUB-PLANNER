import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

test('My Scholarships actual browser: approved Vietnamese details, no celebration CTA, auth states and responsive layout', { timeout: 180000 }, async () => {
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath, 'Chrome is required for browser acceptance');
  // Stub only the role hook; render the real page, shell, API client and built CSS.
  const bundled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import {ScholarshipMe} from './features/scholarships/ScholarshipMe'; createRoot(document.getElementById('root')).render(<BrowserRouter><ScholarshipMe/></BrowserRouter>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic', outdir: '.cache/scholarship-me/browser-bundle',
    plugins: [{ name: 'synthetic-role-only', setup(builder) {
      builder.onResolve({ filter: /hooks\/useUserRole$/ }, () => ({ path: 'synthetic-role', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const session = new URLSearchParams(location.search).get('case') === 'anonymous' ? null : {user:{email:'000000000001@st.buh.edu.vn',user_metadata:{full_name:'Sinh viên kiểm thử'}}}; export function useUserRole(){return {session,isAdmin:false,loading:false,bootstrapUnavailable:false};}` }));
    } }],
  });
  const javascript = bundled.outputFiles.find(file => file.path.endsWith('.js'))!;
  const cssFiles = readdirSync('dist/assets').filter(name => name.endsWith('.css'));
  assert.ok(cssFiles.length, 'Run npm run build before browser acceptance');
  const css = Buffer.concat(cssFiles.map(name => readFileSync(`dist/assets/${name}`)));
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    if (path === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(javascript.contents); }
    else if (path === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else if (path.startsWith('/assets/') && existsSync(`dist/assets/${path.split('/').pop()}`)) { res.end(readFileSync(`dist/assets/${path.split('/').pop()}`)); }
    else if (path === '/logoapp.png') { res.setHeader('Content-Type', 'image/png'); res.end(readFileSync('public/logoapp.png')); }
    else if (path === '/scholarships/me') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>'); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const award = { id: 1, fullName: 'Sinh viên kiểm thử', studentCode: '000000000001', awardType: 'Xuất sắc', className: 'TEST-A1', major: 'Kế toán', campaignSlug: 'synthetic-1', campaignTitle: 'Đợt học bổng kiểm thử 1', semester: '2', schoolYear: '2025–2026', gpa: 999, trainingScore: 999, scores: {} };
  const cases = [
    { name: 'one', awards: [{ ...award, scores: { gpa: 3.6, academicRank: 'Xuất sắc', trainingScore: 100, trainingRank: 'Xuất sắc', credits: 17, amountVnd: 13926000, customRawKey: 'hidden' } }] },
    { name: 'many', awards: [{ ...award, scores: { amountVnd: 13926000 } }, { ...award, id: 2, campaignTitle: 'Đợt học bổng kiểm thử 2', scores: { gpa: '9,7', amountVnd: null } }] },
    { name: 'amount-only', awards: [{ ...award, scores: { amountVnd: '13926000' } }] },
    { name: 'scores-only', awards: [{ ...award, scores: { gpa: 3.6, credits: 0 } }] },
    { name: 'no-details', awards: [{ ...award, scores: { gpa: null, amountVnd: null } }] },
    { name: 'anonymous', awards: [] },
    { name: 'empty', awards: [] },
    { name: 'error', awards: [] },
    { name: 'unverified', awards: [] },
  ];
  mkdirSync('.cache/scholarship-me', { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    for (const width of [360, 390, 768, 1280, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(12000);
      for (const fixture of cases) {
        let requests = 0;
        await page.unrouteAll();
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname !== '/api/me/scholarships') return route.continue();
          requests++;
          assert.equal(route.request().method(), 'GET');
          assert.equal(url.search, '', 'identity must never be supplied through a query parameter');
          await route.fulfill({ status: fixture.name === 'error' ? 503 : 200, json: fixture.name === 'error' ? { error: 'UNAVAILABLE' } : { verified: fixture.name !== 'unverified', awards: fixture.awards } });
        });
        await page.goto(`${origin}/scholarships/me?case=${fixture.name}`);
        assert.equal(await page.locator('.scholarship-topbar').evaluate(el => getComputedStyle(el).display), 'flex', 'lazy Scholarship CSS must be loaded before layout acceptance');
        assert.equal((await page.locator('.scholarship-logo img').boundingBox())?.width, 28);
        const main = page.locator('main');
        if (fixture.name === 'anonymous') {
          await page.getByRole('link', { name: 'Đăng nhập với email HUB', exact: true }).waitFor();
          assert.equal(requests, 0);
        } else if (fixture.name === 'empty') await page.getByRole('heading', { name: 'Không tìm thấy hồ sơ học bổng' }).waitFor();
        else if (fixture.name === 'unverified') await page.getByRole('heading', { name: 'Email sinh viên chưa được xác minh' }).waitFor();
        else if (fixture.name === 'error') { await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor(); assert.doesNotMatch(await main.innerText(), /Không tìm thấy hồ sơ/); }
        else {
          await page.getByRole('heading', { name: `Chi tiết học bổng (${fixture.awards.length})`, exact: true }).waitFor();
          assert.equal(await main.locator('h4').count(), fixture.awards.length);
          assert.equal(await main.getByText('Thành tiền:', { exact: true }).count(), ['one', 'many', 'amount-only'].includes(fixture.name) ? 1 : 0);
          assert.equal(await main.locator('dl').count(), fixture.name === 'no-details' ? 0 : fixture.awards.length);
          if (fixture.name === 'one') {
            for (const expected of ['Điểm TB HB: 3.6', 'Xếp loại HT: Xuất sắc', 'Điểm RL: 100', 'Xếp loại RL: Xuất sắc', 'Số TC: 17', 'Thành tiền: 13.926.000đ']) assert.ok((await main.innerText()).includes(expected), expected);
            assert.match(await main.evaluate(el => getComputedStyle(el).fontFamily), /Inter/);
            await page.evaluate(() => document.fonts.ready);
            if (width === 390 || width === 1440) await page.screenshot({ path: `.cache/scholarship-me/me-${width}.png`, fullPage: true });
          }
          assert.doesNotMatch(await main.innerText(), /999/, 'legacy aliases must not bypass approved scores');
        }
        assert.doesNotMatch(await page.locator('body').innerText(), /vinh danh|gpa|academicRank|trainingScore|trainingRank|credits|amountVnd|customRawKey/i);
        assert.equal(await page.locator('a[href*="/scholarships/celebrate"]').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${fixture.name} at ${width}px overflows`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
