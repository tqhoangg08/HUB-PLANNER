import { supabase } from '../supabase/functions/_shared/supabase.ts'
import {
  chunkText,
  downloadPdf,
  embedText,
  extractHtmlNotificationText,
  extractPdfTextFromBytes,
  fetchHtml,
  getCrawlPlan,
  HUB_NOTIFICATION_SOURCES,
  parseNotificationDetail,
  scrapeNotificationList,
  sha256Hex,
  sleep,
  uploadPdfToR2,
  uploadTextToR2,
} from '../supabase/functions/_shared/hub_notifications.ts'

const DEFAULT_BACKFILL_MAX_PAGE = 80
const STALE_RUNNING_PROGRESS_MS = 15 * 60 * 1000
const ACTIVE_CRAWL_LOCK_MS = Number(Deno.env.get('CRAWLER_ACTIVE_LOCK_MINUTES') || 30) * 60 * 1000
const STALE_RUNNING_CRAWL_MS = Number(Deno.env.get('CRAWLER_STALE_RUNNING_MINUTES') || 45) * 60 * 1000

type CrawlerOptions = {
  mode: string
  sourceId: string
  maxItems: number
  maxPage: number
  force: boolean
}

function requireEnv(name: string) {
  if (!Deno.env.get(name)) throw new Error(`Missing required env: ${name}`)
}

function requireAnyEnv(names: string[]) {
  if (!names.some((name) => Deno.env.get(name))) {
    throw new Error(`Missing one of required envs: ${names.join(', ')}`)
  }
}

function normalizeCrawlMode(mode: string) {
  if (['latest', 'recent', 'daily', 'backfill', 'backfill-auto'].includes(mode)) return 'auto'
  return mode || 'auto'
}

function readOptions(): CrawlerOptions {
  const args = Object.fromEntries(Deno.args.map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, '').split('=')
    return [key, valueParts.join('=') || 'true']
  }))

  const mode = normalizeCrawlMode(String(args.mode || Deno.env.get('CRAWLER_MODE') || 'auto'))
  const sourceId = String(args.source || Deno.env.get('CRAWLER_SOURCE') || '')
  const maxItems = Math.max(1, Number(args.maxItems || Deno.env.get('CRAWLER_MAX_ITEMS') || 8))
  const maxPage = Math.max(1, Number(args.maxPage || Deno.env.get('CRAWLER_MAX_PAGE') || Deno.env.get('NOTIFICATION_BACKFILL_MAX_PAGE') || DEFAULT_BACKFILL_MAX_PAGE))
  const force = ['true', '1', 'yes'].includes(String(args.force || Deno.env.get('CRAWLER_FORCE') || '').toLowerCase())

  return { mode, sourceId, maxItems, maxPage, force }
}

async function ensureBackfillProgress(maxPage = DEFAULT_BACKFILL_MAX_PAGE) {
  const rows = HUB_NOTIFICATION_SOURCES.map((source) => ({
    source_id: source.id,
    source_url: source.url,
    department: source.department,
    max_page: maxPage,
    next_item_index: 0,
  }))

  const { error } = await supabase
    .from('school_notification_backfill_progress')
    .upsert(rows, { onConflict: 'source_id', ignoreDuplicates: true })

  if (error) throw error
}

async function getNextBackfillSource(maxPage = DEFAULT_BACKFILL_MAX_PAGE) {
  await ensureBackfillProgress(maxPage)

  const staleCutoff = new Date(Date.now() - STALE_RUNNING_PROGRESS_MS).toISOString()
  await supabase
    .from('school_notification_backfill_progress')
    .update({ status: 'pending', last_error: 'Recovered stale running crawl.' })
    .eq('status', 'running')
    .lt('last_run_at', staleCutoff)

  const { data, error } = await supabase
    .from('school_notification_backfill_progress')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('next_page', maxPage)
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .order('next_page', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  await supabase
    .from('school_notification_backfill_progress')
    .update({ status: 'running', last_run_at: new Date().toISOString(), last_error: null })
    .eq('source_id', data.source_id)

  const source = HUB_NOTIFICATION_SOURCES.find((item) => item.id === data.source_id)
  return source ? { source, progress: data } : null
}

async function finishBackfillSourceBatch(sourceId: string, currentPage: number, maxPage: number, discovered: number, startItemIndex: number, processedItems: number) {
  const nextItemIndex = startItemIndex + processedItems
  const pageDone = discovered === 0 || nextItemIndex >= discovered
  const isDone = discovered === 0 || (pageDone && currentPage >= maxPage)
  const { error } = await supabase
    .from('school_notification_backfill_progress')
    .update({
      status: isDone ? 'done' : 'pending',
      next_page: pageDone ? (isDone ? currentPage : currentPage + 1) : currentPage,
      next_item_index: pageDone ? 0 : nextItemIndex,
      last_run_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('source_id', sourceId)
  if (error) throw error
}

async function failBackfillSourcePage(sourceId: string, error: unknown) {
  await supabase
    .from('school_notification_backfill_progress')
    .update({
      status: 'failed',
      last_run_at: new Date().toISOString(),
      last_error: error instanceof Error ? error.message : String(error),
    })
    .eq('source_id', sourceId)
}

async function notificationHasChunks(notificationId: string) {
  const { count, error } = await supabase
    .from('notification_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', notificationId)
  if (error) throw error
  return Number(count || 0) > 0
}

async function recoverStaleCrawlRuns() {
  const staleCutoff = new Date(Date.now() - STALE_RUNNING_CRAWL_MS).toISOString()
  await supabase
    .from('school_notification_crawl_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: 'Recovered stale running crawler worker.',
    })
    .eq('status', 'running')
    .lt('started_at', staleCutoff)
}

async function getActiveCrawlRun() {
  const activeCutoff = new Date(Date.now() - ACTIVE_CRAWL_LOCK_MS).toISOString()
  const { data, error } = await supabase
    .from('school_notification_crawl_runs')
    .select('id, started_at')
    .eq('status', 'running')
    .gte('started_at', activeCutoff)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function upsertChunks(notification: any, chunks: string[]) {
  await supabase.from('notification_chunks').delete().eq('notification_id', notification.id)

  const rows = []
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    let embedding = null
    try {
      embedding = await embedText([
        notification.title,
        notification.published_date || '',
        chunk,
      ].join('\n'), 'RETRIEVAL_DOCUMENT')
    } catch (error) {
      console.error('Notification chunk embedding failed:', notification.detail_url, error)
    }

    rows.push({
      notification_id: notification.id,
      chunk_text: chunk,
      chunk_index: index,
      embedding: embedding ? `[${embedding.join(',')}]` : null,
      title: notification.title,
      published_date: notification.published_date,
      detail_url: notification.detail_url,
      pdf_url: notification.pdf_url,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('notification_chunks').insert(rows)
    if (error) throw error
  }
}

async function processNotification(item: any, options: { forceRecheckExisting: boolean }) {
  const now = new Date().toISOString()
  const detailHtml = await fetchHtml(item.detail_url)
  const detail = parseNotificationDetail(detailHtml, item.detail_url, item)

  const baseRecord = {
    title: detail.title || item.title,
    department: item.department,
    published_date: detail.published_date || item.published_date,
    detail_url: item.detail_url,
    pdf_url: detail.pdf_url,
    last_crawled_at: now,
  }

  const { data: existing } = await supabase
    .from('school_notifications')
    .select('id, content_hash, extraction_status, extracted_text_file_path, pdf_file_path')
    .eq('detail_url', item.detail_url)
    .maybeSingle()

  if (!detail.pdf_url) {
    const htmlText = extractHtmlNotificationText(detailHtml)
    if (htmlText.length >= 160) {
      const contentHash = await sha256Hex(`${item.detail_url}\n${htmlText}`)
      const extractedTextFilePath = await uploadTextToR2(`school-notifications/${contentHash}.txt`, htmlText).catch((error) => {
        console.warn('HTML text R2 upload failed:', error)
        return null
      })
      const shouldStoreFullTextInDb = String(Deno.env.get('NOTIFICATION_STORE_FULL_TEXT_IN_DB') || '').toLowerCase() === 'true'

      const { data: notification, error } = await supabase
        .from('school_notifications')
        .upsert({
          ...baseRecord,
          pdf_file_path: null,
          extracted_text_file_path: extractedTextFilePath,
          extracted_text: shouldStoreFullTextInDb ? htmlText : null,
          extraction_status: 'success',
          extraction_method: 'html_text',
          extraction_error: null,
          content_hash: contentHash,
          updated_at: now,
        }, { onConflict: 'detail_url' })
        .select('id, title, published_date, detail_url, pdf_url, extracted_text')
        .single()
      if (error) throw error

      const chunks = chunkText(htmlText)
      await upsertChunks({ ...notification, extracted_text: htmlText }, chunks)

      return { status: 'success', method: 'html_text', chunkCount: chunks.length, notification }
    }

    const { data, error } = await supabase
      .from('school_notifications')
      .upsert({
        ...baseRecord,
        extraction_status: 'failed',
        extraction_method: null,
        extraction_error: 'No PDF URL found in notification detail page',
      }, { onConflict: 'detail_url' })
      .select('id, title, published_date, detail_url, pdf_url')
      .single()
    if (error) throw error
    return { status: 'failed', reason: 'missing_pdf', notification: data }
  }

  const pdfBytes = await downloadPdf(detail.pdf_url)
  const contentHash = await sha256Hex(pdfBytes)

  if (existing?.content_hash === contentHash && !options.forceRecheckExisting && await notificationHasChunks(existing.id)) {
    await supabase
      .from('school_notifications')
      .update({ ...baseRecord, content_hash: contentHash, last_crawled_at: now })
      .eq('id', existing.id)
    return { status: 'skipped', reason: 'unchanged' }
  }

  let extraction
  try {
    extraction = await extractPdfTextFromBytes(pdfBytes)
  } catch (error) {
    extraction = {
      text: '',
      method: 'ocr',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const pdfFilePath = await uploadPdfToR2(`school-notifications/${contentHash}.pdf`, pdfBytes).catch((error) => {
    console.warn('PDF R2 upload failed:', error)
    return null
  })
  const extractedTextFilePath = extraction.text
    ? await uploadTextToR2(`school-notifications/${contentHash}.txt`, extraction.text).catch((error) => {
      console.warn('Extracted text R2 upload failed:', error)
      return null
    })
    : null
  const shouldStoreFullTextInDb = String(Deno.env.get('NOTIFICATION_STORE_FULL_TEXT_IN_DB') || '').toLowerCase() === 'true'

  const { data: notification, error } = await supabase
    .from('school_notifications')
    .upsert({
      ...baseRecord,
      pdf_file_path: pdfFilePath,
      extracted_text_file_path: extractedTextFilePath,
      extracted_text: shouldStoreFullTextInDb ? extraction.text : null,
      extraction_method: extraction.method,
      extraction_status: extraction.status,
      extraction_error: extraction.error || null,
      content_hash: contentHash,
      updated_at: now,
    }, { onConflict: 'detail_url' })
    .select('id, title, published_date, detail_url, pdf_url, extracted_text')
    .single()
  if (error) throw error

  let chunkCount = 0
  if (extraction.status === 'success' && extraction.text) {
    const chunks = chunkText(extraction.text)
    await upsertChunks(notification, chunks)
    chunkCount = chunks.length
  }

  return { status: extraction.status, method: extraction.method, chunkCount, notification }
}

async function runCrawler(options: CrawlerOptions) {
  await recoverStaleCrawlRuns()
  const activeRun = await getActiveCrawlRun()
  if (activeRun) {
    console.log(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'crawler_already_running',
      activeRunId: activeRun.id,
      activeRunStartedAt: activeRun.started_at,
    }, null, 2))
    return
  }

  const plan = getCrawlPlan(options.mode)
  const forceRecheckExisting = options.force || plan.forceRecheckExisting
  let startPage = 1
  let pages = plan.pagesPerSource
  let activeBackfill: { sourceId: string; currentPage: number; currentItemIndex: number; maxPage: number } | null = null
  let sources = options.sourceId
    ? HUB_NOTIFICATION_SOURCES.filter((source) => source.id === options.sourceId)
    : HUB_NOTIFICATION_SOURCES

  if (options.mode === 'auto') {
    const next = await getNextBackfillSource(options.maxPage)
    if (!next) {
      console.log(JSON.stringify({ success: true, mode: options.mode, message: 'Notification crawl completed. No pending source/page.' }, null, 2))
      return
    }
    sources = [next.source]
    startPage = next.progress.next_page
    pages = 1
    activeBackfill = {
      sourceId: next.source.id,
      currentPage: next.progress.next_page,
      currentItemIndex: Math.max(0, Number(next.progress.next_item_index || 0)),
      maxPage: next.progress.max_page || options.maxPage,
    }
  }

  const { data: run, error: runError } = await supabase
    .from('school_notification_crawl_runs')
    .insert({ mode: options.mode, started_at: new Date().toISOString(), status: 'running' })
    .select('id')
    .single()
  if (runError) throw runError

  const runId = run?.id
  const counters = {
    crawled: 0,
    examined: 0,
    discovered: 0,
    newItems: [] as any[],
    pdfSuccess: 0,
    pdfOcr: 0,
    pdfFailed: 0,
    needReview: 0,
    skipped: 0,
  }

  try {
    for (const source of sources) {
      if (counters.crawled >= options.maxItems) break
      console.log(`Crawling ${source.id} page ${startPage}...`)
      let listItems = []
      try {
        listItems = await scrapeNotificationList(source, pages, startPage)
        counters.discovered += listItems.length
      } catch (error) {
        if (activeBackfill) await failBackfillSourcePage(activeBackfill.sourceId, error)
        throw error
      }

      const itemsToProcess = activeBackfill ? listItems.slice(activeBackfill.currentItemIndex) : listItems
      let processedItemsOnPage = 0

      for (const item of itemsToProcess) {
        if (counters.crawled >= options.maxItems) break
        counters.examined += 1
        processedItemsOnPage += 1
        await sleep(plan.delayMs)
        try {
          const result = await processNotification(item, { forceRecheckExisting })
          if (result.status === 'skipped') counters.skipped += 1
          if (result.status === 'success') {
            counters.pdfSuccess += 1
            counters.crawled += 1
          }
          if (result.method === 'ocr') counters.pdfOcr += 1
          if (result.status === 'failed') {
            counters.pdfFailed += 1
            counters.crawled += 1
          }
          if (result.status === 'need_review') {
            counters.needReview += 1
            counters.crawled += 1
          }
          if (result.notification && result.status !== 'skipped') {
            counters.newItems.push({
              title: result.notification.title,
              date: result.notification.published_date,
              detail_url: result.notification.detail_url,
            })
          }
          console.log(`${result.status}: ${item.title}`)
        } catch (error) {
          counters.pdfFailed += 1
          counters.crawled += 1
          console.error('Notification processing failed:', item.detail_url, error)
        }
      }

      if (activeBackfill) {
        await finishBackfillSourceBatch(
          activeBackfill.sourceId,
          activeBackfill.currentPage,
          activeBackfill.maxPage,
          listItems.length,
          activeBackfill.currentItemIndex,
          processedItemsOnPage,
        )
      }
    }

    await supabase.from('school_notification_crawl_runs').update({
      finished_at: new Date().toISOString(),
      status: 'success',
      crawled_count: counters.crawled,
      pdf_success_count: counters.pdfSuccess,
      ocr_count: counters.pdfOcr,
      failed_count: counters.pdfFailed,
      new_items: counters.newItems,
    }).eq('id', runId)

    console.log(JSON.stringify({ success: true, mode: options.mode, ...counters }, null, 2))
  } catch (error) {
    await supabase.from('school_notification_crawl_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    }).eq('id', runId)
    throw error
  }
}

if (import.meta.main) {
  requireEnv('SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  requireAnyEnv(['GEMINI_API_KEYS', 'GEMINI_API_KEY'])

  await runCrawler(readOptions())
}
