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
    let lastPage = 1;
    const seenPages = new Set<string>();
    try {
      for (let page = 1; page <= Math.min(lastPage, maxPages); page++) {
        if (Date.now() - started > 10 * 60_000) throw new Error('CRAWL_TIME_BUDGET');
        const url = new URL(sourceUrl);
        if (page > 1) url.searchParams.set('trang', String(page));
        const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
        if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
        const parsed = parseAnnouncementPage(await boundedText(response), sourceUrl);
        if (!parsed.cards) {
          // Several HUB sites advertise one empty terminal page. That is an
          // exhausted pagination cursor, not an authentication or parser
          // failure. A first-page empty layout remains a real contract error.
          if (page > 1) { summary.complete = true; break; }
          throw new Error('ANNOUNCEMENT_LAYOUT_OR_PARSER_CHANGED');
        }
        const fingerprint = parsed.items.map(i => `${i.link}:${i.date}`).join('|');
        if (seenPages.has(fingerprint)) throw new Error('PAGINATION_REPEATED_PAGE');
        seenPages.add(fingerprint);
        summary.pages++; summary.undated += parsed.undated;
        const recent = parsed.items.filter(i => i.date > options.after);
        summary.rows += recent.length;
        items.push(...recent);
        lastPage = Math.max(lastPage, parsed.lastPage);
        // Inspect every advertised page: pinned/out-of-order dates are not a cursor.
        if (page >= lastPage) summary.complete = true;
        await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 500));
      }
      if (!summary.complete) summary.error = 'PAGINATION_LIMIT_REACHED';
      if (summary.undated) { summary.complete = false; summary.error = 'SOURCE_DATE_MISSING'; }
    } catch (e) {
      summary.error = e instanceof Error && /^(UPSTREAM_HTTP_|PAGINATION_|CRAWL_TIME|ANNOUNCEMENT_|SOURCE_)/.test(e.message)
        ? e.message : 'UPSTREAM_TRANSPORT_ERROR';
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
