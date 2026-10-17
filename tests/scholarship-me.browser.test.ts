import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import {eligibilityMapping} from '../shared/scholarship-eligibility.ts';

test('My Scholarships actual browser: approved Vietnamese details, no celebration CTA, auth states and responsive layout', { timeout: 180000 }, async () => {
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath, 'Chrome is required for browser acceptance');
  // Stub only the role hook; render the real page, shell, API client and built CSS.
  const bundled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import {ScholarshipMe} from './features/scholarships/ScholarshipMe'; import {AdminScholarships} from './features/scholarships/AdminScholarships'; createRoot(document.getElementById('root')).render(<BrowserRouter>{location.pathname.startsWith('/admin')?<AdminScholarships/>:<ScholarshipMe/>}</BrowserRouter>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic', outdir: '.cache/scholarship-me/browser-bundle',
    plugins: [{ name: 'synthetic-role-only', setup(builder) {
      builder.onResolve({ filter: /hooks\/useUserRole$/ }, () => ({ path: 'synthetic-role', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const session = new URLSearchParams(location.search).get('case') === 'anonymous' ? null : {user:{email:'000000000001@st.buh.edu.vn',user_metadata:{full_name:'Sinh viên kiểm thử'}}}; export function useUserRole(){return {session,isAdmin:location.pathname.startsWith('/admin'),loading:false,bootstrapUnavailable:false};}` }));
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
    else if (path === '/scholarships/me' || path === '/admin/scholarships') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>'); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const award = { id: 1, fullName: 'Sinh viên kiểm thử', studentCode: '000000000001', awardType: 'Xuất sắc', className: 'TEST-A1', major: 'Kế toán', campaignSlug: 'synthetic-1', campaignTitle: 'Đợt học bổng kiểm thử 1', semester: '2', schoolYear: '2025–2026', gpa: 999, trainingScore: 999, scores: {} };
  const cases = [
    { name: 'one', awards: [{ ...award, sourceListKind:'eligibility', cohort:'K24', scholarshipRank:'Xuất sắc', trainingProgram:'Chương trình kiểm thử A', rankings:{topSchoolPercent:0.0125,topSchool:12,topMajor:3,topCohort:4,topClass:1}, scores: { gpa: 3.6, trainingScore: 100, credits: 17, amountVnd: 13926000, customRawKey: 'hidden' } }] },
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
          const cards = main.locator('.scholarship-personal-card');
          assert.equal(await main.locator('dl:visible').count(),0,'details start collapsed');
          for(let index=0;index<fixture.awards.length;index++) {
            const toggle=cards.nth(index).getByRole('button',{name:'Xem thêm',exact:true});
            assert.equal(await toggle.getAttribute('aria-expanded'),'false');
            await toggle.focus(); await page.keyboard.press('Enter');
            assert.equal(await cards.nth(index).getByRole('button',{name:'Thu gọn',exact:true}).getAttribute('aria-expanded'),'true');
            if(index===0 && fixture.awards.length>1) assert.equal(await cards.nth(1).getByRole('button',{name:'Xem thêm',exact:true}).getAttribute('aria-expanded'),'false');
          }
          assert.equal(await main.getByText('Thành tiền:', { exact: true }).count(), ['one', 'many', 'amount-only'].includes(fixture.name) ? 1 : 0);
          assert.equal(await main.locator('dl:visible').count(),fixture.awards.length);
          if (fixture.name === 'one') {
            for (const expected of ['Điểm TB HB: 3.6', 'Điểm RL: 100', 'Số TC: 17', 'Thành tiền: 13.926.000đ']) assert.ok((await main.innerText()).includes(expected), expected);
            assert.equal(await main.locator('.scholarship-rank-grid > div').count(),3);
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({path:`.cache/scholarship-me/me-default-${width}.png`,fullPage:true});
            await main.getByRole('button',{name:'Tùy chỉnh',exact:true}).click();
            await main.getByRole('checkbox',{name:'Tỷ lệ top trường',exact:true}).check();
            assert.ok((await main.innerText()).includes('1,25%'));
            await main.getByRole('checkbox',{name:'Top ngành',exact:true}).uncheck();
            const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('hub-scholarship-ranking-ui-v1')!));
            assert.deepEqual(stored,['topSchool','topClass','topSchoolPercent']);
            await main.getByRole('button',{name:'Tùy chỉnh',exact:true}).click();
            assert.match(await main.evaluate(el => getComputedStyle(el).fontFamily), /Inter/);
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({ path: `.cache/scholarship-me/me-${width}.png`, fullPage: true });
            await main.getByRole('button',{name:'Thu gọn',exact:true}).click();
            assert.equal(await main.locator('dl:visible').count(),0);
            await main.getByRole('button',{name:'Xem thêm',exact:true}).click();
          }
          if(fixture.name==='many') {
            await main.getByRole('button',{name:'Làm mới xác minh',exact:true}).click();
            await main.getByRole('heading',{name:'Chi tiết học bổng (2)',exact:true}).waitFor();
            assert.equal(await main.locator('dl:visible').count(),2,'refresh preserves independent card expansion');
          }
          assert.doesNotMatch(await main.innerText(), /999/, 'legacy aliases must not bypass approved scores');
        }
        assert.doesNotMatch(await page.locator('body').innerText(), /vinh danh|gpa|academicRank|trainingScore|trainingRank|credits|amountVnd|customRawKey/i);
        assert.equal(await page.locator('a[href*="/scholarships/celebrate"]').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${fixture.name} at ${width}px overflows`);
      }
      assert.deepEqual(errors, []);
      if(width===390 || width===1440) {
        const campaign={slug:'synthetic-approval',title:'Đợt xét kiểm thử',semester:'HK2',schoolYear:'2026',status:'validated',revision:1,candidateBatchId:'c'.repeat(64),activeBatchId:null};
        let submitted:any=null;
        page.on('dialog',dialog=>dialog.dismiss());
        await page.unrouteAll();
        await page.route('**/*',async route=>{
          const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
          if(!url.pathname.startsWith('/api/'))return route.continue();
          if(url.pathname.endsWith('/approve')) {
            submitted=route.request().postDataJSON();return route.fulfill({json:{campaign:{...campaign,status:'approved',revision:2}}});
          }
          if(url.pathname.endsWith('/rows')) return route.fulfill({json:{receipt:{batchId:campaign.candidateBatchId,sourceSha256:'c'.repeat(64),sourceListKind:'eligibility',expectedRows:1,acceptedRows:1,rejectedRows:0,status:'applied'},mapping:eligibilityMapping,rows:[],total:1,page:1,limit:1}});
          if(url.pathname.endsWith('/campaigns'))return route.fulfill({json:{campaigns:[campaign],total:1,page:1,limit:20}});
          if(url.pathname.endsWith('/synthetic-approval'))return route.fulfill({json:{campaign}});
          return route.fulfill({status:404,json:{error:'SYNTHETIC_TEST_UNEXPECTED_ENDPOINT'}});
        });
        await page.goto(origin+'/admin/scholarships');
        await page.getByRole('button',{name:'Phê duyệt trường công khai',exact:true}).click();
        const own=page.getByRole('group',{name:'Các trường cho phép chính chủ đã xác thực xem',exact:true});
        await own.getByRole('checkbox',{name:'Top trường',exact:true}).waitFor();
        assert.equal(await own.locator('input:checked').count(),0,'own access starts unchecked');
        await own.getByRole('checkbox',{name:'Top trường',exact:true}).check();
        await own.getByRole('checkbox',{name:'Chương trình đào tạo',exact:true}).check();
        const save=page.getByRole('button',{name:'Lưu phê duyệt',exact:true});assert.equal(await save.isDisabled(),true);
        await page.getByLabel('Tên tài liệu nguồn',{exact:true}).fill('Nguồn xét kiểm thử');
        await page.getByLabel('Số hiệu văn bản',{exact:true}).fill('SYNTHETIC ONLY');
        await page.getByRole('checkbox',{name:/Tôi xác nhận đã kiểm tra văn bản gốc/}).check();
        assert.equal(await save.isDisabled(),true,'public approval does not implicitly grant own access');
        await own.getByRole('checkbox',{name:/Tôi đã xác minh căn cứ/}).check();
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/campaigns')&&response.status()===200);
        await save.click();await refreshed;
        assert.deepEqual(submitted.ownFields,['rankings.topSchool','trainingProgram']);assert.equal(submitted.ownAccessConfirmed,true);
        assert.deepEqual(submitted.approvedFields,['fullName','studentCode','awardType']);
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
