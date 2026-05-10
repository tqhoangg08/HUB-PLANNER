// supabase/functions/event-candidates-analyze/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const EVENT_CATEGORIES = [
  'Hoạt động phong trào',
  'Minigame',
  'Tình nguyện',
  'Cuộc thi học thuật',
  'Cổ vũ',
  'Talkshow',
  'Tọa đàm',
  'Hội thảo',
  'Sự kiện offline',
  'Teambuilding',
  'Hoạt động thể thao',
  'Khác (Tự nhập)',
]
const DEFAULT_EVENT_CATEGORY = EVENT_CATEGORIES[0]
const allowedRoles = new Set(['admin', 'auditor'])

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const normalizeText = (value: unknown) => String(value || '').trim()
const normalizeOptionalText = (value: unknown) => {
  const text = normalizeText(value)
  return text ? text : null
}
const normalizeCategory = (value: unknown) => {
  const text = normalizeOptionalText(value)
  if (!text) return DEFAULT_EVENT_CATEGORY
  return EVENT_CATEGORIES.includes(text) ? text : DEFAULT_EVENT_CATEGORY
}
const normalizeDate = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}
const normalizeTime = (value: unknown) => {
  const text = normalizeText(value)
  if (!text) return null
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  return `${String(match[1]).padStart(2, '0')}:${String(match[2]).padStart(2, '0')}:${String(match[3] || '00').padStart(2, '0')}`
}
const cleanAiResult = (result: any) => {
  const safe = result && typeof result === 'object' ? result : {}
  return {
    is_event: Boolean(safe.is_event),
    confidence: Number.isFinite(Number(safe.confidence)) ? Math.max(0, Math.min(1, Number(safe.confidence))) : 0,
    title: normalizeOptionalText(safe.title),
    organizer: normalizeOptionalText(safe.organizer),
    category: normalizeCategory(safe.category),
    criteria: normalizeOptionalText(safe.criteria),
    points: safe.points === undefined || safe.points === null ? null : safe.points,
    format: normalizeOptionalText(safe.format),
    location_type: normalizeOptionalText(safe.location_type),
    classification: normalizeOptionalText(safe.classification),
    event_date: normalizeDate(safe.event_date),
    event_time: normalizeTime(safe.event_time),
    deadline: normalizeDate(safe.deadline),
    deadline_time: normalizeTime(safe.deadline_time),
    registration_start_date: normalizeDate(safe.registration_start_date),
    registration_start_time: normalizeTime(safe.registration_start_time),
    link: normalizeOptionalText(safe.link),
    description: normalizeOptionalText(safe.description),
    reason: normalizeOptionalText(safe.reason) || '',
  }
}

const buildPrompt = (candidate: any) => `
Bạn là hệ thống trích xuất sự kiện sinh viên từ bài đăng Facebook.

Nhiệm vụ:
- Xác định bài viết có phải sự kiện sắp/sẽ diễn ra không.
- Không xem recap, cảm ơn, chúc mừng, tuyển thành viên, thông báo kết quả, album ảnh sau chương trình là sự kiện.
- Nếu là sự kiện, trích xuất thông tin thành JSON.
- Không bịa dữ liệu. Thiếu thì để null.
- Ngày format YYYY-MM-DD.
- Giờ format HH:mm:ss.
- format chỉ dùng: Online, Offline, Hỗn hợp.
- location_type chỉ dùng: Trong trường, Ngoài trường.
- category chỉ dùng một trong: ${EVENT_CATEGORIES.join(', ')}.

Trả về JSON object duy nhất, không markdown:
{
  "is_event": boolean,
  "confidence": number,
  "title": string | null,
  "organizer": string | null,
  "category": string | null,
  "criteria": string | null,
  "points": number | null,
  "format": "Online" | "Offline" | "Hỗn hợp" | null,
  "location_type": "Trong trường" | "Ngoài trường" | null,
  "classification": string | null,
  "event_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm:ss" | null,
  "deadline": "YYYY-MM-DD" | null,
  "deadline_time": "HH:mm" | null,
  "registration_start_date": "YYYY-MM-DD" | null,
  "registration_start_time": "HH:mm:ss" | null,
  "link": string | null,
  "description": string | null,
  "reason": string
}

Nguồn: ${candidate.source_name || ''}
Link: ${candidate.post_url || ''}
Nội dung:
${candidate.raw_content || ''}
`.trim()

const stripCodeFences = (text: string) => {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] || raw).trim()
}

const groqKeys = () => [
  Deno.env.get('GROQ_API_KEY'),
  Deno.env.get('GROQ_API_KEY_2'),
  Deno.env.get('GROQ_API_KEY_3'),
  Deno.env.get('GROQ_API_KEY_4'),
  Deno.env.get('GROQ_API_KEY_5'),
  Deno.env.get('GROQ_CHAT_KEY'),
].filter(Boolean) as string[]

const analyzeEventCandidate = async (candidate: any) => {
  if (!normalizeText(candidate?.raw_content)) throw new Error('Raw content is empty')
  const keys = groqKeys()
  if (!keys.length) throw new Error('Missing GROQ_API_KEY')
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keys[Math.floor(Math.random() * keys.length)]}`,
    },
    body: JSON.stringify({
      model: Deno.env.get('GROQ_EVENT_CANDIDATE_MODEL') || Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are an event extraction engine. Always return valid JSON only.' },
        { role: 'user', content: buildPrompt(candidate) },
      ],
    }),
  })
  const responseText = await response.text()
  if (!response.ok) {
    const error: any = new Error('Groq API error')
    error.details = responseText
    throw error
  }
  const parsedResponse = JSON.parse(responseText)
  const content = parsedResponse?.choices?.[0]?.message?.content || ''
  try {
    return cleanAiResult(JSON.parse(stripCodeFences(content)))
  } catch {
    const error: any = new Error('Groq model output is not valid JSON')
    error.details = content
    throw error
  }
}

const getActorRole = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user?.id) return null
  const userId = userData.user.id
  const { data: primaryRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (primaryRole?.role) return String(primaryRole.role).trim()
  const { data: fallbackRole } = await supabase.from('user_roles').select('role').eq('id', userId).maybeSingle()
  return fallbackRole?.role ? String(fallbackRole.role).trim() : 'student'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  const role = await getActorRole(req)
  if (!role || !allowedRoles.has(role)) {
    return json({ success: false, error: 'Unauthorized', details: 'Admin or auditor session is required to analyze event candidates.' }, 401)
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return json({ success: false, error: 'Missing candidate id' }, 400)

  const { data: candidate, error: candidateError } = await supabase
    .from('event_candidates')
    .select('id, source_name, post_url, raw_content, image_url, ai_is_event, ai_confidence, ai_reason, ai_result')
    .eq('id', id)
    .maybeSingle()
  if (candidateError) return json({ success: false, error: 'Supabase query error', details: candidateError.message }, 500)
  if (!candidate) return json({ success: false, error: 'Candidate not found' }, 404)
  if (!normalizeText(candidate.raw_content)) return json({ success: false, error: 'raw_content is empty', details: 'Candidate has no raw_content to analyze' }, 400)

  try {
    const aiResult = await analyzeEventCandidate(candidate)
    const { data: updatedCandidate, error: updateError } = await supabase
      .from('event_candidates')
      .update({
        ai_is_event: aiResult.is_event,
        ai_confidence: aiResult.confidence,
        ai_reason: aiResult.reason,
        ai_result: aiResult,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (updateError) return json({ success: false, error: 'Supabase update error', details: updateError.message }, 500)
    return json({ success: true, candidate: updatedCandidate, ai_result: aiResult })
  } catch (error: any) {
    return json({
      success: false,
      error: error?.message === 'Groq API error' ? 'Groq API error' : (error?.message || 'Analyze failed'),
      details: error?.details || error?.stack || null,
    }, 500)
  }
})
