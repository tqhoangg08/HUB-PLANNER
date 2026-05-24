import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { embedText, generateGroundedAnswer, json } from '../_shared/hub_notifications.ts'

const fallbackReply = 'Hiện mình chưa tìm thấy thông báo chính thức liên quan đến nội dung này.'

function buildKeywordQuery(question: string) {
  return question
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s/-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .slice(0, 8)
    .join(' ')
}

async function findUnindexedNotifications(question: string) {
  const keywordQuery = buildKeywordQuery(question)
  let query = supabase
    .from('school_notifications')
    .select('title, published_date, detail_url, pdf_url, extraction_status, extraction_error')
    .in('extraction_status', ['failed', 'need_review'])
    .order('published_date', { ascending: false, nullsFirst: false })
    .limit(5)

  if (keywordQuery) query = query.textSearch('title', keywordQuery, { type: 'websearch', config: 'simple' })

  const { data, error } = await query
  if (error) {
    console.warn('Failed to search unindexed notifications:', error)
    return []
  }
  return data || []
}

function buildUnindexedReply(notifications: any[]) {
  const lines = notifications.slice(0, 3).map((item, index) => {
    const date = item.published_date ? ` (${item.published_date})` : ''
    const url = item.pdf_url || item.detail_url
    return `${index + 1}. ${item.title}${date}\nNguồn gốc: ${url}`
  })

  return [
    'Mình tìm thấy thông báo có vẻ liên quan, nhưng hệ thống chưa đọc được nội dung PDF đủ tin cậy để trích dẫn tự động.',
    'Bạn nên mở link gốc để xem nội dung chính thức:',
    ...lines,
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders)

  try {
    const body = await req.json().catch(() => ({}))
    const question = String(body.question || body.message || '').trim()
    if (!question) return json({ error: 'Missing question' }, 400, corsHeaders)

    const queryEmbedding = await embedText(question, 'RETRIEVAL_QUERY')
    const { data: chunks, error } = await supabase.rpc('match_notification_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: Number(Deno.env.get('NOTIFICATION_MATCH_THRESHOLD') || 0.58),
      match_count: Number(Deno.env.get('NOTIFICATION_MATCH_COUNT') || 8),
    })
    if (error) throw error

    if (!chunks || chunks.length === 0) {
      const unindexedNotifications = await findUnindexedNotifications(question)
      if (unindexedNotifications.length > 0) {
        return json({
          reply: buildUnindexedReply(unindexedNotifications),
          sources: unindexedNotifications.map((item: any) => ({
            title: item.title,
            published_date: item.published_date,
            detail_url: item.detail_url,
            pdf_url: item.pdf_url,
            extraction_status: item.extraction_status,
          })),
        }, 200, corsHeaders)
      }

      return json({ reply: fallbackReply, sources: [] }, 200, corsHeaders)
    }

    const reply = await generateGroundedAnswer(question, chunks)
    return json({
      reply: reply || fallbackReply,
      sources: chunks.map((chunk: any) => ({
        title: chunk.title,
        published_date: chunk.published_date,
        detail_url: chunk.detail_url,
        pdf_url: chunk.pdf_url,
        similarity: chunk.similarity,
      })),
    }, 200, corsHeaders)
  } catch (error) {
    console.error('hub-notification-chat failed:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, corsHeaders)
  }
})
