import type { crawlAnnouncementSources } from './announcement-crawler.ts';

type CrawlResult = Awaited<ReturnType<typeof crawlAnnouncementSources>>;
export interface AnnouncementStoreEnv { DB: D1Database; }

export const syncCrawledSchoolAnnouncements = async (
  env: AnnouncementStoreEnv, crawl: CrawlResult,
  options: { allowIncomplete?: boolean } = {},
) => {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  let inserted = 0;
  let updated = 0;
  // Each statement is atomic, including the title dedupe predicate. Exact link
  // updates retain the canonical ID, creation time, hidden state and push flag.
  for (const item of crawl.items) {
    if (!item.title.trim() || !/^https?:\/\//.test(item.link) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      throw new Error('ANNOUNCEMENT_ITEM_INVALID');
    }
    const titleSearch = item.title.toLocaleLowerCase('vi-VN');
    const changed = await env.DB.prepare(`UPDATE school_announcements
      SET title=?, title_search=?, date=?, updated_at=?
      WHERE link=? AND (title IS NOT ? OR date IS NOT ?)`)
      .bind(item.title, titleSearch, item.date, now, item.link, item.title, item.date).run();
    updated += Number(changed.meta?.changes || 0);
    const published = Date.parse(`${item.date}T00:00:00Z`);
    const isNew = published >= nowMs - 3 * 86400000 && published <= nowMs + 86400000;
    const result = await env.DB.prepare(`INSERT INTO school_announcements
      (id,title,title_search,link,date,is_new,created_at,is_hidden,updated_at)
      SELECT (SELECT last_id+1 FROM announcement_id_sequence WHERE singleton=1),?,?,?,?,?,?,0,?
      WHERE NOT EXISTS (SELECT 1 FROM school_announcements WHERE link=?)
        AND NOT EXISTS (SELECT 1 FROM school_announcements WHERE title_search=?)
      ON CONFLICT(link) DO NOTHING`)
      .bind(item.title, titleSearch, item.link, item.date, isNew ? 1 : 0, now, now, item.link, titleSearch).run();
    inserted += Number(result.meta?.changes || 0);
  }
  const newest = await env.DB.prepare('SELECT date FROM school_announcements ORDER BY date DESC LIMIT 1')
    .first<{date: string}>();
  const newestUpstreamDate = crawl.items.map(item => item.date).sort().at(-1) || newest?.date || null;
  // This diagnostic row is not the announcement authority. Persist it only
  // when crawler state actually changes; per-chunk "last run" timestamps
  // previously produced a D1 write for every no-op crawl.
  const sourceCursor = JSON.stringify({
    authority: 'd1', complete: crawl.complete,
    sources: crawl.sources.map(({ id, complete, error }) => ({ id, complete, error })),
  });
  const metadata = inserted || updated || crawl.sources.some((source) => Boolean(source.error))
    ? await env.DB.prepare(`INSERT INTO sync_metadata
      (resource,source_row_count,source_max_created_at,synced_at,visible_row_count,source_cursor)
      VALUES (?,?,?,?,?,?) ON CONFLICT(resource) DO UPDATE SET
      source_row_count=excluded.source_row_count, source_max_created_at=excluded.source_max_created_at,
      synced_at=excluded.synced_at, visible_row_count=excluded.visible_row_count, source_cursor=excluded.source_cursor
      WHERE sync_metadata.source_row_count IS NOT excluded.source_row_count
         OR sync_metadata.source_max_created_at IS NOT excluded.source_max_created_at
         OR sync_metadata.visible_row_count IS NOT excluded.visible_row_count
         OR sync_metadata.source_cursor IS NOT excluded.source_cursor`)
      .bind('school_announcement_crawler', crawl.items.length, newestUpstreamDate, now, crawl.items.length,
        sourceCursor).run()
    : null;
  // D1's conflict branch deliberately leaves the row untouched when only
  // volatile timestamps differ. This keeps monitoring data while avoiding
  // writes from no-op source chunks.
  const metadataWritten = Number(metadata?.meta?.changes || 0);
  if (!crawl.complete && !options.allowIncomplete) {
    throw new Error(`ANNOUNCEMENT_CRAWL_INCOMPLETE:${crawl.sources.filter(s=>!s.complete||s.error).map(s=>s.id).join(',')}`);
  }
  return {...crawl, candidates:crawl.items.length, inserted, updated, metadataWritten,
    synced:{insertedOrUpdated:inserted+updated,recentRowsRefreshed:0},newestUpstreamDate,authority:'d1' as const};
};
