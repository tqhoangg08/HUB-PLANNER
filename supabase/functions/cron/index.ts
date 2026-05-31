// supabase/functions/cron/index.ts
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const ANNOUNCEMENT_PUSH_SPACING_MINUTES = 10

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

type Source = {
  id: string
  url: string
  type: 'old' | 'modern' | 'library'
  maxPages: number
}

type ScrapedItem = {
  title: string
  link: string
  date: string
  hasRealDate?: boolean
}

const chunkArray = <T>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_v, i) => arr.slice(i * size, i * size + size))

async function queueAnnouncementPushes(newItems: Array<{ id: string | number; title: string; link: string }>) {
  if (!newItems.length) return { queued: 0, skipped: true }

  const now = Date.now()
  const rows = newItems.map((item, index) => ({
    announcement_id: item.id,
    title: item.title,
    link: item.link,
    scheduled_at: new Date(now + index * ANNOUNCEMENT_PUSH_SPACING_MINUTES * 60 * 1000).toISOString(),
  }))

  const { error } = await supabase
    .from('school_announcement_push_queue')
    .upsert(rows, { onConflict: 'announcement_id' })

  if (error) {
    console.error('Cannot queue school announcement push:', error.message)
    return { queued: 0, error: error.message }
  }

  return { queued: rows.length, spacingMinutes: ANNOUNCEMENT_PUSH_SPACING_MINUTES }
}

function normalizeLink(rawLink: string | undefined, baseOrigin: string) {
  if (!rawLink) return null
  let link = rawLink.trim().replace(/\/$/, '')
  if (link.startsWith('javascript:')) return null

  if (link.startsWith('/')) link = `${baseOrigin}${link}`
  else if (!link.startsWith('http')) {
    if (link.includes('hub.edu.vn')) link = `https://${link}`
    else link = `${baseOrigin}/${link}`
  }

  return link.replace(/^http:\/\//i, 'https://')
}

function encodeOldAnnouncementTitle(title: string) {
  return btoa(encodeURIComponent(title))
}

async function scrapeSource(source: Source): Promise<ScrapedItem[]> {
  const pageUrls = [source.url]

  if (source.maxPages > 1) {
    if (source.type === 'modern') {
      const baseUrl = source.url.replace(/\/$/, '')
      for (let i = 2; i <= source.maxPages; i += 1) pageUrls.push(`${baseUrl}?trang=${i}`)
    } else if (source.type === 'library') {
      for (let i = 2; i <= source.maxPages; i += 1) pageUrls.push(`${source.url}&Page=${i}`)
    }
  }

  const fetchPromises = pageUrls.map(async (targetUrl) => {
    try {
      const res = await fetch(targetUrl)
      if (!res.ok) return []

      const html = await res.text()
      const $ = cheerio.load(html)
      const pageResults: ScrapedItem[] = []

      if (source.type === 'old') {
        $('a.titlenews').each((_index, element) => {
          const title = $(element).text().trim()
          const rawLink = $(element).attr('href')
          let dateText = $(element).parent().find('.lillenews').text().trim()
          dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim()

          let isoDate = new Date().toISOString().split('T')[0]
          let hasRealDate = false
          const parts = dateText.split('/')
          if (parts.length === 3) {
            isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
            hasRealDate = true
          }

          let finalLink = rawLink || ''
          if (rawLink?.startsWith('javascript:')) finalLink = `https://online.hub.edu.vn/#id=${encodeOldAnnouncementTitle(title)}`
          else if (rawLink && !rawLink.startsWith('http')) finalLink = `https://online.hub.edu.vn/${rawLink}`

          if (title && finalLink) pageResults.push({ title, link: finalLink, date: isoDate, hasRealDate })
        })
      } else if (source.type === 'modern') {
        const urlObj = new URL(source.url)
        const baseOrigin = urlObj.origin

        $('a').each((_index, element) => {
          const rawLink = $(element).attr('href')
          if (!rawLink || !rawLink.endsWith('.html')) return
          if (rawLink.includes('?trang=')) return

          let title = $(element).text().replace(/\s+/g, ' ').trim()
          if (!title) title = $(element).attr('title')?.trim() || ''
          if (!title) title = $(element).find('img').attr('alt')?.trim() || ''
          if (!title || title.length < 15) return

          const finalLink = normalizeLink(rawLink, baseOrigin)
          if (!finalLink) return

          let dateFound: string | null = null
          const cardContainer = $(element).closest('.notification-item, .news-item, article')
          if (cardContainer.length === 0) return

          const dayEl = cardContainer.find('.date .day')
          const monthYearEl = cardContainer.find('.date .month-year')
          if (dayEl.length > 0 && monthYearEl.length > 0) {
            const day = dayEl.text().trim().padStart(2, '0')
            const parts = monthYearEl.text().trim().split('.')
            if (parts.length === 2) dateFound = `${parts[1]}-${parts[0].padStart(2, '0')}-${day}`
          } else {
            const newsDateEl = cardContainer.find('.news-date')
            const match = newsDateEl.text().trim().match(/(\d{1,2})[\/\-.]+(\d{1,2})[\/\-.]+(\d{4})/)
            if (match) dateFound = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
          }

          if (!dateFound) {
            const match = cardContainer.text().replace(/\s+/g, ' ').trim().match(/\b(\d{1,2})[\s\/\-.]+(\d{1,2})[\s\/\-.]+(\d{4})\b/)
            if (match) dateFound = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
          }

          pageResults.push({
            title,
            link: finalLink,
            date: dateFound || new Date().toISOString().split('T')[0],
            hasRealDate: Boolean(dateFound),
          })
        })
      }

      return pageResults
    } catch (error) {
      console.warn('Scrape source failed:', targetUrl, error)
      return []
    }
  })

  const resultsArrays = await Promise.all(fetchPromises)
  return resultsArrays.flat()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  const url = new URL(req.url)
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
  const clientIp = req.headers.get('x-forwarded-for') || 'Unknown IP'
  const secret = url.searchParams.get('secret') || body.secret || req.headers.get('x-secret-key')

  if (secret !== Deno.env.get('MY_SECRET_SCRAPER_KEY')) {
    console.warn('Unauthorized cron access:', clientIp)
    return json({ success: false, error: 'Forbidden' }, 403)
  }

  try {
    const isDeepScrape = url.searchParams.get('deep') === 'true'
    const specificTarget = url.searchParams.get('target')

    let sources: Source[] = [
      { id: 'old', url: 'https://online.hub.edu.vn/', type: 'old', maxPages: 1 },
      { id: 'dbcl', url: 'https://phongktdbcl.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 14 : 1 },
      { id: 'scc', url: 'https://scc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 23 : 1 },
      { id: 'clc', url: 'https://clc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 60 : 1 },
      { id: 'hub_main', url: 'https://hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 40 : 1 },
      { id: 'daotao', url: 'https://phongdaotao.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 9 : 1 },
      { id: 'qlcntt', url: 'https://phongqlcntt.hub.edu.vn/tin-hoat-dong/thong-bao', type: 'modern', maxPages: isDeepScrape ? 2 : 1 },
      { id: 'tstt', url: 'https://phongtstt.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 2 : 1 },
      { id: 'tochuc', url: 'https://phongtochuc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 4 : 1 },
      { id: 'ketoan', url: 'https://phongketoan.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 3 : 1 },
    ]

    if (specificTarget) sources = sources.filter((source) => source.id === specificTarget)

    const scrapedArrays = await Promise.all(sources.map(scrapeSource))
    const allScrapedData = scrapedArrays.flat()
    if (allScrapedData.length === 0) return json({ success: true, message: 'No announcements found.' })

    const uniqueLinks = new Set<string>()
    const uniqueTitles = new Set<string>()
    const finalScrapedData: ScrapedItem[] = []

    allScrapedData.forEach((item) => {
      const normTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!uniqueLinks.has(item.link) && !uniqueTitles.has(normTitle)) {
        uniqueLinks.add(item.link)
        uniqueTitles.add(normTitle)
        finalScrapedData.push(item)
      }
    })

    const existingLinksSet = new Set<string>()
    const existingTitlesSet = new Set<string>()

    for (const chunk of chunkArray(finalScrapedData.map((item) => item.link), 300)) {
      const { data, error } = await supabase.from('school_announcements').select('link').in('link', chunk)
      if (!error && data) data.forEach((row: { link: string }) => existingLinksSet.add(row.link))
    }

    for (const chunk of chunkArray(finalScrapedData.map((item) => item.title.trim()), 300)) {
      const { data, error } = await supabase.from('school_announcements').select('title').in('title', chunk)
      if (!error && data) data.forEach((row: { title: string }) => existingTitlesSet.add(row.title.trim().toLowerCase().replace(/\s+/g, ' ')))
    }

    const recordsToInsert = finalScrapedData
      .filter((item) => {
        const normTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ')
        return !existingLinksSet.has(item.link) && !existingTitlesSet.has(normTitle)
      })
      .map((item) => ({
        title: item.title,
        link: item.link,
        date: item.date,
        is_new: true,
      }))

    let actualInsertedCount = 0
    const insertedRecords: Array<{ id: string | number; title: string; link: string }> = []

    for (const chunk of chunkArray(recordsToInsert, 50)) {
      const { data, error } = await supabase
        .from('school_announcements')
        .upsert(chunk, { onConflict: 'link', ignoreDuplicates: true })
        .select('id, title, link')

      if (error) {
        console.warn('Announcement batch insert skipped:', error.message)
        continue
      }

      const inserted = data || []
      actualInsertedCount += inserted.length
      insertedRecords.push(...inserted)
    }

    const pushQueueSummary = await queueAnnouncementPushes(insertedRecords)

    return json({
      success: true,
      pushQueue: pushQueueSummary,
      message: `Scanned ${sources.reduce((acc, curr) => acc + curr.maxPages, 0)} pages. Inserted ${actualInsertedCount} announcements.`,
    })
  } catch (error) {
    console.error('Cron failed:', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
