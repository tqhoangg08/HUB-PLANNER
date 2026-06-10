import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import {
  assertCrawlerSecret,
  chunkText,
  downloadPdf,
  embedText,
  extractHtmlNotificationText,
  extractPdfTextFromBytes,
  fetchHtml,
  getCrawlPlan,
  HUB_NOTIFICATION_SOURCES,
  json,
  parseNotificationDetail,
  scrapeNotificationList,
  sha256Hex,
  sleep,
  uploadPdfToR2,
  uploadTextToR2,
} from '../_shared/hub_notifications.ts'

const DEFAULT_BACKFILL_MAX_PAGE = 80
const STALE_RUNNING_PROGRESS_MS = 15 * 60 * 1000
const STALE_RUNNING_CRAWL_MS = 8 * 60 * 1000
const ACTIVE_CRAWL_LOCK_MS = 7 * 60 * 1000

function normalizeCrawlMode(mode: string) {
  if (['latest', 'recent', 'daily', 'backfill', 'backfill-auto'].includes(mode)) return 'auto'
  return mode || 'auto'
}

async function runDiagnostics() {
  const envPresent = {
    HUB_CRAWLER_SECRET: Boolean(Deno.env.get('HUB_CRAWLER_SECRET')),
    MY_SECRET_SCRAPER_KEY: Boolean(Deno.env.get('MY_SECRET_SCRAPER_KEY')),
    GEMINI_API_KEY: Boolean(Deno.env.get('GEMINI_API_KEY')),
    GEMINI_API_KEYS: Boolean(Deno.env.get('GEMINI_API_KEYS')),
    R2_ACCOUNT_ID: Boolean(Deno.env.get('R2_ACCOUNT_ID')),
    R2_BUCKET_NAME: Boolean(Deno.env.get('R2_BUCKET_NAME')),
    R2_ACCESS_KEY_ID: Boolean(Deno.env.get('R2_ACCESS_KEY_ID')),
    R2_SECRET_ACCESS_KEY: Boolean(Deno.env.get('R2_SECRET_ACCESS_KEY')),
  }

  const diagnostics: any = {
    success: true,
    mode: 'diagnostics',
    envPresent,
    r2: { ok: false as boolean, key: null as string | null, error: null as string | null },
    gemini: { ok: false as boolean, dimensions: 0, error: null as string | null },
  }

  try {
    const key = `diagnostics/hub-notification-crawler-${Date.now()}.txt`
    diagnostics.r2.key = await uploadTextToR2(key, `HUB notification crawler diagnostics ${new Date().toISOString()}`)
    diagnostics.r2.ok = Boolean(diagnostics.r2.key)
    if (!diagnostics.r2.ok) diagnostics.r2.error = 'R2 upload skipped because one or more R2 secrets are missing.'
  } catch (error) {
    diagnostics.r2.error = error instanceof Error ? error.message : String(error)
  }

  try {
    const embedding = await embedText('HUB notification crawler diagnostics', 'RETRIEVAL_DOCUMENT')
    diagnostics.gemini.ok = Array.isArray(embedding) && embedding.length > 0
    diagnostics.gemini.dimensions = Array.isArray(embedding) ? embedding.length : 0
  } catch (error) {
    diagnostics.gemini.error = error instanceof Error ? error.message : String(error)
  }

  return diagnostics
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

  return HUB_NOTIFICATION_SOURCES.find((source) => source.id === data.source_id)
    ? { source: HUB_NOTIFICATION_SOURCES.find((source) => source.id === data.source_id)!, progress: data }
    : null
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
      error_message: 'Recovered stale running crawl after worker timeout.',
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

  const { data: notification, error } = await supabase
    .from('school_notifications')
    .upsert({
      title: detail.title || item.title,
      department: item.department,
      published_date: detail.published_date || item.published_date,
      detail_url: item.detail_url,
      pdf_url: detail.pdf_url,
      pdf_file_path: null,
      extracted_text_file_path: null,
      extracted_text: null,
      extraction_method: null,
      extraction_status: null,
      extraction_error: null,
      content_hash: null,
      last_crawled_at: now,
      updated_at: now,
    }, { onConflict: 'detail_url' })
    .select('id, title, published_date, detail_url, pdf_url')
    .single()

  if (error) throw error

  await supabase.from('notification_chunks').delete().eq('notification_id', notification.id)

  return {
    status: 'success',
    method: 'link_only',
    chunkCount: 0,
    notification,
  }

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

      return {
        status: 'success',
        method: 'html_text',
        chunkCount: chunks.length,
        notification,
      }
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
    extraction = await extractPdfTextFromBytes(pdfBytes.slice())
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

  return {
    status: extraction.status,
    method: extraction.method,
    chunkCount,
    notification,
  }
}

async function runCrawler(req: Request, url: URL, body: Record<string, unknown>) {
  let runId: string | null = null

  try {
    assertCrawlerSecret(req, url, body)
    const requestedMode = url.searchParams.get('mode') || String(body.mode || 'auto')
    if (requestedMode === 'diagnostics') {
      return json(await runDiagnostics(), 200, corsHeaders)
    }
    const mode = normalizeCrawlMode(requestedMode)
    await recoverStaleCrawlRuns()
    const activeRun = await getActiveCrawlRun()
    if (activeRun) {
      return json({
        success: true,
        mode,
        requestedMode,
        skipped: true,
        reason: 'crawler_already_running',
        activeRunId: activeRun.id,
        activeRunStartedAt: activeRun.started_at,
      }, 202, corsHeaders)
    }

    const sourceId = url.searchParams.get('source') || String(body.source || '')
    const plan = getCrawlPlan(mode)
    const forceRecheckExisting = ['true', '1', 'yes'].includes(String(url.searchParams.get('force') || body.force || '').toLowerCase())
      ? true
      : plan.forceRecheckExisting
    const maxTotalItems = Math.max(1, Number(url.searchParams.get('maxItems') || body.maxItems || plan.maxTotalItems))
    let startPage = Math.max(1, Number(url.searchParams.get('startPage') || body.startPage || 1))
    let pages = Math.max(1, Number(url.searchParams.get('pages') || body.pages || plan.pagesPerSource))
    const backfillMaxPage = Math.max(1, Number(url.searchParams.get('maxPage') || body.maxPage || Deno.env.get('NOTIFICATION_BACKFILL_MAX_PAGE') || DEFAULT_BACKFILL_MAX_PAGE))
    let activeBackfill: { sourceId: string; currentPage: number; currentItemIndex: number; maxPage: number } | null = null
    let sources = sourceId
      ? HUB_NOTIFICATION_SOURCES.filter((source) => source.id === sourceId)
      : HUB_NOTIFICATION_SOURCES

    if (mode === 'auto') {
      const next = await getNextBackfillSource(backfillMaxPage)
      if (!next) {
        return json({ success: true, mode, requestedMode, message: 'Notification crawl completed. No pending source/page.' }, 200, corsHeaders)
      }
      sources = [next.source]
      startPage = next.progress.next_page
      pages = 1
      activeBackfill = {
        sourceId: next.source.id,
        currentPage: next.progress.next_page,
        currentItemIndex: Math.max(0, Number(next.progress.next_item_index || 0)),
        maxPage: next.progress.max_page || backfillMaxPage,
      }
    }

    const { data: run } = await supabase
      .from('school_notification_crawl_runs')
      .insert({ mode, started_at: new Date().toISOString(), status: 'running' })
      .select('id')
      .single()
    runId = run?.id || null

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

    for (const source of sources) {
      if (counters.crawled >= maxTotalItems) break
      let listItems = []
      try {
        listItems = await scrapeNotificationList(source, pages, startPage)
        counters.discovered += listItems.length
      } catch (error) {
        if (activeBackfill) await failBackfillSourcePage(activeBackfill.sourceId, error)
        throw error
      }

      const itemsToProcess = activeBackfill
        ? listItems.slice(activeBackfill.currentItemIndex)
        : listItems
      let processedItemsOnPage = 0

      for (const item of itemsToProcess) {
        if (counters.crawled >= maxTotalItems) break
        counters.examined += 1
        processedItemsOnPage += 1
        await sleep(plan.delayMs)
        try {
          const result = await processNotification(item, { ...plan, forceRecheckExisting })
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

    if (runId) {
      await supabase.from('school_notification_crawl_runs').update({
        finished_at: new Date().toISOString(),
        status: 'success',
        crawled_count: counters.crawled,
        pdf_success_count: counters.pdfSuccess,
        ocr_count: counters.pdfOcr,
        failed_count: counters.pdfFailed,
        new_items: counters.newItems,
      }).eq('id', runId)
    }

    return json({ success: true, mode, requestedMode, ...counters }, 200, corsHeaders)
  } catch (error) {
    if (runId) {
      await supabase.from('school_notification_crawl_runs').update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      }).eq('id', runId)
    }
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, (error as any)?.status || 500, corsHeaders)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (!['GET', 'POST'].includes(req.method)) return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders)

  const url = new URL(req.url)
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
  const runAsync = ['true', '1', 'yes'].includes(String(url.searchParams.get('async') || body.async || '').toLowerCase())

  if (runAsync) {
    try {
      assertCrawlerSecret(req, url, body)
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, (error as any)?.status || 500, corsHeaders)
    }

    const backgroundRun = runCrawler(req, url, body).catch((error) => {
      console.error('Async notification crawler failed:', error)
    })
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil
    if (typeof waitUntil === 'function') waitUntil(backgroundRun)
    else await backgroundRun

    return json({
      success: true,
      accepted: true,
      async: true,
      message: 'Notification crawler accepted and is running in the background.',
    }, 202, corsHeaders)
  }

  return await runCrawler(req, url, body)
})
