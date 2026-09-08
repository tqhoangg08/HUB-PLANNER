import { load } from 'cheerio/slim';

// These are the ten sources of the original /api/cron, not the retired RAG job.
export const ANNOUNCEMENT_SOURCES = [
  ['old', 'https://online.hub.edu.vn/'],
  ['dbcl', 'https://phongktdbcl.hub.edu.vn/thong-bao'],
  ['scc', 'https://scc.hub.edu.vn/thong-bao'],
  ['clc', 'https://clc.hub.edu.vn/thong-bao'],
  ['hub_main', 'https://hub.edu.vn/thong-bao'],
  ['daotao', 'https://phongdaotao.hub.edu.vn/thong-bao'],
  ['qlcntt', 'https://phongqlcntt.hub.edu.vn/tin-hoat-dong/thong-bao'],
  ['tstt', 'https://phongtstt.hub.edu.vn/thong-bao'],
  ['tochuc', 'https://phongtochuc.hub.edu.vn/thong-bao'],
  ['ketoan', 'https://phongketoan.hub.edu.vn/thong-bao'],
] as const;

export type Announcement = { title: string; link: string; date: string };
export type AnnouncementSource = typeof ANNOUNCEMENT_SOURCES[number];
export type AnnouncementSourceChunk = {
  items: Announcement[];
  pages: number;
  undated: number;
  nextPage: number;
  lastPage: number;
  lastFingerprint: string | null;
  complete: boolean;
  error: string | null;
};
export const announcementTitleKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
function sourceDate(text: string) {
  const m = text.match(/\b(\d{1,2})[\s/.-]+(\d{1,2})[\s/.-]+(\d{4})\b/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const timestamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseAnnouncementPage(html: string, sourceUrl: string) {
  const $ = load(html);
  const items: Announcement[] = [];
  let undated = 0;
  const old = new URL(sourceUrl).hostname === 'online.hub.edu.vn';
  const cards = old ? $('a.titlenews') : $('.notification-item,.news-item,article');
  cards.each((_i, element) => {
    const card = $(element);
    // The image link precedes the headline on several current HUB sites.
    // Prefer headline anchors explicitly instead of accepting document order.
    const anchor = old ? card : card.find('.news-title a,h3 a,h2 a').first().length
      ? card.find('.news-title a,h3 a,h2 a').first()
      : card.find('a[href$=".html"]').first();
    const title = clean(anchor.text() || anchor.attr('title') || anchor.find('img').attr('alt') || '');
    const href = anchor.attr('href') || '';
    if (title.length < 15 || !href) return;
    const dateText = old ? card.closest('table').find('.inputdate').first().text()
      : card.find('.date .day').length && card.find('.date .month-year').length
        ? `${card.find('.date .day').first().text()}/${card.find('.date .month-year').first().text()}`
        : card.find('.news-date').first().text() || card.text();
    const date = sourceDate(dateText);
    if (!date) { undated++; return; } // Never fabricate today's date.
    let link: string;
    if (old && href.startsWith('javascript:')) {
      // The WebForms list retains the durable detail query in title.  Never
      // derive a dedupe key from the display title alone.
      const detail = anchor.attr('title') || '';
      link = /^Messages\.aspx\?ID=\d+$/i.test(detail)
        ? new URL(detail, sourceUrl).toString()
        : `https://online.hub.edu.vn/#id=${encodeURIComponent(title)}`;
    } else {
      try {
        const url = new URL(href, sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol) || !/(^|\.)hub\.edu\.vn$/.test(url.hostname)) return;
        url.protocol = 'https:';
        link = url.toString().replace(/\/$/, '');
      } catch { return; }
    }
    items.push({ title, link, date });
  });
  let lastPage = 1;
  $('a[href*="trang="]').each((_i, element) => {
    try {
      const u = new URL($(element).attr('href')!, sourceUrl);
      if (u.origin !== new URL(sourceUrl).origin || u.pathname !== new URL(sourceUrl).pathname) return;
      const n = Number(u.searchParams.get('trang'));
      if (Number.isInteger(n) && n > lastPage) lastPage = n;
    } catch { /* Ignore unrelated links. */ }
  });
  return { items, lastPage, undated, cards: cards.length };
}

async function boundedText(response: Response, maxBytes = 3_000_000) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('ANNOUNCEMENT_RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export async function crawlAnnouncementSourceChunk(options: {
  source: AnnouncementSource;
  after: string;
  startPage: number;
  lastPage?: number;
  maxPages: number;
  chunkPages?: number;
  previousFingerprint?: string | null;
  fetcher?: typeof fetch;
  delayMs?: number;
}): Promise<AnnouncementSourceChunk> {
  const [, sourceUrl] = options.source;
  const fetcher = options.fetcher || fetch;
  const startPage = Math.max(1, options.startPage);
  const maxPages = Math.min(80, Math.max(startPage, options.maxPages));
  const chunkEnd = Math.min(maxPages, startPage + Math.max(1, options.chunkPages || 20) - 1);
  let lastPage = Math.max(startPage, options.lastPage || 1);
  let nextPage = startPage;
  let lastFingerprint = options.previousFingerprint || null;
  const seenPages = new Set<string>();
  const items: Announcement[] = [];
  let pages = 0;
  let undated = 0;
  try {
    while (nextPage <= Math.min(lastPage, chunkEnd, maxPages)) {
      const page = nextPage;
      const url = new URL(sourceUrl);
      if (page > 1) url.searchParams.set('trang', String(page));
      const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
      if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
      const parsed = parseAnnouncementPage(await boundedText(response), sourceUrl);
      if (!parsed.cards) {
        if (page > 1) {
          return { items, pages, undated, nextPage: page, lastPage, lastFingerprint, complete: true, error: null };
        }
        throw new Error('ANNOUNCEMENT_LAYOUT_OR_PARSER_CHANGED');
      }
      const fingerprint = parsed.items.map((item) => `${item.link}:${item.date}`).join('|');
      if (fingerprint === lastFingerprint || seenPages.has(fingerprint)) throw new Error('PAGINATION_REPEATED_PAGE');
      seenPages.add(fingerprint);
      lastFingerprint = fingerprint;
      pages++;
      undated += parsed.undated;
      items.push(...parsed.items.filter((item) => item.date > options.after));
      lastPage = Math.max(lastPage, parsed.lastPage);
      nextPage = page + 1;
      if (nextPage <= Math.min(lastPage, chunkEnd, maxPages)) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 500));
      }
    }
    const complete = nextPage > lastPage;
    const error = !complete && nextPage > maxPages ? 'PAGINATION_LIMIT_REACHED' : null;
    return { items, pages, undated, nextPage, lastPage, lastFingerprint, complete, error };
  } catch (error) {
    const message = error instanceof Error && /^(UPSTREAM_HTTP_|PAGINATION_|ANNOUNCEMENT_)/.test(error.message)
      ? error.message : 'UPSTREAM_TRANSPORT_ERROR';
    return { items, pages, undated, nextPage, lastPage, lastFingerprint, complete: false, error: message };
  }
}

export async function crawlAnnouncementSources(options: {
  after: string; maxPages?: number; fetcher?: typeof fetch; delayMs?: number;
}) {
  const fetcher = options.fetcher || fetch;
  const maxPages = Math.min(80, Math.max(1, options.maxPages || 60));
  const items: Announcement[] = [];
  const sources: Array<{ id: string; pages: number; rows: number; undated: number; complete: boolean; error: string | null }> = [];
  const started = Date.now();
  for (const [id, sourceUrl] of ANNOUNCEMENT_SOURCES) {
    const summary = { id, pages: 0, rows: 0, undated: 0, complete: false, error: null as string | null };
    if (Date.now() - started > 10 * 60_000) summary.error = 'CRAWL_TIME_BUDGET';
    else {
      const chunk = await crawlAnnouncementSourceChunk({
        source: [id, sourceUrl] as AnnouncementSource,
        after: options.after,
        startPage: 1,
        maxPages,
        chunkPages: maxPages,
        fetcher,
        delayMs: options.delayMs,
      });
      summary.pages = chunk.pages;
      summary.rows = chunk.items.length;
      summary.undated = chunk.undated;
      summary.complete = chunk.complete;
      summary.error = chunk.error;
      items.push(...chunk.items);
      if (summary.undated) { summary.complete = false; summary.error = 'SOURCE_DATE_MISSING'; }
    }
    sources.push(summary);
  }
  const seenLinks = new Set<string>(), seenTitles = new Set<string>();
  const unique = items.filter(i => {
    const key = announcementTitleKey(i.title);
    if (seenLinks.has(i.link) || seenTitles.has(key)) return false;
    seenLinks.add(i.link); seenTitles.add(key); return true;
  });
  return { items: unique, sources, complete: sources.every(s => s.complete && !s.error) };
}
