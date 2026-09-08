import assert from 'node:assert/strict';
import test from 'node:test';
import { crawlAnnouncementSourceChunk, crawlAnnouncementSources, parseAnnouncementPage } from '../cloudflare/worker/src/announcement-crawler.ts';

const source = 'https://phongdaotao.hub.edu.vn/thong-bao';

test('announcement crawler parses real card dates and discovers bounded pagination', () => {
  const result = parseAnnouncementPage(`
    <article class="notification-item"><div class="date"><span class="day">24</span><span class="month-year">08.2026</span></div>
    <h3 class="news-title"><a href="/thong-bao/new.html">Thông báo kiểm thử đủ dài</a></h3></article>
    <a href="/thong-bao?trang=6">6</a><a href="https://other.invalid/thong-bao?trang=99">other</a>
  `, source);
  assert.deepEqual(result.items, [{
    title: 'Thông báo kiểm thử đủ dài',
    link: 'https://phongdaotao.hub.edu.vn/thong-bao/new.html',
    date: '2026-08-24',
  }]);
  assert.equal(result.lastPage, 6);
  assert.equal(result.undated, 0);
});

test('announcement crawler refuses undated items instead of manufacturing a fresh date', () => {
  const result = parseAnnouncementPage('<article><a href="/thong-bao/new.html">Thông báo kiểm thử đủ dài</a></article>', source);
  assert.equal(result.items.length, 0);
  assert.equal(result.undated, 1);
});

test('announcement crawler retains a dated legacy WebForms notice without using a synthetic date', () => {
  const result = parseAnnouncementPage(`
    <table><tr><td><a class="titlenews" title="Messages.aspx?ID=4715" href="javascript:__doPostBack()">Thông báo WebForms kiểm thử đủ dài</a></td></tr>
    <tr><td class="inputdate">[Ngày đăng:<span class="inputdate">08/09/2026</span>]</td></tr></table>
  `, 'https://online.hub.edu.vn/');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].date, '2026-09-08');
  assert.equal(result.items[0].link, 'https://online.hub.edu.vn/Messages.aspx?ID=4715');
});

test('announcement crawler accepts an advertised empty terminal page without masking a first-page layout failure', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: URL | RequestInfo) => {
    const value = String(url);
    if (value.includes('trang=2')) return new Response('<html><body>Hết trang</body></html>');
    if (value.includes('online.hub.edu.vn')) {
      return new Response('<table><tr><td><a class="titlenews" title="Messages.aspx?ID=1" href="javascript:__doPostBack()">Thông báo WebForms kiểm thử đủ dài</a></td></tr><tr><td class="inputdate">08/09/2026</td></tr></table><a href="/?trang=2">2</a>');
    }
    return new Response('<article class="notification-item"><div class="date"><span class="day">24</span><span class="month-year">08.2026</span></div><h3 class="news-title"><a href="/thong-bao/new.html">Thông báo kiểm thử đủ dài</a></h3></article><a href="/thong-bao?trang=2">2</a>');
  }) as typeof fetch;
  try {
    const result = await crawlAnnouncementSources({ after: '2026-08-05', maxPages: 2, delayMs: 0 });
    assert.equal(result.sources[0]?.complete, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('announcement crawler paginates in resumable chunks below the Workflow subrequest ceiling', async () => {
  const fetched: number[] = [];
  const fetcher = (async (url: URL | RequestInfo) => {
    const page = Number(new URL(String(url)).searchParams.get('trang') || '1');
    fetched.push(page);
    return new Response(`<article class="notification-item"><div class="date"><span class="day">08</span><span class="month-year">09.2026</span></div><h3 class="news-title"><a href="/thong-bao/${page}.html">Thông báo phân trang số ${page} đủ dài</a></h3></article><a href="/thong-bao?trang=45">45</a>`);
  }) as typeof fetch;
  const first = await crawlAnnouncementSourceChunk({ source: ['dbcl', source], after: '2026-08-05', startPage: 1, maxPages: 80, chunkPages: 20, fetcher, delayMs: 0 });
  const second = await crawlAnnouncementSourceChunk({ source: ['dbcl', source], after: '2026-08-05', startPage: first.nextPage, lastPage: first.lastPage, maxPages: 80, chunkPages: 20, previousFingerprint: first.lastFingerprint, fetcher, delayMs: 0 });
  const third = await crawlAnnouncementSourceChunk({ source: ['dbcl', source], after: '2026-08-05', startPage: second.nextPage, lastPage: second.lastPage, maxPages: 80, chunkPages: 20, previousFingerprint: second.lastFingerprint, fetcher, delayMs: 0 });
  assert.deepEqual([first.pages, second.pages, third.pages], [20, 20, 5]);
  assert.equal(third.complete, true);
  assert.equal(fetched.length, 45);
});
