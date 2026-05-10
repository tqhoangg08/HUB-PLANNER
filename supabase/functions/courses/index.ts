// supabase/functions/courses/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const normalizeSemester = (value = '') => String(value).replace(/\s+/g, '_').replace(/[()]/g, '')
const SYNCABLE_COURSE_FIELDS = [
  'course_code',
  'subject_name',
  'credits',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'exam_date',
  'exam_shift',
  'exam_room',
  'cohort',
  'major',
  'academic_program',
  'phase',
  'semester',
  'instructor',
]

const normalizeComparable = (value: unknown) => {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

const parseCustomData = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {}
    } catch {
      return {}
    }
  }
  return value as Record<string, unknown>
}

const mergeScheduleCourse = (item: any, profile: any) => {
  const baseCourse = item.course_schedules || {}
  const customData = parseCustomData(item.custom_data)
  return {
    ...baseCourse,
    ...customData,
    id: baseCourse.id || item.course_id,
    user_schedule_id: item.id,
    semester: item.semester,
    user: profile,
    original_course: baseCourse,
    custom_data: customData,
  }
}

const getSyncableDiff = (item: any) => {
  const baseCourse = item.course_schedules || {}
  const customData = parseCustomData(item.custom_data) as Record<string, unknown>
  return SYNCABLE_COURSE_FIELDS.reduce((diff: Record<string, unknown>, field) => {
    if (!Object.prototype.hasOwnProperty.call(customData, field)) return diff
    if (normalizeComparable(customData[field]) === normalizeComparable(baseCourse[field])) return diff
    diff[field] = customData[field]
    return diff
  }, {})
}

const matchesSearch = (course: any, rawSearch = '') => {
  const term = rawSearch.trim().toLowerCase()
  if (!term) return true
  return [
    course.subject_name,
    course.course_code,
    course.instructor,
    course.user?.full_name,
    course.user?.student_code,
    course.user?.email,
  ].some((value) => String(value || '').toLowerCase().includes(term))
}

const getActorRole = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user?.id) return null

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  return (roleData?.role || 'student').trim()
}

const fetchProfilesMap = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, student_code')
    .in('id', uniqueUserIds)
  if (error) throw error

  const { data: privateRows, error: privateError } = await supabase
    .from('profile_private_data')
    .select('user_id, email')
    .in('user_id', uniqueUserIds)
  if (privateError) throw privateError

  const privateMap = (privateRows || []).reduce((map: Record<string, any>, row: any) => {
    map[row.user_id] = row
    return map
  }, {})

  return (data || []).reduce((map: Record<string, any>, profile: any) => {
    map[profile.id] = { ...profile, email: privateMap[profile.id]?.email }
    return map
  }, {})
}

const handleUserSchedules = async (request: Request, params: URLSearchParams) => {
  const role = await getActorRole(request)
  if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)

  const mode = params.get('mode') || 'changed'
  const semester = params.get('semester') || 'HK2_2025_2026'
  const phase = params.get('phase') || 'all'
  const search = params.get('search') || ''
  const userId = params.get('userId') || ''
  const dbSemester = normalizeSemester(semester)

  let schedulesQuery = supabase
    .from('user_schedules')
    .select('id, user_id, course_id, semester, custom_data, course_schedules (*)')
    .in('semester', [semester, dbSemester])

  if (mode === 'changed') {
    schedulesQuery = schedulesQuery.not('custom_data', 'is', null).not('custom_data', 'eq', '{}')
  }
  if (mode === 'courses' && userId) {
    schedulesQuery = schedulesQuery.eq('user_id', userId)
  }

  const { data: schedules, error } = await schedulesQuery.limit(10000)
  if (error) throw error

  const rows = schedules || []
  const profilesMap: Record<string, any> = await fetchProfilesMap(rows.map((item: any) => item.user_id))

  if (mode === 'summaries') {
    const userIds = [...new Set(rows.map((item: any) => item.user_id).filter(Boolean))]
    const data = userIds
      .map((id: any) => {
        const profile = profilesMap[id] || {}
        const userItems = rows.filter((item: any) => item.user_id === id)
        return {
          user_id: id,
          full_name: profile.full_name || 'Chưa có tên',
          student_code: profile.student_code || id,
          email: profile.email,
          course_count: userItems.length,
          semesters: [...new Set(userItems.map((item: any) => item.semester).filter(Boolean))],
        }
      })
      .sort((a: any, b: any) => a.student_code.localeCompare(b.student_code, 'vi'))
    return json({ success: true, data })
  }

  if (mode === 'courses') {
    if (!userId) return json({ error: 'Missing userId' }, 400)
    const data = rows
      .filter((item: any) => item.user_id === userId)
      .map((item: any) => mergeScheduleCourse(item, profilesMap[userId] || {}))
      .filter((course: any) => course.id)
    return json({ success: true, data })
  }

  const data = rows
    .filter((item: any) => Object.keys(getSyncableDiff(item)).length > 0)
    .map((item: any) => mergeScheduleCourse(item, profilesMap[item.user_id] || { full_name: 'Ẩn danh', student_code: '???' }))
    .filter((course: any) => course.id)
    .filter((course: any) => phase === 'all' || String(course.phase || '') === String(phase))
    .filter((course: any) => matchesSearch(course, search))

  return json({ success: true, data })
}

const handleSyncUserSchedule = async (request: Request) => {
  const role = await getActorRole(request)
  if (role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({}))
  const { userScheduleId } = body
  if (!userScheduleId) return json({ error: 'Missing userScheduleId' }, 400)

  const selectedFieldKeys = Array.isArray(body.fieldKeys)
    ? [...new Set(body.fieldKeys.map((key: unknown) => String(key || '').trim()).filter(Boolean))]
    : []

  const { data: row, error: readError } = await supabase
    .from('user_schedules')
    .select('id, course_id, custom_data, course_schedules (*)')
    .eq('id', userScheduleId)
    .maybeSingle()
  if (readError) throw readError
  if (!row?.course_schedules?.id) return json({ error: 'Schedule row not found' }, 404)

  const customData = parseCustomData(row.custom_data) as Record<string, unknown>
  const updates = getSyncableDiff(row)
  const syncKeys = selectedFieldKeys.length > 0 ? selectedFieldKeys : Object.keys(updates)
  const selectedUpdates = syncKeys.reduce((result: Record<string, unknown>, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return result
    result[key] = updates[key]
    return result
  }, {})

  if (Object.keys(selectedUpdates).length === 0) {
    return json({ success: true, data: { updates: {}, remainingCustomData: customData } })
  }

  const { error: updateError } = await supabase
    .from('course_schedules')
    .update(selectedUpdates)
    .eq('id', row.course_schedules.id)
  if (updateError) throw updateError

  const remainingCustomData = Object.entries(customData).reduce((result: Record<string, unknown>, [key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(selectedUpdates, key)) result[key] = value
    return result
  }, {})

  const { error: customError } = await supabase
    .from('user_schedules')
    .update({ custom_data: remainingCustomData })
    .eq('id', userScheduleId)
  if (customError) throw customError

  return json({ success: true, data: { updates: selectedUpdates, remainingCustomData } })
}

const handleProfilePrivateMap = async (request: Request) => {
  const role = await getActorRole(request)
  if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.userIds) ? body.userIds : String(body.userIds || '').split(',')
  const userIds = [...new Set(ids.map((id: unknown) => String(id || '').trim()).filter(Boolean))]
  if (userIds.length === 0) return json({ success: true, data: [] })

  const rows: any[] = []
  for (let index = 0; index < userIds.length; index += 200) {
    const batch = userIds.slice(index, index + 200)
    const { data, error } = await supabase
      .from('profile_private_data')
      .select('user_id, email, data, password_set_at, updated_at')
      .in('user_id', batch)
    if (error) throw error
    rows.push(...(data || []))
  }

  return json({ success: true, data: rows })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  const url = new URL(req.url)
  const params = url.searchParams
  const resource = params.get('resource') || ''

  try {
    if (resource === 'user-schedules' && req.method === 'PATCH') return await handleSyncUserSchedule(req)
    if (resource === 'profile-private-map' && req.method === 'POST') return await handleProfilePrivateMap(req)
    if (req.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET' }, 405)
    if (resource === 'user-schedules') return await handleUserSchedules(req, params)

    const semester = params.get('semester')
    const phase = params.get('phase')
    const search = params.get('search')
    const limit = Number(params.get('limit') || 50)

    let query = supabase.from('course_schedules').select('*').limit(limit)
    if (semester) query = query.eq('semester', semester)
    if (phase && phase !== 'all') query = query.eq('phase', phase)
    if (search) query = query.or(`subject_name.ilike.%${search}%,course_code.ilike.%${search}%,instructor.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return json({ success: true, data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
