import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { paintedContrast } from './mobile-design-painted-contrast.mjs';
import { designMeasurements } from './mobile-design-measurements.mjs';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';
import { student, course, event, item } from './mobile-overlay-scenes.mjs';
const engine = process.env.DESIGN_ENGINE || 'chromium',
  audit = process.env.DESIGN_AUDIT === '1';
const out = process.env.DESIGN_OUTPUT || '.cache/task10-design';
const baseline = new Map();
if (audit || process.env.DESIGN_BASELINE_SOURCE === '1') {
  const sha = 'd92dc81c658891cbb0a60a93393dcc7ff41adae5';
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', sha], {
    encoding: 'utf8'
  }).trim().split('\n').filter(p => /^(components|layouts|pages|styles|features)\//.test(p) || p === 'index.css');
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    input: paths.map(p => sha + ':' + p + '\n').join(''),
    maxBuffer: 32 * 1024 * 1024
  });
  let offset = 0;
  for (const path of paths) {
    const end = blobs.indexOf(10, offset);
    const size = Number(blobs.subarray(offset, end).toString().split(' ')[2]);
    assert.ok(Number.isFinite(size));
    offset = end + 1;
    baseline.set(path, blobs.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
}
fs.mkdirSync(out, {
  recursive: true
});
const server = await createServer({
  configFile: false,
  envDir: false,
  plugins: [...(audit || process.env.DESIGN_BASELINE_SOURCE === '1' ? [{
    name: 'pinned-design-baseline',
    enforce: 'pre',
    transform(code, id) {
      const path = id.replaceAll('\\', '/').split('?')[0],
        relative = path.startsWith(process.cwd().replaceAll('\\', '/') + '/') ? path.slice(process.cwd().length + 1) : null;
      return baseline.get(relative);
    }
  }] : []), react()],
  cacheDir: `node_modules/.vite-mobile-design-${engine}-${audit ? 'before' : 'after'}-${process.pid}`,
  optimizeDeps: {
    entries: ['tests/mobile-design-harness.html']
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    hmr: false,
    watch: null
  },
  logLevel: 'error'
});
await server.listen();
// Compile the static fixture graph before WebKit's native resource timeout starts.
await server.warmupRequest('/tests/mobile-design-harness.tsx');
await server.waitForRequestsIdle();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({
  headless: true
}) : chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
}));
const campaign = {
  slug: 'fixture',
  title: 'Học bổng kiểm thử tiếng Việt',
  schoolYear: '2026-2027',
  semester: 'HK1',
  sourceTitle: 'Nguồn kiểm thử',
  sourceUrl: null,
  sourceDocument: 'Fixture only',
  sourceSha256: 'a'.repeat(64),
  publishedAt: '2026-10-23T00:00:00Z',
  approvedFields: ['fullName', 'studentCode', 'awardType'],
  scoreColumns: []
};
const records = [];
test.after(async () => {
  fs.writeFileSync(`${out}/${engine}-${audit ? 'before' : 'after'}-inventory.json`, JSON.stringify(records) + '\n');
  await browser.close();
  await server.close();
});
console.log(`DESIGN_ENGINE=${engine}; VERSION=${browser.version()}; ORIGIN=${base}`);
async function fixture(route, standalone = false, role = 'student', width = 390, height = 844) {
  const context = await browser.newContext({
    ...(width < 768 ? devices['iPhone 13'] : {}),
    viewport: {
      width,
      height
    },
    serviceWorkers: 'block',
    reducedMotion: 'reduce'
  });
  await context.addInitScript(({
    route,
    standalone,
    role
  }) => {
    if (location.pathname.endsWith('mobile-design-harness.html')) history.replaceState({}, '', route + (route.includes('?') ? '&' : '?') + 'role=' + role + (standalone ? '&appPreview=1' : ''));
    if (standalone) Object.defineProperty(navigator, 'standalone', {
      value: true
    });
    localStorage.setItem('push_prompt_dismissed:fixture-user', 'true');
    localStorage.setItem('hub_schedule_board_update_notice_hidden_v1', 'true');
    localStorage.setItem('hub_ai_third_party_consent_fixture-user', 'accepted');
  }, {
    route,
    standalone,
    role
  });
  const errors = [],
    writes = [],
    reads = [];
  await context.route('**/*', async r => {
    const req = r.request(),
      u = new URL(req.url());
    if (u.origin === new URL(base).origin && (!['fetch', 'xhr'].includes(req.resourceType()) || /^\/(tests|node_modules|@vite|@id|@fs|assets)\//.test(u.pathname))) return r.continue();
    reads.push({
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      method: req.method()
    });
    let data = {
      success: true,
      data: [],
      total: 0,
      count: 0,
      candidates: [],
      notifications: [],
      unread_count: 0,
      sessions: [],
      revisions: {},
      rules: [],
      organizers: [],
      event_types: [],
      regions: [],
      filters: {},
      cohorts: [],
      majors: []
    };
    if (req.method() === 'POST' && u.pathname === '/api/private/v1/event-drl/predict') return r.fulfill({
      json: {
        success: true,
        prediction: null
      }
    });
    if (req.method() !== 'GET') {
      const payload = req.postDataJSON?.();
      if (u.pathname === '/api/private/v1/support' && ['list', 'staff', 'messages'].includes(payload?.action)) return r.fulfill({
        json: data
      });
      writes.push({
        url: u.pathname,
        method: req.method()
      });
      return r.fulfill({
        status: 400,
        json: {
          error: 'Unexpected fixture write'
        }
      });
    }
    if (u.pathname.includes('/scholarships/campaigns')) data = {
      campaigns: [campaign],
      total: 1,
      page: 1,
      limit: 50
    };else if (u.pathname.includes('/scholarships/fixture/facets')) data = {
      apiVersion: '1.2.0',
      campaign,
      supportedFilters: [],
      totalRecipients: 1,
      facets: Object.fromEntries(['scholarshipType', 'scholarshipRank', 'major', 'className', 'cohort', 'trainingProgram'].map(key => [key, {
        options: [],
        total: 0,
        page: 1,
        limit: 200
      }]))
    };else if (u.pathname.includes('/scholarships/fixture')) data = {
      campaign,
      recipients: [{
        id: 1,
        fullName: 'Sinh viên học bổng kiểm thử',
        studentCode: '000000000001',
        awardType: 'Khuyến khích học tập',
        scores: {},
        className: 'K42'
      }],
      total: 1,
      page: 1,
      limit: 20
    };else if (u.pathname === '/api/auth/get-session') data = role === 'guest' ? null : {
      session: {
        id: 'fixture-session'
      },
      user: {
        id: 'fixture-user',
        email: student.email,
        name: student.full_name,
        emailVerified: true
      }
    };else if (u.pathname === '/api/private/v1/me') data = {
      userId: 'fixture-user',
      email: student.email,
      role: role === 'student' ? 'user' : role
    };else if (u.pathname === '/api/admin/students/summary') data = {
      success: true,
      total: 0,
      onboarded: 0,
      pending: 0,
      new_last_7_days: 0,
      recent: []
    };else if (u.pathname.endsWith('/profiles/search')) data = {
      data: [{
        id: 'public-fixture',
        student_code: '000000000001',
        full_name: 'Sinh viên kiểm thử có dấu tiếng Việt',
        avatar_url: null,
        class_name: 'Lớp kiểm thử',
        profile_tags: []
      }]
    };else if (u.pathname.includes('profile') && !u.pathname.endsWith('profiles')) data = {
      success: true,
      publicProfile: student,
      privateProfile: {
        data: student.data
      },
      ...student,
      ...student.data,
      data: {
        ...student,
        ...student.data
      },
      profile: student
    };else if (u.searchParams.get('resource') === 'announcements') data = {
      data: Array.from({
        length: Math.min(10, Number(u.searchParams.get('limit') || 10))
      }, (_, i) => ({
        id: i,
        title: 'Thông báo học vụ có đầy đủ dấu tiếng Việt ' + i,
        link: 'https://online.hub.edu.vn/',
        date: '2026-10-23'
      })),
      total: 20
    };else if (u.pathname === '/events' && !u.searchParams.has('resource')) data = {
      ...data,
      data: u.searchParams.get('group') === 'closed' ? [] : [event],
      total: u.searchParams.get('group') === 'closed' ? 0 : 1
    };else if (u.pathname.includes('lost-found')) data = {
      ...data,
      data: [item],
      total: 1
    };else if (u.pathname === '/courses') data = {
      ...data,
      data: [course],
      total: 1,
      hasMore: false,
      subjectNameOptions: [course.subject_name],
      majorOptions: [],
      cohortOptions: [],
      groupNameOptions: [],
      academicProgramOptions: []
    };
    return r.fulfill({
      json: data
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('console', m => {
    if (['error', 'warning'].includes(m.type())) errors.push(m.text());
  });
  console.log(`Loading ${route} ${standalone ? 'PWA' : role}`);
  try {
    await page.goto(base + 'tests/mobile-design-harness.html?' + new URLSearchParams({
      route,
      role,
      ...(standalone ? {
        appPreview: '1'
      } : {})
    }), {
      waitUntil: 'networkidle',
      timeout: 120000
    });
    console.log(`Navigated ${route}`);
    await page.locator('#mode').waitFor({
      state: 'attached'
    }).catch(async e => {
      console.error(JSON.stringify({
        errors,
        writes,
        body: await page.locator('body').innerText()
      }));
      await context.close();
      throw e;
    });
    console.log(`Mode ${route}`);
    await page.evaluate(async () => {
      await document.fonts.load('16px Inter', 'Đặng Nguyễn kết quả học tập');
      await document.fonts.ready;
    });
    console.log(`Fonts ${route}`);
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'
    });
    await page.waitForTimeout(1800);
    if (standalone && width < 768 && route !== '/scholarships') {
      const hint = page.locator('.mobile-ai-bubble button');
      if (await hint.isVisible()) {
        const box = await hint.boundingBox();
        if (!audit) assert.ok(box.width >= 44 && box.height >= 44);
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        assert.ok(await hint.evaluate((e, {
          x,
          y
        }) => e.contains(document.elementFromPoint(x, y)), {
          x,
          y
        }), 'AI hint close owns its touch point');
        await page.touchscreen.tap(x, y);
        await hint.waitFor({
          state: 'hidden',
          timeout: 2000
        });
      }
    }
    console.log(`Rendered ${route}`);
    return {
      context,
      page,
      errors,
      writes,
      reads
    };
  } catch (error) {
    console.error(`Fixture ${route}: ${error.message}`);
    console.error(JSON.stringify({
      errors,
      writes,
      url: page.url()
    }));
    await context.close();
    throw error;
  }
}
async function captureFontSnapshot(page) {
  await page.evaluate(() => {
    window.__task10FontSnapshot = [...document.querySelectorAll('#root *')].filter(e => e instanceof HTMLElement).map(e => ({
      e,
      size: parseFloat(getComputedStyle(e).fontSize),
      style: e.getAttribute('style')
    }));
  });
}
async function applyTextMode(page, mode) {
  await page.evaluate(mode => {
    for (const {
      e,
      style
    } of window.__task10FontSnapshot) {
      if (style === null) e.removeAttribute('style');else e.setAttribute('style', style);
    }
    if (!window.__task10TextStyle) {
      window.__task10TextStyle = document.createElement('style');
      document.head.append(window.__task10TextStyle);
    }
    window.__task10TextStyle.textContent = mode === 'text200' ? 'html{font-size:28px!important}' : mode === 'textSpacing' ? 'html{font-size:14px!important}#root *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}#root p{margin-bottom:2em!important}' : 'html{font-size:14px!important}';
  }, mode);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (mode === 'text200') await page.evaluate(() => {
    for (const {
      e,
      size
    } of window.__task10FontSnapshot) {
      if (parseFloat(getComputedStyle(e).fontSize) < size * 2 - .1) e.style.setProperty('font-size', `${size * 2}px`, 'important');
    }
  });
  await page.evaluate(() => {
    void document.body.offsetHeight;
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function measureRouteStress(f, route, pwa, role) {
  await f.page.setViewportSize({
    width: 320,
    height: 568
  });
  await captureFontSnapshot(f.page);
  for (const mode of ['normal', 'text200', 'textSpacing']) {
    await applyTextMode(f.page, mode);
    await f.page.waitForFunction(() => {
      const nav = document.querySelector('.mobile-bottom-nav'),
        ai = document.querySelector('.mobile-ai-advisor');
      return !nav || !ai || ai.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top;
    }, null, {
      timeout: 3000
    });
    const m = await f.page.evaluate(designMeasurements);
    await paintedContrast(f.page, m);
    records.push({
      route,
      pwa,
      role,
      scenario: 'route-reflow',
      mode,
      ...m,
      errors: [...f.errors],
      writes: [...f.writes]
    });
    fs.writeFileSync(`${out}/progress.json`, JSON.stringify(records.map(({
      route,
      pwa,
      role,
      scenario,
      mode,
      viewport,
      overflow
    }) => ({
      route,
      pwa,
      role,
      scenario,
      mode,
      viewport,
      overflow
    }))));
    fs.writeFileSync(`${out}/last-stress.json`, JSON.stringify(m));
    if (process.env.DESIGN_DEBUG === '1') {
      fs.writeFileSync(`${out}/stress-${route.replaceAll(/[^a-z0-9]/gi, '_')}-${role}-${mode}.json`, JSON.stringify(m, null, 2));
      await f.page.screenshot({
        path: `${out}/stress-${route.replaceAll(/[^a-z0-9]/gi, '_')}-${role}-${mode}.png`,
        scale: 'css'
      });
    }
    assert.equal(m.overflow, false, `${route} ${mode}: internal/page reflow`);
    assertDesign(m);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  }
}
const routes = [['/profiles/search?q=fixture', false], ['/profiles/search?q=fixture', true], ['/scholarships', false], ['/dashboard', false], ['/schedule', false], ['/events', false], ['/lost-found', false], ['/handbook/contacts', false], ['/handbook/feedback', false], ['/support/new', false], ['/profile/000000000001', false], ['/support', false], ['/handbook/scholarships', false], ['/mobile-home', true], ['/learning', true], ['/learning?tab=schedule', true], ['/events', true], ['/lost-found', true], ['/profile/000000000001', true], ['/handbook/contacts', true], ['/handbook/feedback', true], ['/dashboard', false, 'admin'], ['/dashboard', false, 'auditor'], ['/events', false, 'admin'], ['/events', false, 'auditor'], ['/admin/support', false, 'admin'], ['/admin/support', false, 'auditor'], ['/dashboard', false, 'guest'], ['/events', false, 'guest'], ['/support', false, 'guest'], ['/mobile-home', true, 'guest']];
for (const [route, pwa, role = 'student'] of (process.env.DESIGN_MATRIX_ONLY === '1' ? [] : routes).filter(r => !process.env.DESIGN_ROUTE || r[0].includes(process.env.DESIGN_ROUTE))) test(`${engine} ${audit ? 'audit' : 'accept'} ${route} ${pwa ? 'PWA' : 'browser'} ${role}`, {
  timeout: 180000
}, async () => {
  const f = await fixture(route, pwa, role);
  try {
    const m = await f.page.evaluate(designMeasurements);
    await paintedContrast(f.page, m, true, process.env.DESIGN_DEEP_CONTRAST === '1');
    fs.writeFileSync(`${out}/last-measurement.json`, JSON.stringify(m, null, 2));
    records.push({
      route,
      pwa,
      role,
      ...m,
      errors: f.errors,
      writes: f.writes,
      reads: f.reads,
      url: f.page.url()
    });
    await f.page.screenshot({
      path: `${out}/${engine}-${audit ? 'before' : 'after'}-${route.replaceAll('/', '_').replaceAll('?', '_').replaceAll('=', '_')}-${pwa ? 'pwa-' : ''}${role}.png`,
      fullPage: false,
      scale: 'css'
    });
    assert.equal(m.text.length > 0, true);
    console.log('URL=' + f.page.url());
    assert.equal(new URL(f.page.url()).pathname, route.split('?')[0], 'Actual requested route rendered');
    if (!audit) {
      assert.equal(m.overflow, false);
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
      assertDesign(m);
      if (process.env.DESIGN_NORMAL_ONLY !== '1') await measureRouteStress(f, route, pwa, role);
    }
  } catch (error) {
    console.error(error.message);
    throw error;
  } finally {
    await f.context.close();
  }
});
const viewports = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [667, 375]];
if (process.env.DESIGN_MATRIX !== '0') for (const [width, height] of viewports) for (const [route, pwa] of width < 768 ? [['/dashboard', false], ['/mobile-home', true]] : [['/dashboard', false]]) test(`${engine} design matrix ${width}x${height} ${pwa ? 'PWA' : 'browser'}`, {
  timeout: 180000
}, async () => {
  const f = await fixture(pwa && width >= 768 ? '/dashboard' : route, pwa && width < 768, 'student', width, height);
  try {
    await f.page.evaluate(() => {
      window.__task10FontSnapshot = [...document.querySelectorAll('#root *')].filter(e => e instanceof HTMLElement).map(e => ({
        e,
        size: parseFloat(getComputedStyle(e).fontSize),
        style: e.getAttribute('style')
      }));
    });
    for (const mode of audit ? ['normal'] : ['normal', 'text200', 'textSpacing']) {
      await f.page.evaluate(() => {
        for (const {
          e,
          style
        } of window.__task10FontSnapshot) {
          if (style === null) e.removeAttribute('style');else e.setAttribute('style', style);
        }
      });
      await f.page.addStyleTag({
        content: mode === 'text200' ? 'html{font-size:28px!important}' : mode === 'textSpacing' ? 'html{font-size:14px!important}#root *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}#root p{margin-bottom:2em!important}' : 'html{font-size:14px!important}'
      });
      await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (!audit && width < 768) await f.page.waitForFunction(expected => Math.abs(parseFloat(getComputedStyle(document.querySelector('.ui-page-title')).fontSize) - expected) < .05, mode === 'text200' ? 52 : 26, {
        timeout: 5000
      });
      if (mode === 'text200') await f.page.evaluate(() => {
        for (const {
          e,
          size
        } of window.__task10FontSnapshot) {
          if (parseFloat(getComputedStyle(e).fontSize) < size * 2 - .1) e.style.setProperty('font-size', `${size * 2}px`, 'important');
        }
      });
      await f.page.evaluate(() => {
        void document.body.offsetHeight;
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const m = await f.page.evaluate(designMeasurements);
      await paintedContrast(f.page, m);
      if (pwa && width < 768) {
        const ownership = await f.page.locator('.mobile-bottom-nav__tab').evaluateAll(links => links.map(e => {
          const r = e.getBoundingClientRect();
          return {
            name: e.textContent.trim(),
            width: r.width,
            height: r.height,
            owns: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
          };
        }));
        assert.ok(ownership.every(t => t.owns && t.width >= 44 && t.height >= 44), JSON.stringify(ownership));
        m.navOwnership = ownership;
      }
      records.push({
        route,
        pwa,
        width,
        height,
        mode,
        ...m,
        errors: [...f.errors],
        writes: [...f.writes]
      });
      fs.writeFileSync(`${out}/progress.json`, JSON.stringify(records.map(({
        route,
        pwa,
        role,
        scenario,
        mode,
        viewport,
        overflow
      }) => ({
        route,
        pwa,
        role,
        scenario,
        mode,
        viewport,
        overflow
      }))));
      fs.writeFileSync(`${out}/last-stress.json`, JSON.stringify(m));
      if (mode === 'normal' || width === 320 || process.env.DESIGN_DEBUG === '1') await f.page.screenshot({
        path: `${out}/${engine}-${audit ? 'before' : 'after'}-${width}-${pwa ? 'pwa' : 'browser'}-${mode}.png`,
        scale: 'css'
      });
      if (!audit) {
        assertDesign(m);
        assert.equal(m.overflow, false, `${width} ${pwa} ${mode}: page overflow`);
        assert.deepEqual(f.errors, []);
        assert.deepEqual(f.writes, []);
      }
    }
  } catch (error) {
    console.error(error.message);
    throw error;
  } finally {
    await f.context.close();
  }
});
async function checkFieldContrast(field) {
  const previousBorder = await field.evaluate(e => getComputedStyle(e).borderTopColor);
  await field.focus();
  const proof = await field.evaluate(e => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    const rgba = value => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
    };
    const over = (f, b) => [...f.slice(0, 3).map((v, i) => v * f[3] + b[i] * (1 - f[3])), 1];
    const background = element => {
      const layers = [];
      for (let a = element; a; a = a.parentElement) {
        const c = getComputedStyle(a),
          v = rgba(c.backgroundColor);
        if (c.backgroundImage !== 'none' && v[3] < 1) throw new Error('Unresolved field background');
        layers.push(v);
        if (v[3] === 1) return layers.reverse().reduce((b, f) => over(f, b));
      }
      throw new Error('No opaque field canvas');
    };
    const lum = c => c.slice(0, 3).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const c = getComputedStyle(e),
      p = getComputedStyle(e, '::placeholder'),
      bg = background(e),
      parent = background(e.parentElement),
      placeholder = rgba(p.color);
    placeholder[3] *= Number(p.opacity);
    return {
      name: e.getAttribute('aria-label') || e.placeholder,
      font: parseFloat(c.fontSize),
      foreground: c.color,
      background: bg,
      placeholder: p.color,
      textContrast: ratio(over(rgba(c.color), bg), bg),
      placeholderContrast: e.placeholder ? ratio(over(placeholder, bg), bg) : null,
      borderColour: c.borderTopColor,
      borderContrast: parseFloat(c.borderTopWidth) > 0 ? ratio(over(rgba(c.borderTopColor), bg), bg) : null,
      outline: c.outlineStyle,
      outlineWidth: c.outlineWidth,
      outlineContrast: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? ratio(over(rgba(c.outlineColor), parent), parent) : null
    };
  });
  records.push({
    scenario: 'focused field contrast',
    ...proof
  });
  assert.ok(proof.outlineContrast !== null || proof.borderContrast >= 3 && proof.borderColour !== previousBorder, JSON.stringify(proof));
  assert.ok(proof.textContrast >= 4.5, JSON.stringify(proof));
  if (proof.placeholderContrast !== null) assert.ok(proof.placeholderContrast >= 4.5, JSON.stringify(proof));
  if (proof.borderContrast !== null) assert.ok(proof.borderContrast >= 3, JSON.stringify(proof));
  if (proof.outlineContrast !== null) assert.ok(proof.outlineContrast >= 3, JSON.stringify(proof));
}
function assertDesign(m) {
  if (m.viewport[0] >= 768) return;
  for (let i = 0; i < (m.floatingControls || []).length; i++) for (let j = i + 1; j < m.floatingControls.length; j++) {
    const a = m.floatingControls[i],
      b = m.floatingControls[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'PWA floating controls have independent hit areas');
  }
  for (const r of m.regions || []) {
    if (r.classes.split(' ').includes('ui-card-space') || r.classes.split(' ').includes('ui-home-card')) assert.ok(r.padding.every(p => Math.abs(p - 16) < .1), 'Card padding token: ' + r.classes);
    if (r.classes.split(' ').includes('ui-page-gutter')) assert.ok(Math.abs(r.padding[1] - 16) < .1 && Math.abs(r.padding[3] - 16) < .1, 'Page gutter token: ' + r.classes);
  }
  if (m.shellHeader?.fixed && m.scroll.y <= 1) assert.ok(m.shellHeader.content.y >= m.shellHeader.header.y + m.shellHeader.header.height - 1, 'Main content clears the measured fixed header');
  const sizes = {
    'page-title': 26,
    'section-title': 18,
    'card-title': 16,
    body: 16,
    secondary: 14,
    action: 14,
    meta: 12,
    input: 16
  };
  for (const t of m.text.filter(t => t.role)) {
    assert.ok(Math.abs(t.size - sizes[t.role] * m.rootFont / 14) < .1, `${t.role}: ${t.text.slice(0, 50)} computed ${t.size} expected ${sizes[t.role] * m.rootFont / 14}`);
    assert.ok(t.font.includes('Inter'), `Inter: ${t.text}`);
    assert.ok(t.line >= t.size * 1.29, `Vietnamese line height: ${t.text}`);
    assert.deepEqual(t.clipping, [], `Clipping: ${t.tag} ${t.text.slice(0, 70)}`);
  }
  for (const t of m.targets.filter(t => (t.role === 'action' || t.tag === 'BUTTON') && !t.disabled)) assert.ok(t.width >= 43.9 && t.height >= 43.9, `Touch target ${t.name}: ${t.width}x${t.height}`);
  for (const t of m.targets.filter(t => t.role === 'input')) assert.ok(t.font >= 15.99, `Input font: ${t.name} ${t.font}`);
  for (const t of m.targets.filter(t => ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tag) && !['checkbox', 'radio', 'hidden'].includes(t.type) && !t.disabled)) assert.ok(t.font >= 15.99, JSON.stringify(t));
  assert.ok(m.interLoaded, 'Inter font loaded');
  const failures = m.text.filter(t => t.contrast.status === 'FAIL' && !/^[•·|—–\-:]$/.test(t.text));
  assert.deepEqual(failures.map(t => ({
    text: t.text,
    ratio: t.contrast.ratio,
    classes: t.classes
  })), [], 'Resolved text contrast');
}
if (!audit && process.env.DESIGN_MATRIX_ONLY !== '1') {
  test(`${engine} real announcement and contribution forms: keyboard viewport, focus and scroll`, {
    timeout: 180000
  }, async () => {
    const f = await fixture('/dashboard', false, 'student', 375, 667),
      {
        page
      } = f;
    try {
      await page.evaluate(() => {
        window.__scrollCalls = [];
        const old = window.scrollTo.bind(window);
        window.scrollTo = (...args) => {
          old(...args);
          window.__scrollCalls.push({
            args,
            x: scrollX,
            y: scrollY,
            height: document.documentElement.scrollHeight,
            stack: new Error().stack
          });
        };
      });
      const opener = page.getByRole('button', {
        name: 'Xem tất cả',
        exact: true
      });
      await opener.evaluate(e => e.scrollIntoView({
        block: 'center'
      }));
      await opener.focus({
        preventScroll: true
      });
      await opener.hover();
      const hovered = await page.evaluate(designMeasurements);
      const hoveredIndex = Number(await opener.getAttribute('data-design-measure-id'));
      await paintedContrast(page, hovered);
      const hoverProof = hovered.text.find(t => t.index === hoveredIndex);
      assert.equal(hoverProof.contrast.status, 'PASS', JSON.stringify(hoverProof));
      records.push({
        scenario: 'hovered action contrast',
        name: 'Xem tất cả',
        ...hoverProof
      });
      const before = await page.evaluate(() => ({
        x: scrollX,
        y: scrollY
      }));
      await opener.click();
      records.push({
        scenario: 'announcement lock acquired',
        before,
        locked: await page.evaluate(() => ({
          x: scrollX,
          y: scrollY,
          top: document.body.style.top,
          position: document.body.style.position
        }))
      });
      const modal = page.getByRole('dialog', {
        name: 'Tra cứu link thông báo'
      });
      await modal.waitFor();
      await checkFieldContrast(modal.getByRole('searchbox'));
      await modal.getByRole('searchbox').fill('học vụ');
      await page.setViewportSize({
        width: 390,
        height: 240
      });
      await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('[data-overlay-root]').style.getPropertyValue('--overlay-height')) - 240) < 1);
      const geometry = await modal.evaluate(e => {
        const r = e.getBoundingClientRect(),
          close = e.querySelector('[aria-label="Đóng tra cứu thông báo"]').getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          height: innerHeight,
          close: {
            x: close.x,
            y: close.y,
            width: close.width,
            height: close.height
          }
        };
      });
      assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.height + 1);
      assert.ok(geometry.close.width >= 44 && geometry.close.height >= 44);
      assert.equal(await page.getByRole('button', {
        name: 'Mở trợ lý AI',
        exact: true
      }).isVisible(), false, 'Closed AI launcher yields to the active modal');
      const hits = await modal.locator('button:not(:disabled),input').evaluateAll(es => es.filter(e => e.getBoundingClientRect().height > 0).map(e => {
        const r = e.getBoundingClientRect();
        return {
          name: e.getAttribute('aria-label') || e.textContent.trim(),
          owns: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
        };
      }));
      assert.ok(hits.every(h => h.owns), JSON.stringify(hits));
      records.push({
        scenario: 'modal control hit testing',
        hits
      });
      await page.screenshot({
        path: `${out}/${engine}-announcement-keyboard.png`,
        scale: 'css'
      });
      await page.setViewportSize({
        width: 375,
        height: 667
      });
      await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('[data-overlay-root]').style.getPropertyValue('--overlay-height')) - 667) < 1);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.press('Escape');
      await modal.waitFor({
        state: 'hidden'
      });
      assert.equal(await opener.evaluate(e => document.activeElement === e), true);
      records.push({
        scenario: 'announcement after resize close',
        before,
        after: await page.evaluate(() => ({
          x: scrollX,
          y: scrollY,
          body: document.body.getAttribute('style'),
          html: document.documentElement.getAttribute('style'),
          height: document.documentElement.scrollHeight,
          calls: window.__scrollCalls,
          roots: [...document.querySelectorAll('[data-overlay-scroll-root]')].map(e => ({
            height: e.scrollHeight,
            client: e.clientHeight,
            style: e.getAttribute('style')
          }))
        }))
      });
      await page.waitForFunction(({
        x,
        y
      }) => scrollX === x && scrollY === y, before);
      assert.deepEqual(await page.evaluate(() => ({
        x: scrollX,
        y: scrollY
      })), before);
      await page.getByRole('button', {
        name: 'Mở menu',
        exact: true
      }).click();
      await page.getByRole('dialog', {
        name: 'Menu điều hướng'
      }).getByRole('link', {
        name: 'Sự kiện ĐRL',
        exact: true
      }).click();
      await page.getByRole('dialog', {
        name: 'Menu điều hướng'
      }).waitFor({
        state: 'hidden'
      });
      await page.waitForFunction(() => document.body.style.position !== 'fixed');
      const ai = page.locator('.mobile-ai-advisor');
      const aiBox = await ai.boundingBox();
      assert.ok(aiBox.height <= 62 && aiBox.width <= 62, 'AI hit surface stays bounded after keyboard resize');
      const actions = page.getByRole('button', {
        name: 'Thao tác sự kiện',
        exact: true
      });
      await actions.evaluate(e => e.scrollIntoView({
        block: 'center',
        behavior: 'instant'
      }));
      await actions.click();
      await page.getByRole('button', {
        name: 'Gửi đóng góp',
        exact: true
      }).click();
      const contribution = page.getByRole('dialog', {
        name: 'Đóng góp Sự kiện mới'
      });
      await contribution.waitFor();
      assert.equal(await page.getByRole('button', {
        name: 'Mở trợ lý AI',
        exact: true
      }).isVisible(), false);
      const input = contribution.getByPlaceholder('VD: Cuộc thi Tiếng Anh Star Awards...');
      await checkFieldContrast(input);
      await input.fill('Kiểm thử dấu tiếng Việt');
      for (const size of [{
        width: 390,
        height: 240
      }, {
        width: 667,
        height: 375
      }, {
        width: 375,
        height: 667
      }]) {
        await page.setViewportSize(size);
        await input.focus();
        assert.equal(await input.inputValue(), 'Kiểm thử dấu tiếng Việt');
        assert.ok(await input.evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
        const close = contribution.getByRole('button', {
          name: 'Đóng đóng góp sự kiện'
        });
        await close.scrollIntoViewIfNeeded();
        const box = await close.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44 && box.y >= 0 && box.y + box.height <= size.height + 1);
      }
      await page.screenshot({
        path: `${out}/${engine}-contribution-form.png`,
        scale: 'css'
      });
      records.push({
        scenario: 'keyboard/forms',
        geometry,
        reads: f.reads,
        errors: f.errors,
        writes: f.writes
      });
      await contribution.getByRole('button', {
        name: 'Đóng đóng góp sự kiện'
      }).click();
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
    } finally {
      await f.context.close();
    }
  });
  test(`${engine} PWA bottom navigation, final content and touch ownership`, {
    timeout: 120000
  }, async () => {
    const f = await fixture('/mobile-home', true, 'student', 320, 568),
      {
        page
      } = f;
    try {
      const nav = page.locator('.mobile-bottom-nav');
      for (const text of ['Học tập', 'Sự kiện', 'Tìm đồ', 'Trang chủ']) {
        await nav.getByRole('link', {
          name: text,
          exact: true
        }).click();
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#mode').textContent(), 'standalone');
      }
      await page.locator('.mobile-main').evaluate(e => e.scrollTo(0, e.scrollHeight));
      await page.waitForTimeout(100);
      const end = await page.locator('.mobile-main footer').evaluate(e => {
        const r = e.getBoundingClientRect(),
          nav = document.querySelector('.mobile-bottom-nav').getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(e);
        const text = range.getBoundingClientRect();
        return {
          textBottom: text.bottom,
          navTop: nav.top,
          paddingBottom: getComputedStyle(e).paddingBottom
        };
      });
      assert.ok(end.textBottom <= end.navTop, JSON.stringify(end));
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
      }
      records.push({
        scenario: 'PWA navigation/end clearance',
        ...end,
        errors: f.errors,
        writes: f.writes
      });
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
    } finally {
      await f.context.close();
    }
  });
}
if (!audit && process.env.DESIGN_MATRIX_ONLY !== '1') test(`${engine} actual PWA AI and Ticket controls: input size, touch, draft and scroll`, {
  timeout: 180000
}, async () => {
  const f = await fixture('/mobile-home', true, 'student', 375, 667),
    {
      page
    } = f;
  try {
    await page.getByRole('button', {
      name: 'Mở trợ lý AI',
      exact: true
    }).click();
    const prompt = page.getByPlaceholder('Hỏi AI tại đây...');
    await prompt.waitFor({
      state: 'visible'
    });
    assert.ok(await prompt.evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
    await checkFieldContrast(prompt);
    await prompt.fill('Kiểm thử bản nháp, không gửi');
    await page.getByRole('button', {
      name: 'Đóng trợ lý AI',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Mở trợ lý AI',
      exact: true
    }).click();
    assert.equal(await prompt.inputValue(), 'Kiểm thử bản nháp, không gửi');
    await page.getByRole('button', {
      name: 'Đóng trợ lý AI',
      exact: true
    }).click();
    const before = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      main: document.querySelector('.mobile-main').scrollTop
    }));
    await page.getByRole('button', {
      name: 'Mở hỗ trợ',
      exact: true
    }).click();
    const panel = page.locator('.ui-support-panel');
    await panel.waitFor();
    assert.equal(await page.getByRole('button', {
      name: 'Mở trợ lý AI',
      exact: true
    }).isVisible(), false);
    await panel.getByRole('button', {
      name: 'Tạo yêu cầu hỗ trợ',
      exact: true
    }).click();
    const fields = panel.locator('input:not([type=file]):not([type=hidden]),textarea,select');
    await fields.first().waitFor();
    const fonts = await fields.evaluateAll(es => es.filter(e => e.getBoundingClientRect().height > 0).map(e => ({
      tag: e.tagName,
      font: parseFloat(getComputedStyle(e).fontSize),
      type: e.type
    })));
    assert.ok(fonts.length >= 3);
    assert.ok(fonts.every(e => e.font >= 16), JSON.stringify(fonts));
    await checkFieldContrast(panel.getByRole('textbox').first());
    await panel.getByRole('textbox').first().fill('Kiểm thử Ticket, không gửi');
    const close = panel.getByRole('button', {
        name: 'Đóng hỗ trợ',
        exact: true
      }),
      box = await close.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    await page.screenshot({
      path: `${out}/${engine}-pwa-ticket-form.png`,
      scale: 'css'
    });
    await close.click();
    await panel.waitFor({
      state: 'hidden'
    });
    assert.deepEqual(await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      main: document.querySelector('.mobile-main').scrollTop
    })), before);
    assert.equal(await page.getByRole('button', {
      name: 'Mở trợ lý AI',
      exact: true
    }).isVisible(), true);
    await page.getByRole('button', {
      name: 'Mở trợ lý AI',
      exact: true
    }).click();
    assert.equal(await prompt.inputValue(), 'Kiểm thử bản nháp, không gửi', 'Other overlays preserve the existing AI draft');
    await page.getByRole('button', {
      name: 'Đóng trợ lý AI',
      exact: true
    }).click();
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
    records.push({
      scenario: 'PWA AI/Ticket controls',
      fonts,
      close: box,
      scroll: before,
      errors: f.errors,
      writes: f.writes
    });
  } finally {
    await f.context.close();
  }
});
if (!audit && process.env.DESIGN_MATRIX_ONLY !== '1') test(`${engine} GPA target input and readable contextual tip preserve value`, {
  timeout: 180000
}, async () => {
  const f = await fixture('/dashboard', false, 'student', 375, 667),
    p = f.page;
  try {
    const input = p.getByRole('spinbutton', {
        name: 'GPA mục tiêu',
        exact: true
      }),
      value = await input.inputValue();
    for (const size of [{
      width: 375,
      height: 667
    }, {
      width: 320,
      height: 568
    }]) {
      await p.setViewportSize(size);
      await input.scrollIntoViewIfNeeded();
      // Escape retains focus; a new focus interaction starts after an explicit blur.
      await input.blur();
      await input.focus();
      const tip = p.getByRole('tooltip');
      await tip.waitFor();
      const visibleTip = await tip.boundingBox();
      assert.ok(visibleTip.y >= 0 && visibleTip.y + visibleTip.height <= size.height + 1, JSON.stringify(visibleTip));
      assert.ok(await input.evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
      assert.equal(await input.inputValue(), value);
      const close = tip.getByRole('button', {
          name: 'Đóng mẹo',
          exact: true
        }),
        box = await close.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await p.getByRole('button', {
        name: 'Mở trợ lý AI',
        exact: true
      }).isVisible(), false);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await p.screenshot({
        path: `${out}/${engine}-gpa-tip-${size.width}.png`,
        scale: 'css'
      });
      await p.keyboard.press('Escape');
      await tip.waitFor({
        state: 'hidden'
      });
      assert.equal(await input.evaluate(e => document.activeElement === e), true);
    }
    await p.screenshot({
      path: `${out}/${engine}-gpa-target.png`,
      scale: 'css'
    });
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
    records.push({
      scenario: 'GPA target field',
      value,
      font: await input.evaluate(e => getComputedStyle(e).fontSize)
    });
  } finally {
    await f.context.close();
  }
});
