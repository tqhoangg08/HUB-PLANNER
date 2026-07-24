// supabase/functions/event-candidates/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const INGEST_SECRET = String(Deno.env.get('EVENT_CANDIDATE_INGEST_SECRET') || '')
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
const allowedModeratorRoles = new Set(['admin', 'auditor'])

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
const normalizeBoolean = (value: unknown) => Boolean(value)
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
const normalizePoints = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null
  return String(value).trim()
}
const toIsoTimestamp = (value: unknown) => {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
const stripCodeFences = (text: string) => {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] || raw).trim()
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
Không xem recap, cảm ơn, chúc mừng, tuyển thành viên, thông báo kết quả, album ảnh sau chương trình là sự kiện.
Không bịa dữ liệu. Thiếu thì để null. Ngày YYYY-MM-DD. Giờ HH:mm:ss.
format chỉ dùng: Online, Offline, Hỗn hợp. location_type chỉ dùng: Trong trường, Ngoài trường.
category chỉ dùng một trong: ${EVENT_CATEGORIES.join(', ')}.
Trả về JSON object duy nhất, không markdown, đúng schema:
{"is_event":true,"confidence":0.87,"title":null,"organizer":null,"category":null,"criteria":null,"points":null,"format":null,"location_type":null,"classification":null,"event_date":null,"event_time":null,"deadline":null,"deadline_time":null,"registration_start_date":null,"registration_start_time":null,"link":null,"description":null,"reason":""}
Nguồn: ${candidate.source_name || ''}
Link: ${candidate.post_url || ''}
Nội dung:
${candidate.raw_content || ''}
`.trim()

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
      model: Deno.env.get('GROQ_EVENT_CANDIDATE_MODEL') || Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b',
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

const getActor = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user?.id) return null
  const userId = userData.user.id
  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (roleRow?.role) return { userId, role: String(roleRow.role).trim() }
  const { data: fallbackRoleRow } = await supabase.from('user_roles').select('role').eq('id', userId).maybeSingle()
  return { userId, role: String(fallbackRoleRow?.role || '').trim() }
}
const requireModerator = async (request: Request) => {
  const actor = await getActor(request)
  if (!actor || !allowedModeratorRoles.has(actor.role)) return null
  return actor
}

const getModeratorIds = async () => {
  const { data, error } = await supabase.from('user_roles').select('id, user_id, role').in('role', ['admin', 'auditor'])
  if (error) throw error
  return [...new Set((data || []).map((row: any) => row.user_id || row.id).filter(Boolean))]
}

const sendModeratorAlert = async ({ title, body, url = '/', actorId = null, content = body, type = 'system_alert' }: any) => {
  const receiverIds = await getModeratorIds()
  if (!receiverIds.length) return { notified: 0 }
  const cleanContent = normalizeText(content || body || title || 'Có thông báo mới')
  const cleanUrl = normalizeText(url || '/')
  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('receiver_id')
    .in('receiver_id', receiverIds)
    .eq('type', type)
    .eq('content', cleanContent)
    .eq('link', cleanUrl)
  if (existingError) throw existingError
  const existingReceivers = new Set((existingRows || []).map((row: any) => row.receiver_id))
  const rows = receiverIds
    .filter((receiverId) => !existingReceivers.has(receiverId))
    .map((receiverId) => ({ receiver_id: receiverId, actor_id: actorId, type, content: cleanContent, link: cleanUrl, is_read: false }))
  if (rows.length) {
    const { error } = await supabase.from('notifications').insert(rows)
    if (error) throw error
  }
  return { notified: rows.length }
}

const buildEventDraft = (candidate: any, aiResult: any = {}) => ({
  title: normalizeOptionalText(aiResult.title) || normalizeOptionalText(candidate.source_name) || 'Sự kiện mới',
  organizer: normalizeOptionalText(aiResult.organizer) || normalizeOptionalText(candidate.source_name),
  category: normalizeCategory(aiResult.category),
  criteria: normalizeOptionalText(aiResult.criteria) || 'III',
  points: normalizePoints(aiResult.points) || '3',
  format: normalizeOptionalText(aiResult.format) || 'Offline',
  link: normalizeOptionalText(aiResult.link) || normalizeOptionalText(candidate.post_url),
  image_url: normalizeOptionalText(aiResult.image_url) || normalizeOptionalText(candidate.image_url),
  location_type: normalizeOptionalText(aiResult.location_type) || 'Trong trường',
  classification: normalizeOptionalText(aiResult.classification),
  event_date: normalizeDate(aiResult.event_date),
  event_time: normalizeTime(aiResult.event_time),
  deadline: normalizeDate(aiResult.deadline),
  deadline_time: normalizeOptionalText(aiResult.deadline_time),
  description: normalizeOptionalText(candidate.raw_content) || normalizeOptionalText(aiResult.description),
  registration_start_date: normalizeDate(aiResult.registration_start_date),
  registration_start_time: normalizeTime(aiResult.registration_start_time),
  status: 'Đang diễn ra',
  is_manually_closed: false,
  is_deleted: false,
  close_on_full: false,
})

const getDuplicateCandidate = async (postUrl: string) => {
  const { data, error } = await supabase.from('event_candidates').select('*').eq('post_url', postUrl).order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data || null
}

const analyzeAndUpdateCandidate = async (candidate: any) => {
  const aiResult = await analyzeEventCandidate(candidate)
  const { data: updated, error } = await supabase
    .from('event_candidates')
    .update({ ai_is_event: aiResult.is_event, ai_confidence: aiResult.confidence, ai_reason: aiResult.reason, ai_result: aiResult })
    .eq('id', candidate.id)
    .select('*')
    .single()
  if (error) throw error
  return { candidate: updated, ai_result: aiResult }
}

const listCandidates = async (request: Request, params: URLSearchParams) => {
  const actor = await requireModerator(request)
  if (!actor) return json({ success: false, error: 'Unauthorized' }, 401)
  const status = String(params.get('review_status') || params.get('status') || 'pending').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(params.get('limit') || 50), 1), 200)
  const search = normalizeText(params.get('search'))
  const candidateId = normalizeText(params.get('id'))
  if (candidateId) {
    const { data, error } = await supabase.from('event_candidates').select('*').eq('id', candidateId).maybeSingle()
    if (error) throw error
    return json({ success: true, candidate: data || null })
  }
  let query = supabase.from('event_candidates').select('*').order('created_at', { ascending: false }).limit(limit)
  if (status && status !== 'all') query = query.eq('review_status', status)
  if (search) query = query.or(`source_name.ilike.%${search}%,post_url.ilike.%${search}%,raw_content.ilike.%${search}%`)
  const { data, error } = await query
  if (error) throw error
  return json({ success: true, candidates: data || [] })
}

const ingestCandidate = async (request: Request, body: any) => {
  const authHeader = String(request.headers.get('authorization') || '')
  if (!INGEST_SECRET || authHeader !== `Bearer ${INGEST_SECRET}`) return json({ success: false, error: 'Unauthorized' }, 401)
  const sourceName = normalizeText(body.source_name)
  const postUrl = normalizeText(body.post_url)
  const rawContent = normalizeText(body.raw_content)
  const imageUrl = body.image_url === null || body.image_url === undefined || body.image_url === '' ? null : normalizeText(body.image_url)
  if (!sourceName || !postUrl || !rawContent) return json({ success: false, error: 'source_name, post_url, raw_content là bắt buộc.' }, 400)

  const existing = await getDuplicateCandidate(postUrl)
  if (existing) {
    if (!existing.ai_result && normalizeText(existing.raw_content)) {
      try {
        const analyzed = await analyzeAndUpdateCandidate(existing)
        return json({ success: true, candidate: analyzed.candidate, ai_result: analyzed.ai_result, message: 'Candidate already exists', analyzed: true })
      } catch (error: any) {
        console.warn('Auto analyze existing candidate failed:', error?.details || error?.message || error)
        return json({ success: true, candidate: existing, message: 'Candidate already exists', analyzed: false, analyze_error: error?.message || 'Auto analyze failed', analyze_details: error?.details || null })
      }
    }
    return json({ success: true, candidate: existing, message: 'Candidate already exists' })
  }

  const { data, error } = await supabase
    .from('event_candidates')
    .insert([{
      source_name: sourceName,
      post_url: postUrl,
      raw_content: rawContent,
      image_url: imageUrl,
      review_status: 'pending',
      submitted_from: normalizeText(body.submitted_from) || 'chrome_extension',
      client_created_at: toIsoTimestamp(body.client_created_at),
    }])
    .select('*')
    .single()
  if (error) {
    if (String(error.code || '') === '23505') {
      const duplicate = await getDuplicateCandidate(postUrl)
      return json({ success: true, candidate: duplicate, message: 'Candidate already exists' })
    }
    throw error
  }

  let candidateForResponse = data
  let aiResult = null
  let analyzeError = null
  try {
    const analyzed = await analyzeAndUpdateCandidate(data)
    candidateForResponse = analyzed.candidate
    aiResult = analyzed.ai_result
  } catch (error: any) {
    analyzeError = { error: error?.message || 'Auto analyze failed', details: error?.details || null }
    console.warn('Auto analyze event candidate failed:', error?.details || error?.message || error)
  }

  sendModeratorAlert({
    title: 'Candidate sự kiện mới',
    body: `${sourceName} vừa gửi bài mới cần duyệt.`,
    url: '/admin/event-candidates',
    actorId: null,
    content: `${sourceName} vừa gửi bài mới cần duyệt.`,
  }).catch((error) => console.warn('Không gửi được alert moderator cho candidate mới:', error))

  return json({ success: true, candidate: candidateForResponse, ai_result: aiResult, analyzed: Boolean(aiResult), analyze_error: analyzeError }, 201)
}

const analyzeCandidateAction = async (request: Request, body: any, candidateIdOverride = '') => {
  const actor = await requireModerator(request)
  if (!actor) return json({ success: false, error: 'Unauthorized', details: 'Admin or auditor session is required to analyze event candidates.' }, 401)
  const candidateId = normalizeText(candidateIdOverride || body.id || body.candidate_id)
  if (!candidateId) return json({ success: false, error: 'Missing candidate id' }, 400)
  const { data: candidate, error } = await supabase.from('event_candidates').select('*').eq('id', candidateId).maybeSingle()
  if (error) throw error
  if (!candidate) return json({ success: false, error: 'Candidate not found' }, 404)
  if (!normalizeText(candidate.raw_content)) return json({ success: false, error: 'raw_content is empty', details: 'Candidate has no raw_content to analyze.' }, 400)
  try {
    const aiResult = await analyzeEventCandidate(candidate)
    const { data: updated, error: updateError } = await supabase
      .from('event_candidates')
      .update({ ai_is_event: aiResult.is_event, ai_confidence: aiResult.confidence, ai_reason: aiResult.reason, ai_result: aiResult })
      .eq('id', candidateId)
      .select('*')
      .single()
    if (updateError) throw updateError
    return json({ success: true, candidate: updated, ai_result: aiResult })
  } catch (error: any) {
    return json({ success: false, error: error?.message === 'Groq API error' ? 'Groq API error' : (error?.message || 'Analyze failed'), details: error?.details || null }, 500)
  }
}

const approveCandidateAction = async (request: Request, body: any) => {
  const actor = await requireModerator(request)
  if (!actor) return json({ success: false, error: 'Unauthorized' }, 401)
  const candidateId = normalizeText(body.id || body.candidate_id)
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : (body.event_draft && typeof body.event_draft === 'object' ? body.event_draft : {})
  if (!candidateId) return json({ success: false, error: 'Missing candidate id' }, 400)
  const { data: candidate, error } = await supabase.from('event_candidates').select('*').eq('id', candidateId).maybeSingle()
  if (error) throw error
  if (!candidate) return json({ success: false, error: 'Candidate not found' }, 404)
  if (candidate.review_status === 'approved' && candidate.approved_event_id) return json({ success: false, error: 'Candidate already approved' }, 409)
  let aiResult = candidate.ai_result
  if (typeof aiResult === 'string') {
    try { aiResult = JSON.parse(aiResult) } catch { aiResult = {} }
  }
  const mergedDraft = { ...buildEventDraft(candidate, aiResult || {}), ...draft }
  const eventPayload = {
    title: normalizeText(mergedDraft.title),
    organizer: normalizeOptionalText(mergedDraft.organizer),
    category: normalizeOptionalText(mergedDraft.category) || DEFAULT_EVENT_CATEGORY,
    criteria: normalizeOptionalText(mergedDraft.criteria) || 'III',
    points: normalizePoints(mergedDraft.points) || '3',
    format: normalizeOptionalText(mergedDraft.format) || 'Offline',
    link: normalizeOptionalText(mergedDraft.link) || normalizeText(candidate.post_url),
    image_url: normalizeOptionalText(mergedDraft.image_url) || normalizeOptionalText(candidate.image_url),
    location_type: normalizeOptionalText(mergedDraft.location_type) || 'Trong trường',
    classification: normalizeOptionalText(mergedDraft.classification),
    event_date: normalizeDate(mergedDraft.event_date),
    event_time: normalizeTime(mergedDraft.event_time),
    deadline: normalizeDate(mergedDraft.deadline),
    deadline_time: normalizeOptionalText(mergedDraft.deadline_time),
    description: normalizeOptionalText(mergedDraft.description) || normalizeOptionalText(candidate.raw_content),
    registration_start_date: normalizeDate(mergedDraft.registration_start_date),
    registration_start_time: normalizeTime(mergedDraft.registration_start_time),
    status: normalizeOptionalText(mergedDraft.status) || 'Đang diễn ra',
    is_manually_closed: normalizeBoolean(mergedDraft.is_manually_closed),
    is_deleted: false,
    close_on_full: normalizeBoolean(mergedDraft.close_on_full),
  }
  if (!eventPayload.title) return json({ success: false, error: 'Title là bắt buộc' }, 400)
  const { data: insertedEvent, error: insertError } = await supabase.from('events').insert([eventPayload]).select('*').single()
  if (insertError) throw insertError
  const { data: updatedCandidate, error: candidateUpdateError } = await supabase
    .from('event_candidates')
    .update({ review_status: 'approved', approved_event_id: insertedEvent.id, reviewed_at: new Date().toISOString() })
    .eq('id', candidateId)
    .select('*')
    .single()
  if (candidateUpdateError) {
    await supabase.from('events').delete().eq('id', insertedEvent.id)
    throw candidateUpdateError
  }
  return json({ success: true, candidate: updatedCandidate, event: insertedEvent })
}

const rejectCandidateAction = async (request: Request, body: any) => {
  const actor = await requireModerator(request)
  if (!actor) return json({ success: false, error: 'Unauthorized' }, 401)
  const candidateId = normalizeText(body.id || body.candidate_id)
  if (!candidateId) return json({ success: false, error: 'Missing candidate id' }, 400)
  const { data, error } = await supabase
    .from('event_candidates')
    .update({ review_status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', candidateId)
    .select('*')
    .single()
  if (error) throw error
  return json({ success: true, candidate: data })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  const url = new URL(req.url)
  try {
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
    if (req.method === 'GET') return await listCandidates(req, url.searchParams)
    if (req.method === 'POST') {
      const authHeader = String(req.headers.get('authorization') || '')
      if (authHeader === `Bearer ${INGEST_SECRET}`) return await ingestCandidate(req, body)
      const action = normalizeText(body.action)
      if (action === 'analyze') return await analyzeCandidateAction(req, body, normalizeText(url.searchParams.get('id')))
      if (action === 'approve') return await approveCandidateAction(req, body)
      if (action === 'reject') return await rejectCandidateAction(req, body)
      return json({ success: false, error: action ? 'Unknown action' : 'Missing action' }, 400)
    }
    return json({ success: false, error: 'Method not allowed' }, 405)
  } catch (error: any) {
    return json({ success: false, error: error?.message || 'Internal Server Error', details: error?.details || null }, 500)
  }
})
