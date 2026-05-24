import { Ratelimit } from 'https://esm.sh/@upstash/ratelimit@2.0.8'
import { Redis } from 'https://esm.sh/@upstash/redis@1.36.1'
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

type Message = { role: string; content: string }

const splitKeys = (value = '') => value.split(',').map((key) => key.trim()).filter(Boolean)
const pickKey = (keys: string[]) => keys[Math.floor(Math.random() * keys.length)]
const cleanText = (value: unknown, max = 6000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const normalizeList = <T>(value: unknown, limit: number) => Array.isArray(value) ? value.slice(0, limit) as T[] : []

const readProviderOrder = () =>
  splitKeys(Deno.env.get('PRACTICE_AI_PROVIDER_ORDER') || Deno.env.get('EXAM_AI_PROVIDER_ORDER') || 'groq,deepinfra,openrouter,cerebras,openai')
    .map((provider) => provider.toLowerCase())

const sharedGroqKeys = [
  Deno.env.get('GROQ_API_KEY'),
  Deno.env.get('GROQ_API_KEY_2'),
  Deno.env.get('GROQ_API_KEY_3'),
  Deno.env.get('GROQ_API_KEY_4'),
  Deno.env.get('GROQ_API_KEY_5'),
].filter(Boolean).join(',')

const practiceGroqKeys = splitKeys(Deno.env.get('PRACTICE_GROQ_API_KEYS') || [
  Deno.env.get('PRACTICE_GROQ_API_KEY'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_2'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_3'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_4'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_5'),
].filter(Boolean).join(','))

const groqKeys = Deno.env.get('PRACTICE_USE_SHARED_GROQ_KEYS') === 'true'
  ? splitKeys(sharedGroqKeys)
  : practiceGroqKeys

const deepInfraKeys = splitKeys(Deno.env.get('PRACTICE_DEEPINFRA_API_KEYS') || [
  Deno.env.get('PRACTICE_DEEPINFRA_API_KEY'),
  Deno.env.get('PRACTICE_DEEPINFRA_API_KEY_2'),
  Deno.env.get('PRACTICE_DEEPINFRA_API_KEY_3'),
  Deno.env.get('PRACTICE_DEEPINFRA_API_KEY_4'),
  Deno.env.get('PRACTICE_DEEPINFRA_API_KEY_5'),
  Deno.env.get('DEEPINFRA_API_KEY'),
].filter(Boolean).join(','))

const openRouterKeys = splitKeys(Deno.env.get('PRACTICE_OPENROUTER_API_KEYS') || [
  Deno.env.get('PRACTICE_OPENROUTER_API_KEY'),
  Deno.env.get('PRACTICE_OPENROUTER_API_KEY_2'),
  Deno.env.get('PRACTICE_OPENROUTER_API_KEY_3'),
  Deno.env.get('PRACTICE_OPENROUTER_API_KEY_4'),
  Deno.env.get('PRACTICE_OPENROUTER_API_KEY_5'),
  Deno.env.get('OPENROUTER_API_KEY'),
].filter(Boolean).join(','))

const redis = Deno.env.get('UPSTASH_REDIS_REST_URL') && Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
  ? new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
  })
  : null

const ratelimit = redis
  ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(8, '1 h'),
    analytics: true,
  })
  : null

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' },
    status,
  })

const safeJsonParse = (text: string) => {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI khong tra ve JSON hop le.')
    return JSON.parse(match[0])
  }
}

const normalizePracticeSet = (payload: any, requestedCount: number) => {
  const title = cleanText(payload?.title, 180)
  const description = cleanText(payload?.description, 500)
  const questions = normalizeList<any>(payload?.questions, Math.min(Math.max(requestedCount, 5), 50))
    .map((item, index) => {
      const options = normalizeList<unknown>(item?.options, 4).map((option) => cleanText(option, 300)).filter(Boolean)
      return {
        question: cleanText(item?.question, 1000),
        options,
        correct_answer: cleanText(item?.correct_answer, 300),
        explanation: cleanText(item?.explanation, 1200),
        topic_tag: cleanText(item?.topic_tag, 120),
        position: index,
      }
    })
    .filter((item) => item.question && item.options.length >= 2 && item.correct_answer && item.explanation)

  if (!title || questions.length < Math.min(requestedCount, 5)) {
    throw new Error('AI tra ve bo de chua du noi dung.')
  }

  return { title, description, questions }
}

const buildMessages = (input: {
  subjectName: string
  courseCode: string
  topic: string
  difficulty: string
  questionCount: number
  sourceText: string
}): Message[] => [
  {
    role: 'system',
    content: [
      'Ban la he thong tao de trac nghiem on thi cho sinh vien dai hoc Viet Nam.',
      'Chi tra ve JSON hop le, khong markdown, khong giai thich ngoai JSON.',
      'Noi dung phai dung tieng Viet, dua vao tai lieu sinh vien cung cap. Neu tai lieu thieu, tao cau hoi tong quat nhung khong duoc bia so lieu/cu the.',
      'Moi cau hoi phai co 4 lua chon neu co the. correct_answer phai khop chinh xac mot gia tri trong options.',
      'JSON schema: { "title": string, "description": string, "questions": [{ "question": string, "options": string[], "correct_answer": string, "explanation": string, "topic_tag": string }] }',
    ].join('\n'),
  },
  {
    role: 'user',
    content: [
      `Mon hoc: ${input.subjectName}${input.courseCode ? ` (${input.courseCode})` : ''}`,
      `Pham vi/chu de: ${input.topic || 'Tong hop'}`,
      `So cau: ${input.questionCount}`,
      `Do kho: ${input.difficulty}`,
      input.sourceText
        ? `Tai lieu/de cuong/de thi sinh vien cung cap:\n${input.sourceText}`
        : 'Sinh vien khong cung cap tai lieu rieng. Hay tao bo de tong quat theo ten mon va chu de, dong thoi tranh hoi qua chi tiet ngoai kien thuc pho bien.',
    ].join('\n\n'),
  },
]

const callOpenAICompatible = async ({
  endpoint,
  apiKey,
  model,
  messages,
  extraHeaders = {},
}: {
  endpoint: string
  apiKey: string
  model: string
  messages: Message[]
  extraHeaders?: Record<string, string>
}) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.25,
      response_format: { type: 'json_object' },
    }),
  })

  const responseText = await response.text()
  let data: any = {}
  try {
    data = responseText ? JSON.parse(responseText) : {}
  } catch {
    data = { raw: responseText }
  }

  if (!response.ok) {
    const error: any = new Error(data?.error?.message || data?.message || responseText || `Provider error ${response.status}`)
    error.status = response.status
    throw error
  }

  return data?.choices?.[0]?.message?.content || ''
}

const providerConfigs = () => ({
  groq: {
    enabled: groqKeys.length > 0,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: groqKeys.length ? pickKey(groqKeys) : '',
    model: Deno.env.get('PRACTICE_AI_GROQ_MODEL') || Deno.env.get('EXAM_AI_GROQ_MODEL') || 'llama-3.3-70b-versatile',
    headers: {},
  },
  deepinfra: {
    enabled: deepInfraKeys.length > 0,
    endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions',
    apiKey: deepInfraKeys.length ? pickKey(deepInfraKeys) : '',
    model: Deno.env.get('PRACTICE_AI_DEEPINFRA_MODEL') || Deno.env.get('EXAM_AI_DEEPINFRA_MODEL') || 'Qwen/Qwen2.5-72B-Instruct',
    headers: {},
  },
  openrouter: {
    enabled: openRouterKeys.length > 0,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: openRouterKeys.length ? pickKey(openRouterKeys) : '',
    model: Deno.env.get('PRACTICE_AI_OPENROUTER_MODEL') || Deno.env.get('EXAM_AI_OPENROUTER_MODEL') || 'qwen/qwen-2.5-72b-instruct',
    headers: {
      'HTTP-Referer': 'https://hotrosinhvienhub.id.vn',
      'X-Title': 'HUB Planner Practice AI',
    },
  },
  cerebras: {
    enabled: Boolean(Deno.env.get('CEREBRAS_API_KEY')),
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    apiKey: Deno.env.get('CEREBRAS_API_KEY') || '',
    model: Deno.env.get('PRACTICE_AI_CEREBRAS_MODEL') || Deno.env.get('EXAM_AI_CEREBRAS_MODEL') || 'qwen-3-32b',
    headers: {},
  },
  openai: {
    enabled: Boolean(Deno.env.get('OPENAI_API_KEY')),
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: Deno.env.get('OPENAI_API_KEY') || '',
    model: Deno.env.get('PRACTICE_AI_OPENAI_MODEL') || Deno.env.get('EXAM_AI_OPENAI_MODEL') || 'gpt-4.1-mini',
    headers: {},
  },
})

const generateWithProvider = async (messages: Message[]) => {
  const errors: string[] = []
  const configs = providerConfigs()
  const order = readProviderOrder()
  let configuredProviderCount = 0

  for (const provider of order) {
    const config = configs[provider as keyof ReturnType<typeof providerConfigs>]
    if (!config) {
      errors.push(`${provider}: provider khong duoc ho tro`)
      continue
    }
    if (!config.enabled) continue
    configuredProviderCount += 1

    try {
      const content = await callOpenAICompatible({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        extraHeaders: config.headers,
      })
      return { content, provider, model: config.model }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (configuredProviderCount === 0) {
    throw new Error(`Chua cau hinh API key AI. Provider order hien tai: ${order.join(', ')}`)
  }
  throw new Error(errors.length ? errors.join(' | ') : 'Tat ca provider AI deu loi.')
}

const getRequestUser = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}

const savePracticeSet = async ({
  user,
  input,
  output,
  provider,
  model,
}: {
  user: any
  input: {
    subjectName: string
    courseCode: string
    topic: string
    difficulty: string
    sourceText: string
  }
  output: { title: string; description: string; questions: any[] }
  provider: string
  model: string
}) => {
  if (!user?.id) return null

  const { data: setRow, error: setError } = await supabase
    .from('practice_sets')
    .insert({
      owner_id: user.id,
      source_type: 'ai',
      subject_name: input.subjectName,
      course_code: input.courseCode || null,
      title: output.title,
      description: output.description,
      difficulty: input.difficulty,
      visibility: 'private',
      question_count: output.questions.length,
      source_text: input.sourceText || null,
      provider,
      model,
    })
    .select('id')
    .single()

  if (setError) {
    console.warn('Khong the luu practice set:', setError)
    return null
  }

  const setId = setRow.id
  const questions = output.questions.map((item) => ({ ...item, set_id: setId }))
  const { error: questionError } = await supabase.from('practice_questions').insert(questions)
  if (questionError) console.warn('Khong the luu questions:', questionError)

  return setId
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await getRequestUser(req)
    const rateHeaders: Record<string, string> = {}
    if (ratelimit) {
      const limiterKey = user?.id || req.headers.get('x-forwarded-for') || 'anonymous'
      const { success, limit, remaining } = await ratelimit.limit(`practice-ai:${limiterKey}`)
      rateHeaders['X-RateLimit-Limit'] = String(limit)
      rateHeaders['X-RateLimit-Remaining'] = String(remaining)
      if (!success) return json({ error: 'Ban da tao qua nhieu bo de trong 1 gio. Thu lai sau nhe.' }, 429, rateHeaders)
    }

    const body = await req.json().catch(() => ({}))
    const requestedCount = Math.min(Math.max(Number(body?.questionCount || 10), 5), 50)
    const input = {
      subjectName: cleanText(body?.subjectName, 160),
      courseCode: cleanText(body?.courseCode, 80),
      topic: cleanText(body?.topic || 'Tong hop', 800),
      difficulty: cleanText(body?.difficulty || 'medium', 40),
      questionCount: requestedCount,
      sourceText: cleanText(body?.sourceText, 9000),
    }

    if (!input.subjectName) {
      return json({ error: 'Can co ten mon hoc.' }, 400, rateHeaders)
    }

    const generated = await generateWithProvider(buildMessages(input))
    const output = normalizePracticeSet(safeJsonParse(generated.content), requestedCount)
    const setId = await savePracticeSet({ user, input, output, provider: generated.provider, model: generated.model })

    return json({
      setId,
      source_type: 'ai',
      subject_name: input.subjectName,
      course_code: input.courseCode,
      difficulty: input.difficulty,
      provider: generated.provider,
      model: generated.model,
      ...output,
    }, 200, rateHeaders)
  } catch (error) {
    console.error('Practice generate error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
