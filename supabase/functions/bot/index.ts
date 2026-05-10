// supabase/functions/bot/index.ts
import { Ratelimit } from 'https://esm.sh/@upstash/ratelimit@2.0.8'
import { Redis } from 'https://esm.sh/@upstash/redis@1.36.1'
import { corsHeaders } from '../_shared/cors.ts'

const keyPool = [
  Deno.env.get('GROQ_API_KEY'),
  Deno.env.get('GROQ_API_KEY_2'),
  Deno.env.get('GROQ_API_KEY_3'),
  Deno.env.get('GROQ_API_KEY_4'),
  Deno.env.get('GROQ_API_KEY_5'),
].filter(Boolean) as string[]

const getRandomKey = () => keyPool[Math.floor(Math.random() * keyPool.length)]

const redis = Deno.env.get('UPSTASH_REDIS_REST_URL') && Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
  ? new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
  })
  : null

const ratelimit = redis
  ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(15, '1 d'),
    analytics: true,
  })
  : null

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' },
    status,
  })

const callGroq = async (apiKey: string, message: string) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: 'Bạn là một API xử lý dữ liệu OCR. Nhiệm vụ duy nhất của bạn là trích xuất thông tin từ văn bản được cung cấp và trả về JSON hợp lệ. Không trả lời thêm lời dẫn hoặc giải thích.',
        },
        { role: 'user', content: message },
      ],
      model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })
  const responseText = await response.text()
  if (!response.ok) {
    const error: any = new Error(responseText || `Groq API error ${response.status}`)
    error.status = response.status
    error.body = responseText
    throw error
  }
  const payload = JSON.parse(responseText)
  return payload.choices?.[0]?.message?.content || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const rateHeaders: Record<string, string> = {}
    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') || '127.0.0.1'
      const { success, limit, remaining } = await ratelimit.limit(ip)
      rateHeaders['X-RateLimit-Limit'] = String(limit)
      rateHeaders['X-RateLimit-Remaining'] = String(remaining)
      if (!success) {
        return json({
          error: 'Too Many Requests',
          message: 'Bạn đã dùng hết lượt miễn phí trong ngày. Mai quay lại nhé.',
        }, 429, rateHeaders)
      }
    }

    const referer = req.headers.get('referer') || req.headers.get('referrer') || ''
    const origin = req.headers.get('origin') || ''
    const allowedDomains = ['hotrosinhvienhub.id.vn', 'localhost', '127.0.0.1']
    if (!allowedDomains.some((domain) => referer.includes(domain) || origin.includes(domain))) {
      return json({ error: 'Forbidden', message: 'Domain not allowed.' }, 403, rateHeaders)
    }

    const body = await req.json().catch(() => ({}))
    const { message } = body
    if (!message) return json({ error: 'Missing message' }, 400, rateHeaders)
    if (keyPool.length === 0) throw new Error('Chưa cấu hình GROQ_API_KEY.')

    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const reply = await callGroq(getRandomKey(), message)
        return json({ reply }, 200, rateHeaders)
      } catch (error) {
        console.error(`Bot attempt ${attempt + 1} failed:`, error)
        lastError = error
      }
    }

    if (lastError?.status === 429) {
      return json({ error: 'System Busy', message: 'Hệ thống đang quá tải, vui lòng thử lại sau vài phút.' }, 429, rateHeaders)
    }
    throw lastError || new Error('Không thể kết nối đến AI Server.')
  } catch (error) {
    console.error('Handler Error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
