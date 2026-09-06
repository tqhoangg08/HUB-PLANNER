import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.2'

export type NotificationSource = {
  id: string
  department: string
  url: string
}

export type NotificationListItem = {
  title: string
  department: string
  published_date: string | null
  detail_url: string
}

export type NotificationDetail = {
  title?: string
  published_date: string | null
  pdf_url: string | null
}

export const HUB_NOTIFICATION_SOURCES: NotificationSource[] = [
  { id: 'hub_main', department: 'HUB', url: 'https://hub.edu.vn/thong-bao' },
  { id: 'daotao', department: 'Phong Dao tao', url: 'https://phongdaotao.hub.edu.vn/thong-bao' },
  { id: 'scc', department: 'Trung tam Sinh vien va Quan he doanh nghiep', url: 'https://scc.hub.edu.vn/thong-bao' },
  { id: 'clc', department: 'Ban quan ly Chuong trinh Chat luong cao', url: 'https://clc.hub.edu.vn/thong-bao' },
  { id: 'ktdbcl', department: 'Phong Khao thi va Dam bao chat luong', url: 'https://phongktdbcl.hub.edu.vn/thong-bao' },
  { id: 'qlcntt', department: 'Phòng Quản lý Công nghệ thông tin', url: 'https://phongqlcntt.hub.edu.vn/tin-hoat-dong/thong-bao' },
  { id: 'tstt', department: 'Phong Tuyen sinh truyen thong', url: 'https://phongtstt.hub.edu.vn/thong-bao' },
  { id: 'ketoan', department: 'Phong Ke toan', url: 'https://phongketoan.hub.edu.vn/thong-bao' },
]

const USER_AGENT = 'HUB-Planner-NotificationBot/1.0 (+https://hotrosinhvienhub.id.vn; PDF indexing for student Q&A)'
const REQUEST_TIMEOUT_MS = 20_000
const MIN_DIRECT_TEXT_LENGTH = 160
const DEFAULT_MAX_INLINE_OCR_BYTES = 4_500_000

const normalizeGeminiModel = (model: string | null | undefined) =>
  /^gemini-3\.1-flash-lite/.test(String(model || ''))
    ? 'gemini-3.5-flash-lite'
    : model

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export function assertCrawlerSecret(req: Request, url: URL, body: Record<string, unknown> = {}) {
  const provided = url.searchParams.get('secret')
    || req.headers.get('x-crawler-secret')
    || req.headers.get('x-secret-key')
    || String(body.secret || '')
  const expected = Deno.env.get('HUB_CRAWLER_SECRET') || Deno.env.get('MY_SECRET_SCRAPER_KEY')
  if (!expected || provided !== expected) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
}

export function getCrawlPlan(mode = 'latest') {
  if (mode === 'auto' || mode === 'backfill-auto' || mode === 'backfill' || mode === 'latest' || mode === 'recent' || mode === 'daily') {
    return { pagesPerSource: 1, maxItemsPerSource: 10, maxTotalItems: 5, forceRecheckExisting: false, delayMs: 1300, storeFullTextInDb: false }
  }
  return { pagesPerSource: 1, maxItemsPerSource: 1, maxTotalItems: 2, forceRecheckExisting: false, delayMs: 900 }
}

export function normalizeUrl(rawUrl: string | undefined | null, baseUrl: string) {
  if (!rawUrl) return null
  const cleaned = String(rawUrl).trim().replace(/&amp;/g, '&')
  if (!cleaned || cleaned.startsWith('javascript:') || cleaned.startsWith('mailto:') || cleaned.startsWith('tel:')) return null
  try {
    return new URL(cleaned, baseUrl).toString().replace(/^http:\/\//i, 'https://')
  } catch {
    return null
  }
}

export function parseVietnameseDate(text: string | undefined | null) {
  if (!text) return null
  const match = String(text).replace(/\s+/g, ' ').match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/)
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

async function fetchWithRetry(url: string, options: RequestInit & { timeoutMs?: number } = {}, retries = 2) {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          ...(options.headers || {}),
        },
      })
      clearTimeout(timeout)
      if (response.status >= 500 && attempt < retries) {
        await sleep(500 * (attempt + 1))
        continue
      }
      return response
    } catch (error) {
      clearTimeout(timeout)
      lastError = error
      if (attempt < retries) await sleep(500 * (attempt + 1))
    }
  }
  throw lastError
}

export async function fetchHtml(url: string) {
  const response = await fetchWithRetry(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi,en-US;q=0.8,en;q=0.6',
    },
  })
  if (!response.ok) throw new Error(`HTML request failed ${response.status}: ${url}`)
  return await response.text()
}

export async function downloadPdf(pdfUrl: string) {
  const response = await fetchWithRetry(pdfUrl, {
    headers: { Accept: 'application/pdf,application/octet-stream,*/*' },
    timeoutMs: 40_000,
  })
  if (!response.ok) throw new Error(`PDF download failed ${response.status}: ${pdfUrl}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const signature = new TextDecoder().decode(bytes.slice(0, 5))
  if (!signature.includes('%PDF')) throw new Error(`Downloaded file is not a PDF: ${pdfUrl}`)
  return bytes
}

function pageUrlForSource(source: NotificationSource, page: number) {
  if (page <= 1) return source.url
  const separator = source.url.includes('?') ? '&' : '?'
  return `${source.url.replace(/\/$/, '')}${separator}trang=${page}`
}

export async function scrapeNotificationList(source: NotificationSource, pages = 1, startPage = 1) {
  const results: NotificationListItem[] = []
  const firstPage = Math.max(1, startPage)
  const lastPage = firstPage + Math.max(1, pages) - 1
  for (let page = firstPage; page <= lastPage; page += 1) {
    const listUrl = pageUrlForSource(source, page)
    const html = await fetchHtml(listUrl)
    const $ = cheerio.load(html)
    const origin = new URL(source.url).origin

    $('a').each((_index, element) => {
      const detailUrl = normalizeUrl($(element).attr('href'), origin)
      if (!detailUrl || !detailUrl.includes('.html') || detailUrl.includes('?trang=')) return
      if (!new URL(detailUrl).pathname.toLowerCase().includes('/thong-bao')) return

      let title = $(element).text().replace(/\s+/g, ' ').trim()
      if (!title) title = $(element).attr('title')?.trim() || ''
      if (!title) title = $(element).find('img').attr('alt')?.trim() || ''
      if (!title || title.length < 12) return

      const card = $(element).closest('.notification-item, .news-item, article, .item, .post, li, .row')
      const contextText = (card.length ? card.text() : $(element).parent().text()).replace(/\s+/g, ' ')
      results.push({
        title,
        department: source.department,
        published_date: parseVietnameseDate(contextText),
        detail_url: detailUrl,
      })
    })
  }

  const seen = new Set<string>()
  return results.filter((item) => {
    const key = item.detail_url.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractPdfFromViewerUrl(rawUrl: string | undefined, baseUrl: string) {
  const absolute = normalizeUrl(rawUrl, baseUrl)
  if (!absolute) return null
  if (/\.pdf($|[?#])/i.test(absolute)) return absolute

  try {
    const url = new URL(absolute)
    for (const key of ['file', 'url', 'src', 'pdf']) {
      const value = url.searchParams.get(key)
      if (value && /\.pdf($|[?#])/i.test(value)) return normalizeUrl(value, absolute)
    }
  } catch {
    return null
  }
  return null
}

export function parseNotificationDetail(html: string, detailUrl: string, fallback: Partial<NotificationListItem> = {}): NotificationDetail {
  const $ = cheerio.load(html)
  const title = $('h1, .news-title, .entry-title, .post-title').first().text().replace(/\s+/g, ' ').trim()
    || $('title').first().text().replace(/\s+/g, ' ').trim()
    || fallback.title
  const pageText = $('body').text().replace(/\s+/g, ' ')
  const pdfCandidates = new Set<string>()

  $('iframe[src], embed[src], object[data], a[href]').each((_index, element) => {
    const raw = $(element).attr('src') || $(element).attr('data') || $(element).attr('href')
    const pdfUrl = extractPdfFromViewerUrl(raw, detailUrl)
    if (pdfUrl) pdfCandidates.add(pdfUrl)
  })

  const pdfRegex = /(?:https?:\/\/|\/|\.{1,2}\/)?[^"'<> )]+?\.pdf(?:\?[^"'<> )]*)?/gi
  for (const match of html.matchAll(pdfRegex)) {
    const pdfUrl = normalizeUrl(match[0], detailUrl)
    if (pdfUrl) pdfCandidates.add(pdfUrl)
  }

  return {
    title,
    published_date: parseVietnameseDate(pageText) || fallback.published_date || null,
    pdf_url: Array.from(pdfCandidates)[0] || null,
  }
}

export function extractHtmlNotificationText(html: string) {
  const $ = cheerio.load(html)
  $('script, style, nav, header, footer, iframe, embed, object, .social, .share, .breadcrumb, .breadcrumbs, .sidebar, .related, .latest, .newest, .news-new, .right, aside').remove()

  const candidates = [
    '.news-detail',
    '.detail-content',
    '.entry-content',
    '.post-content',
    '.content-detail',
    '.article-content',
    'article',
    'main',
  ]

  for (const selector of candidates) {
    const text = normalizeExtractedText($(selector).first().text())
    if (text.length >= 160) return text
  }

  const bodyText = normalizeExtractedText($('body').text())
  return bodyText
}

export async function extractPdfTextFromBytes(pdfBytes: Uint8Array) {
  let directText = ''
  let directTextLooksBroken = false
  try {
    const pdf = await getDocumentProxy(pdfBytes)
    const result = await extractText(pdf, { mergePages: true })
    directText = normalizeExtractedText(Array.isArray(result.text) ? result.text.join('\n\n') : result.text || '')
    directTextLooksBroken = looksLikeBrokenPdfText(directText)
  } catch (error) {
    console.warn('Direct PDF text extraction failed:', error)
  }

  if (directText.length >= MIN_DIRECT_TEXT_LENGTH && !directTextLooksBroken) {
    return { text: directText, method: 'pdf_text', status: 'success' as const }
  }

  const maxInlineOcrBytes = Number(Deno.env.get('NOTIFICATION_MAX_INLINE_OCR_BYTES') || DEFAULT_MAX_INLINE_OCR_BYTES)
  if (pdfBytes.byteLength > maxInlineOcrBytes) {
    return {
      text: '',
      method: 'pdf_text',
      status: 'need_review' as const,
      error: `PDF text is ${directTextLooksBroken ? 'corrupted' : 'not usable'} and file is too large for inline OCR in Edge Function (${pdfBytes.byteLength} bytes).`,
    }
  }

  let ocrText = ''
  let ocrError = ''
  try {
    ocrText = await extractPdfTextWithGoogleVision(pdfBytes)
  } catch (error) {
    ocrError = error instanceof Error ? error.message : String(error)
  }

  if (ocrText.length < MIN_DIRECT_TEXT_LENGTH || looksLikeBrokenPdfText(ocrText)) {
    try {
      const geminiText = await extractPdfTextWithGemini(pdfBytes)
      if (geminiText.length >= MIN_DIRECT_TEXT_LENGTH && !looksLikeBrokenPdfText(geminiText)) {
        return {
          text: geminiText,
          method: 'ocr',
          status: 'success' as const,
          error: ocrError ? `Google Vision OCR failed; extracted with Gemini PDF OCR. ${ocrError}` : 'Extracted with Gemini PDF OCR.',
        }
      }
      if (geminiText.length > 0) {
        ocrError = [ocrError, 'Gemini PDF OCR returned too little or corrupted text.'].filter(Boolean).join(' ')
      }
    } catch (error) {
      ocrError = [ocrError, `Gemini PDF OCR failed. ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join(' ')
    }
  }

  if (ocrText.length >= MIN_DIRECT_TEXT_LENGTH) return { text: ocrText, method: 'ocr', status: 'success' as const }

  if (directText.length >= MIN_DIRECT_TEXT_LENGTH && !directTextLooksBroken) {
    return {
      text: directText,
      method: 'pdf_text',
      status: 'success' as const,
      error: ocrError ? `OCR fallback failed; saved direct PDF text. ${ocrError}` : 'OCR fallback returned too little text; saved direct PDF text.',
    }
  }

  if (directText.length > 0 && !directTextLooksBroken) {
    return {
      text: directText,
      method: 'pdf_text',
      status: 'need_review' as const,
      error: ocrError ? `OCR fallback failed; direct PDF text is short. ${ocrError}` : 'OCR fallback returned too little text; direct PDF text is short.',
    }
  }

  return {
    text: '',
    method: ocrText ? 'ocr' : 'pdf_text',
    status: directTextLooksBroken ? 'need_review' as const : 'failed' as const,
    error: directTextLooksBroken
      ? `Direct PDF text looks corrupted. ${ocrError || 'OCR returned too little text.'}`
      : (ocrError || 'No usable text extracted from PDF.'),
  }
}

async function extractPdfTextWithGoogleVision(pdfBytes: Uint8Array) {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY')
  if (!apiKey) return ''

  const response = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        inputConfig: {
          mimeType: 'application/pdf',
          content: bytesToBase64(pdfBytes),
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['vi', 'en'] },
      }],
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Vision OCR failed ${response.status}`)
  const responses = payload.responses?.[0]?.responses || []
  return normalizeExtractedText(responses.map((page: any) => page.fullTextAnnotation?.text || '').filter(Boolean).join('\n\n'))
}

async function extractPdfTextWithGemini(pdfBytes: Uint8Array) {
  const key = pickGeminiKey()
  const model = normalizeGeminiModel(Deno.env.get('GEMINI_PDF_OCR_MODEL') || Deno.env.get('GEMINI_CHAT_MODEL')) || 'gemini-2.5-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          {
            text: [
              'Trích xuất toàn bộ văn bản có thể đọc được trong PDF thông báo này.',
              'Trả về văn bản thuần túy, giữ tiếng Việt có dấu, giữ số thông báo, ngày tháng, số tiền, địa điểm.',
              'Không tóm tắt, không giải thích, không thêm nội dung không có trong PDF.',
              'Neu mot doan khong doc duoc thi bo qua doan do.',
            ].join('\n'),
          },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: bytesToBase64(pdfBytes),
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini PDF OCR failed ${response.status}`)
  return normalizeExtractedText(payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n') || '')
}

export function normalizeExtractedText(text: string) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function looksLikeBrokenPdfText(text: string) {
  const sample = text.slice(0, 3000)
  const alphaWords = sample.match(/\b[\p{L}\d]{4,}\b/gu) || []
  const digitInsideWords = alphaWords.filter((word) => /[\p{L}]\d|\d[\p{L}]/u.test(word)).length
  const digitNoiseRatio = alphaWords.length ? digitInsideWords / alphaWords.length : 0
  const hasVietnameseMarks = /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(sample)
  const obviousOcrLayerNoise = /\b(FIANG|NIJOC|DAr|HEC|DQc|phric|gi6y|chring|tl6nh|hgc)\b/i.test(sample)
  return obviousOcrLayerNoise || digitNoiseRatio > 0.04 || (!hasVietnameseMarks && digitNoiseRatio > 0.015)
}

export function chunkText(text: string, { minWords = 350, maxWords = 800, overlapWords = 80 } = {}) {
  const words = normalizeExtractedText(text).split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let start = 0
  while (start < words.length) {
    let end = Math.min(start + maxWords, words.length)
    if (end < words.length) {
      for (let i = end; i > start + minWords; i -= 1) {
        if (/[.!?;:]$/.test(words[i - 1])) {
          end = i
          break
        }
      }
    }
    chunks.push(words.slice(start, end).join(' '))
    if (end >= words.length) break
    start = Math.max(0, end - overlapWords)
  }
  return chunks
}

export async function sha256Hex(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getGeminiKeys() {
  const keys = (Deno.env.get('GEMINI_API_KEYS') || Deno.env.get('GEMINI_API_KEY') || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
  if (keys.length === 0) throw new Error('Missing GEMINI_API_KEY or GEMINI_API_KEYS')
  return keys
}

function pickGeminiKey() {
  const keys = getGeminiKeys()
  return keys[Math.floor(Math.random() * keys.length)]
}

export async function embedText(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') {
  const key = pickGeminiKey()
  const model = Deno.env.get('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-001'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, taskType === 'RETRIEVAL_QUERY' ? 8000 : 18000) }] },
      taskType,
      outputDimensionality: 768,
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini embedding failed ${response.status}`)
  return payload.embedding?.values || []
}

export async function generateGroundedAnswer(question: string, chunks: any[]) {
  const key = pickGeminiKey()
  const model = normalizeGeminiModel(Deno.env.get('GEMINI_CHAT_MODEL')) || 'gemini-2.5-flash'
  const context = chunks.map((chunk, index) => [
    `[${index + 1}] ${chunk.title}`,
    `Ngay dang: ${chunk.published_date || 'khong ro'}`,
    `Nguon: ${chunk.detail_url}`,
    `PDF: ${chunk.pdf_url || 'khong co'}`,
    chunk.chunk_text,
  ].join('\n')).join('\n\n---\n\n')

  const systemPrompt = `Bạn là trợ lý thông báo sinh viên HUB.
Bạn chỉ được trả lời dựa trên các đoạn thông báo chính thức được hệ thống cung cấp.
Không được tự suy đoán, không được bịa deadline, ngày tháng, quy định, địa điểm hoặc đối tượng áp dụng.
Nếu dữ liệu không đủ rõ, hãy nói rằng chưa tìm thấy thông báo chính thức hoặc cần xem thêm link nguồn.
Khi trả lời, luôn nêu:
- tên thông báo
- ngày đăng
- nội dung trả lời ngắn gọn, dễ hiểu
- link nguồn gốc từ website HUB`

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Câu hỏi của sinh viên:\n${question}\n\nNgữ cảnh thông báo chính thức:\n${context}` }],
      }],
      generationConfig: { temperature: 0.1 },
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini chat failed ${response.status}`)
  return payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
  }
  return btoa(binary)
}

function encodeR2Path(key: string) {
  return key.split('/').map(encodeURIComponent).join('/')
}

async function hmacSha256(key: Uint8Array | string, value: string) {
  const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)))
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function uploadPdfToR2(key: string, body: Uint8Array) {
  return await uploadObjectToR2(key, body, 'application/pdf')
}

export async function uploadTextToR2(key: string, text: string) {
  return await uploadObjectToR2(key, new TextEncoder().encode(text), 'text/plain; charset=utf-8')
}

async function uploadObjectToR2(key: string, body: Uint8Array, contentType: string) {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const bucket = Deno.env.get('R2_BUCKET_NAME')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null

  const host = `${accountId}.r2.cloudflarestorage.com`
  const encodedKey = encodeR2Path(key)
  const path = `/${bucket}/${encodedKey}`
  const url = `https://${host}${path}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const payloadHash = await sha256Hex(body)
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`R2 upload failed ${response.status}. ${detail}`.trim())
  }

  return key
}
