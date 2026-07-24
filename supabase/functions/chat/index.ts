// supabase/functions/chat/index.ts
import { Ratelimit } from 'https://esm.sh/@upstash/ratelimit@2.0.8'
import { Redis } from 'https://esm.sh/@upstash/redis@1.36.1'
import { corsHeaders, getCorsHeaders, isAllowedCorsOrigin } from '../_shared/cors.ts'

const keyPool = [
  Deno.env.get('GROQ_API_KEY'),
  Deno.env.get('GROQ_API_KEY_2'),
  Deno.env.get('GROQ_API_KEY_3'),
  Deno.env.get('GROQ_API_KEY_4'),
  Deno.env.get('GROQ_API_KEY_5'),
].filter(Boolean) as string[]

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
          content: 'Bạn là một API xử lý dữ liệu OCR. Nhiệm vụ duy nhất là trích xuất thông tin từ văn bản được cung cấp và trả về JSON hợp lệ. Không trả lời thêm lời dẫn hoặc giải thích.',
        },
        { role: 'user', content: message },
      ],
      model: Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b',
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
      max_completion_tokens: 4096,
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
  const choice = payload.choices?.[0]
  if (choice?.finish_reason === 'length') {
    const error: any = new Error('Groq đã dừng vì hết giới hạn output trước khi trích xuất xong toàn bộ dữ liệu.')
    error.status = 422
    throw error
  }
  return choice?.message?.content || ''
}

Deno.serve(async (req) => {
  const requestCorsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: requestCorsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, requestCorsHeaders)
  }

  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1'
    const rateHeaders: Record<string, string> = { ...requestCorsHeaders }
    if (!isAllowedCorsOrigin(req)) {
      return json({ error: 'Forbidden', message: 'Origin not allowed.' }, 403, rateHeaders)
    }

    if (ratelimit) {
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
    const allowedDomains = ['hotrosinhvienhub.id.vn', 'localhost:3000']
    if (!allowedDomains.some((domain) => referer.includes(domain) || origin.includes(domain))) {
      return json({ error: 'Forbidden', message: 'Domain not allowed.' }, 403, rateHeaders)
    }

    const body = await req.json().catch(() => ({}))
    if (!body?.message) {
      return json({ error: 'Missing message' }, 400, rateHeaders)
    }
    if (keyPool.length === 0) {
      throw new Error('Chưa cấu hình GROQ_API_KEY.')
    }

    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const apiKey = keyPool[Math.floor(Math.random() * keyPool.length)]
        const reply = await callGroq(apiKey, body.message)
        return json({ reply }, 200, rateHeaders)
      } catch (error) {
        lastError = error
        console.error(`Chat attempt ${attempt + 1} failed:`, error)
        if ((error as any)?.status === 422) break
      }
    }

    if (lastError?.status === 429) {
      return json({ error: 'System Busy', message: 'Hệ thống đang quá tải, vui lòng thử lại sau vài phút.' }, 429, rateHeaders)
    }
    if (lastError?.status === 422) {
      return json({
        error: 'Incomplete AI response',
        message: 'Dữ liệu PDF quá dài nên hệ thống chưa đọc hết. Vui lòng thử lại hoặc chia PDF thành các phần nhỏ hơn.',
      }, 422, rateHeaders)
    }
    throw lastError || new Error('Không thể kết nối AI Server.')
  } catch (error) {
    console.error('Handler Error:', error)
    return json({
      error: 'Internal Server Error',
      message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.',
    }, 500)
  }
})
