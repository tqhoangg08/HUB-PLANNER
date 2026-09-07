import { supabase } from '../supabase/functions/_shared/supabase.ts'
import {
  HUB_NOTIFICATION_SOURCES,
  scrapeNotificationList,
  sleep,
  type NotificationListItem,
} from '../supabase/functions/_shared/hub_notifications.ts'
import {
  buildAnnouncementCandidates,
  normalizeAnnouncementTitle,
  type AnnouncementCandidate,
} from './hub_notification_crawler_core.ts'

const DEFAULT_MAX_ITEMS = 8
const DEFAULT_PUSH_FRESHNESS_DAYS = 3
const SOURCE_DELAY_MS = 500

type CrawlerOptions = {
  sourceId: string
  maxItems: number
  dryRun: boolean
  now: Date
  pushFreshnessDays: number
}

function requireEnv(name: string) {
  if (!Deno.env.get(name)) throw new Error(`Missing required env: ${name}`)
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readOptions(): CrawlerOptions {
  const args = Object.fromEntries(Deno.args.map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, '').split('=')
    return [key, valueParts.join('=') || 'true']
  }))

  const sourceId = String(args.source || Deno.env.get('CRAWLER_SOURCE') || '').trim()
  const maxItems = positiveInteger(args.maxItems || Deno.env.get('CRAWLER_MAX_ITEMS'), DEFAULT_MAX_ITEMS)
  const dryRun = ['true', '1', 'yes'].includes(String(args.dryRun || Deno.env.get('CRAWLER_DRY_RUN') || '').toLowerCase())
  const pushFreshnessDays = positiveInteger(
    Deno.env.get('ANNOUNCEMENT_PUSH_FRESHNESS_DAYS'),
    DEFAULT_PUSH_FRESHNESS_DAYS,
  )

  return { sourceId, maxItems, dryRun, now: new Date(), pushFreshnessDays }
}

const chunk = <T>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_unused, index) => values.slice(index * size, (index + 1) * size))

async function loadExistingKeys(items: NotificationListItem[]) {
  const existingLinks = new Set<string>()
  const existingTitles = new Set<string>()

  for (const links of chunk([...new Set(items.map((item) => item.detail_url))], 25)) {
    const { data, error } = await supabase.from('school_announcements').select('link').in('link', links)
    if (error) throw error
    for (const row of data || []) existingLinks.add(String(row.link))
  }

  // PostgREST encodes every title into the query string. Keep batches deliberately
  // small so long Vietnamese titles cannot exceed intermediary URL limits.
  for (const titles of chunk([...new Set(items.map((item) => item.title.trim()))], 5)) {
    const { data, error } = await supabase.from('school_announcements').select('title').in('title', titles)
    if (error) throw error
    for (const row of data || []) existingTitles.add(normalizeAnnouncementTitle(String(row.title)))
  }

  return { existingLinks, existingTitles }
}

async function crawlSources(sourceId: string) {
  const sources = sourceId
    ? HUB_NOTIFICATION_SOURCES.filter((source) => source.id === sourceId)
    : HUB_NOTIFICATION_SOURCES

  if (sourceId && sources.length === 0) throw new Error(`Unknown crawler source: ${sourceId}`)

  const discovered: NotificationListItem[] = []
  const failures: Array<{ source: string; errorClass: string }> = []
  for (const source of sources) {
    try {
      discovered.push(...await scrapeNotificationList(source, 1, 1))
    } catch (error) {
      failures.push({ source: source.id, errorClass: error instanceof Error ? error.name : 'Error' })
    }
    await sleep(SOURCE_DELAY_MS)
  }

  if (discovered.length === 0 && failures.length > 0) {
    throw new Error(`All announcement sources failed (${failures.map((item) => item.source).join(', ')})`)
  }
  return { discovered, failures, sourceCount: sources.length }
}

async function insertCandidates(candidates: AnnouncementCandidate[]) {
  const inserted: Array<{ id: string | number; date: string; is_new: boolean }> = []
  let duplicateRaces = 0

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('school_announcements')
      .insert({
        title: candidate.title,
        link: candidate.link,
        date: candidate.date,
        is_new: candidate.isNew,
        is_hidden: false,
      })
      .select('id, date, is_new')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        duplicateRaces += 1
        continue
      }
      throw error
    }
    if (data) inserted.push(data)
  }

  const pushEligibleIds = inserted.filter((item) => item.is_new).map((item) => item.id)
  let queued = 0
  if (pushEligibleIds.length > 0) {
    const { count, error } = await supabase
      .from('school_announcement_push_queue')
      .select('id', { count: 'exact', head: true })
      .in('announcement_id', pushEligibleIds)
    if (error) throw error
    queued = Number(count || 0)
    if (queued !== pushEligibleIds.length) throw new Error('Announcement push queue trigger did not queue every fresh insert')
  }

  return { inserted, queued, duplicateRaces }
}

export async function runCrawler(options: CrawlerOptions) {
  const crawl = await crawlSources(options.sourceId)
  const usable = crawl.discovered.filter((item) => item.published_date)
  const existing = await loadExistingKeys(usable)
  const candidates = buildAnnouncementCandidates(usable, existing, {
    maxItems: options.maxItems,
    now: options.now,
    pushFreshnessDays: options.pushFreshnessDays,
  })

  const summary = {
    success: true,
    dryRun: options.dryRun,
    sourcesChecked: crawl.sourceCount,
    sourceFailures: crawl.failures,
    discovered: crawl.discovered.length,
    usableWithSourceDate: usable.length,
    newCandidates: candidates.length,
    newestDiscoveredDate: usable.map((item) => item.published_date).filter(Boolean).sort().at(-1) || null,
    inserted: 0,
    queued: 0,
    duplicateRaces: 0,
  }

  if (!options.dryRun && candidates.length > 0) {
    const result = await insertCandidates(candidates)
    summary.inserted = result.inserted.length
    summary.queued = result.queued
    summary.duplicateRaces = result.duplicateRaces
  }

  console.log(JSON.stringify(summary, null, 2))
  return summary
}

if (import.meta.main) {
  requireEnv('SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  await runCrawler(readOptions())
}
