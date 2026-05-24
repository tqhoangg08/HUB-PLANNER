import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

type Message = { role: string; content: string }

const STORAGE_BUCKET = 'practice-sets'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const textEncoder = new TextEncoder()
const splitKeys = (value = '') => value.split(',').map((key) => key.trim()).filter(Boolean)
const cleanText = (value: unknown, max = 12000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (value: string | Uint8Array) => {
  const data = typeof value === 'string' ? textEncoder.encode(value) : value
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

const slugify = (value: string) => cleanText(value, 120)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || 'bo-de'

const getRequestUser = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}

const assertCanImport = async (userId: string) => {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .maybeSingle()

  const role = String(data?.role || '').toLowerCase()
  if (!['admin', 'ctv'].includes(role)) {
    const error: any = new Error('Ban khong co quyen them bo de.')
    error.status = 403
    throw error
  }
  return role
}

const groqKeys = () => splitKeys(Deno.env.get('PRACTICE_GROQ_API_KEYS') || [
  Deno.env.get('PRACTICE_GROQ_API_KEY'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_2'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_3'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_4'),
  Deno.env.get('PRACTICE_GROQ_API_KEY_5'),
  Deno.env.get('GROQ_API_KEY'),
  Deno.env.get('GROQ_API_KEY_2'),
  Deno.env.get('GROQ_API_KEY_3'),
  Deno.env.get('GROQ_API_KEY_4'),
  Deno.env.get('GROQ_API_KEY_5'),
].filter(Boolean).join(','))

const safeJsonParse = (text: string) => {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI did not return valid JSON.')
    return JSON.parse(match[0])
  }
}

const normalizeGeneratedQuiz = (payload: any, fallbackTitle: string, maxQuestions: number) => {
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : []
  const limitedQuestions = maxQuestions > 0 ? rawQuestions.slice(0, maxQuestions) : rawQuestions
  const questions = limitedQuestions.map((item: any, index: number) => {
    const options = item?.options && typeof item.options === 'object' && !Array.isArray(item.options)
      ? item.options
      : Object.fromEntries((Array.isArray(item?.options) ? item.options : []).slice(0, 6).map((value: unknown, optionIndex: number) => [
        ['A', 'B', 'C', 'D', 'E', 'F'][optionIndex],
        cleanText(value, 700),
      ]))

    const normalizedOptions = Object.fromEntries(
      Object.entries(options)
        .slice(0, 6)
        .map(([key, value]) => [String(key).trim().toUpperCase().slice(0, 1), cleanText(value, 700)])
        .filter(([key, value]) => key && value),
    )

    return {
      id: cleanText(item?.id, 40) || `q${index + 1}`,
      question: cleanText(item?.question, 1600),
      options: normalizedOptions,
      correctAnswer: cleanText(item?.correctAnswer || item?.correct_answer, 20).trim().toUpperCase().slice(0, 1),
      explanation: cleanText(item?.explanation, 1600),
      topicTag: cleanText(item?.topicTag || item?.topic_tag, 120),
    }
  }).filter((item: any) => {
    const optionKeys = Object.keys(item.options)
    return item.question && optionKeys.length >= 2 && optionKeys.includes(item.correctAnswer)
  })

  if (!questions.length) {
    throw new Error('Khong trich xuat duoc cau hoi trac nghiem hop le. Kiem tra PDF co dap an hoac text ro khong.')
  }

  return {
    quizId: cleanText(payload?.quizId, 80) || slugify(fallbackTitle),
    title: cleanText(payload?.title, 180) || fallbackTitle,
    questions,
  }
}

const buildMessages = (input: {
  subjectName: string
  courseCode: string
  chapterTitle: string
  title: string
  sourceText: string
  maxQuestions: number
}): Message[] => [
  {
    role: 'system',
    content: [
      'You extract an existing Vietnamese university multiple-choice exam PDF into clean JSON.',
      'The PDF is already an exam/question set. Do not create new questions. Do not rewrite difficulty. Do not add questions that are not in the source.',
      'Keep the original question order and wording as closely as possible.',
      'Extract answer choices exactly. Preserve option labels A, B, C, D, and E/F if present.',
      'Use the answer key from the PDF when present. If the source has no answer key for a question, omit that question instead of guessing.',
      'Only return valid JSON. No markdown.',
      'Required schema: { "quizId": string, "title": string, "questions": [{ "id": string, "question": string, "options": { "A": string, "B": string, "C": string, "D": string }, "correctAnswer": "A|B|C|D|E|F", "explanation": string, "topicTag": string }] }',
      'explanation can be a short reason copied/inferred from the provided answer key; if none is available, use an empty string.',
    ].join('\n'),
  },
  {
    role: 'user',
    content: [
      `Subject: ${input.subjectName}${input.courseCode ? ` (${input.courseCode})` : ''}`,
      `Chapter/scope: ${input.chapterTitle || 'not specified'}`,
      `Set title: ${input.title}`,
      input.maxQuestions > 0 ? `Extract at most ${input.maxQuestions} questions from the source.` : 'Extract all valid multiple-choice questions from the source.',
      `PDF text:\n${input.sourceText}`,
    ].join('\n\n'),
  },
]

const generateQuiz = async (messages: Message[]) => {
  const keys = groqKeys()
  if (!keys.length) throw new Error('Missing GROQ_API_KEY or PRACTICE_GROQ_API_KEYS.')
  const errors: string[] = []
  const model = Deno.env.get('PRACTICE_IMPORT_GROQ_MODEL') || Deno.env.get('PRACTICE_AI_GROQ_MODEL') || 'llama-3.3-70b-versatile'

  for (const key of [...keys].sort(() => Math.random() - 0.5)) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      })
      const responseText = await response.text()
      const data = responseText ? JSON.parse(responseText) : {}
      if (!response.ok) throw new Error(data?.error?.message || responseText || `Groq error ${response.status}`)
      return { content: data?.choices?.[0]?.message?.content || '', provider: 'groq', model }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new Error(errors.join(' | ') || 'All Groq keys failed.')
}

const normalizeMetadata = (body: any) => {
  const subjectName = cleanText(body.subjectName, 160)
  const courseCode = cleanText(body.courseCode, 80)
  const chapterTitle = cleanText(body.chapterTitle, 160)
  const chapterCode = slugify(body.chapterCode || chapterTitle || 'tong-hop')
  const title = cleanText(body.title, 180) || `${subjectName} - ${chapterTitle || 'Bo de'}`
  const description = cleanText(body.description, 500)
  const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium'
  const visibility = ['public', 'private', 'pro'].includes(body.visibility) ? body.visibility : 'public'
  const maxQuestions = Math.min(Math.max(Number(body.questionCount || 0), 0), 200)
  if (!subjectName) throw new Error('Thieu ten mon hoc.')
  return { subjectName, courseCode, chapterTitle, chapterCode, title, description, difficulty, visibility, maxQuestions }
}

const normalizeEditableQuiz = (body: any) => {
  const quiz = body?.quiz || {}
  const questions = Array.isArray(quiz.questions) ? quiz.questions.map((item: any, index: number) => {
    const options = item?.options && typeof item.options === 'object' && !Array.isArray(item.options) ? item.options : {}
    const normalizedOptions = Object.fromEntries(
      Object.entries(options)
        .slice(0, 6)
        .map(([key, value]) => [String(key).trim().toUpperCase().slice(0, 1), cleanText(value, 900)])
        .filter(([key, value]) => key && value),
    )
    return {
      id: cleanText(item?.id, 40) || `q${index + 1}`,
      question: cleanText(item?.question, 2000),
      options: normalizedOptions,
      correctAnswer: cleanText(item?.correctAnswer || item?.correct_answer, 20).trim().toUpperCase().slice(0, 1),
      explanation: cleanText(item?.explanation, 2000),
      topicTag: cleanText(item?.topicTag || item?.topic_tag, 120),
    }
  }).filter((item: any) => {
    const optionKeys = Object.keys(item.options)
    return item.question && optionKeys.length >= 2 && optionKeys.includes(item.correctAnswer)
  }) : []

  if (!questions.length) throw new Error('Quiz phai co it nhat 1 cau hoi hop le.')
  return {
    quizId: cleanText(quiz.quizId, 80) || cleanText(body.setId, 80) || 'bo-de',
    title: cleanText(quiz.title, 180) || 'Bo de',
    questions,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const user = await getRequestUser(req)
    if (!user?.id) return json({ error: 'Ban can dang nhap.' }, 401)
    const role = await assertCanImport(user.id)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'import')
    if (action === 'update-metadata') {
      const setId = cleanText(body.setId, 80)
      const subjectName = cleanText(body.subjectName, 160)
      const title = cleanText(body.title, 180)
      if (!setId || !subjectName || !title) return json({ error: 'Missing setId, subjectName, or title.' }, 400)

      const { data: row, error: updateError } = await supabase
        .from('practice_sets')
        .update({
          subject_name: subjectName,
          title,
          chapter_title: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', setId)
        .select('id, subject_name, title')
        .single()

      if (updateError) throw updateError
      return json({ set: row })
    }

    if (action === 'delete-set') {
      if (role !== 'admin') return json({ error: 'Chi admin moi duoc xoa bo de.' }, 403)

      const setId = cleanText(body.setId, 80)
      if (!setId) return json({ error: 'Missing setId.' }, 400)

      const { data: row, error: readError } = await supabase
        .from('practice_sets')
        .select('id, content_key, storage_provider')
        .eq('id', setId)
        .single()
      if (readError) throw readError

      if (row?.storage_provider === 'supabase' && row?.content_key) {
        await supabase.storage.from(STORAGE_BUCKET).remove([row.content_key])
      }

      const { error: deleteError } = await supabase.from('practice_sets').delete().eq('id', setId)
      if (deleteError) throw deleteError
      return json({ deleted: true, setId })
    }

    if (action === 'update-content') {
      const setId = cleanText(body.setId, 80)
      if (!setId) return json({ error: 'Missing setId.' }, 400)

      const { data: row, error: readError } = await supabase
        .from('practice_sets')
        .select('id, title, content_key, storage_provider')
        .eq('id', setId)
        .single()
      if (readError) throw readError
      if (row.storage_provider !== 'supabase' || !row.content_key) {
        return json({ error: 'Chi ho tro sua noi dung bo de trong Supabase Storage.' }, 400)
      }

      const quiz = normalizeEditableQuiz({ ...body, quiz: { ...body.quiz, title: body.quiz?.title || row.title } })
      const jsonText = JSON.stringify(quiz, null, 2)
      const contentSha256 = await sha256Hex(jsonText)
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(row.content_key, new Blob([jsonText], { type: 'application/json; charset=utf-8' }), {
          contentType: 'application/json; charset=utf-8',
          upsert: true,
        })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('practice_sets')
        .update({
          question_count: quiz.questions.length,
          content_sha256: contentSha256,
          estimated_minutes: Math.max(1, Math.ceil(quiz.questions.length * 1.2)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', setId)
      if (updateError) throw updateError

      return json({ updated: true, questionCount: quiz.questions.length, contentSha256 })
    }

    const metadata = normalizeMetadata(body)
    const sourceText = cleanText(body.sourceText, 50000)
    if (sourceText.length < 200) {
      return json({ error: 'PDF khong trich duoc du text. Hay dung PDF text ro hoac OCR truoc.' }, 400)
    }

    const generated = await generateQuiz(buildMessages({
      subjectName: metadata.subjectName,
      courseCode: metadata.courseCode,
      chapterTitle: metadata.chapterTitle,
      title: metadata.title,
      sourceText,
      maxQuestions: metadata.maxQuestions,
    }))
    const quiz = normalizeGeneratedQuiz(safeJsonParse(generated.content), metadata.title, metadata.maxQuestions)
    const prefix = metadata.visibility === 'public' ? 'free' : metadata.visibility
    const objectKey = `${prefix}/${slugify(metadata.subjectName)}/${metadata.chapterCode}/${slugify(metadata.title)}-${crypto.randomUUID().slice(0, 8)}.json`
    const jsonText = JSON.stringify(quiz, null, 2)
    const contentSha256 = await sha256Hex(jsonText)

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectKey, new Blob([jsonText], { type: 'application/json; charset=utf-8' }), {
        contentType: 'application/json; charset=utf-8',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: setRow, error: setError } = await supabase
      .from('practice_sets')
      .insert({
        owner_id: user.id,
        source_type: 'admin',
        subject_name: metadata.subjectName,
        course_code: metadata.courseCode || null,
        chapter_title: metadata.chapterTitle || null,
        chapter_code: metadata.chapterCode,
        title: metadata.title,
        description: metadata.description || null,
        difficulty: metadata.difficulty,
        visibility: metadata.visibility,
        storage_provider: 'supabase',
        content_url: null,
        content_key: objectKey,
        content_sha256: contentSha256,
        question_count: quiz.questions.length,
        estimated_minutes: Math.max(1, Math.ceil(quiz.questions.length * 1.2)),
      })
      .select('id')
      .single()

    if (setError) throw setError

    return json({
      setId: setRow.id,
      contentKey: objectKey,
      questionCount: quiz.questions.length,
      provider: generated.provider,
      model: generated.model,
    })
  } catch (error) {
    console.error('practice-import error:', error)
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500
    return json({ error: error instanceof Error ? error.message : String(error) }, status)
  }
})
