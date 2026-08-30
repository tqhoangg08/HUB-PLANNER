// supabase/functions/courses/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { sendWebPush } from '../_shared/webpush.ts'
import {
  logServerError,
  safeHttpError,
} from '../_shared/schedule-source-barrier.ts'
import { callProfileAuthorityInternal } from '../_shared/profile-authority-client.ts'
import { callScheduleAuthorityInternal } from '../_shared/schedule-authority-client.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const normalizeSemester = (value = '') => String(value).replace(/\s+/g, '_').replace(/[()]/g, '')
const SYNCABLE_COURSE_FIELDS = [
  'course_code',
  'subject_name',
  'prerequisite',
  'credits',
  'knowledge_block',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'managing_faculty',
  'exam_date',
  'exam_shift',
  'exam_campus',
  'exam_room',
  'cohort',
  'major',
  'group_name',
  'orientation',
  'orientation_note_3',
  'registration_type',
  'general_note',
  'academic_program',
  'student_count',
  'phase',
  'semester',
  'instructor',
]
const COURSE_SCHEDULE_COLUMNS = [
  'id',
  'course_code',
  'subject_name',
  'prerequisite',
  'credits',
  'knowledge_block',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'managing_faculty',
  'exam_date',
  'exam_shift',
  'exam_campus',
  'exam_room',
  'cohort',
  'major',
  'group_name',
  'orientation',
  'orientation_note_3',
  'registration_type',
  'general_note',
  'academic_program',
  'student_count',
  'phase',
  'semester',
  'instructor',
  'is_user_added',
].join(', ')
const COURSE_SCHEDULE_SUMMARY_COLUMNS = [
  'id',
  'semester',
  'course_code',
  'subject_name',
  'credits',
  'phase',
  'day_of_week',
  'shift',
  'weeks',
  'room',
  'campus',
  'instructor',
  'group_name',
  'cohort',
  'major',
  'academic_program',
  'is_user_added',
].join(', ')
const USER_COURSE_REQUEST_COLUMNS = 'id, user_id, subject_name, course_code, instructor, status, created_at'
const normalizeCourseCode = (value: unknown = '') => {
  const tokens = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_')
    .filter(Boolean)

  let semesterIndex = -1
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/^\d{2}[123](?:1)?$/.test(tokens[index])) {
      semesterIndex = index
      break
    }
  }

  if (semesterIndex < 0) return tokens.join('_')

  tokens[semesterIndex] = tokens[semesterIndex].slice(0, 3)
  if (tokens[semesterIndex + 1] === '1') tokens.splice(semesterIndex + 1, 1)
  return tokens.join('_')
}

const buildEquivalentCourseCodes = (value: unknown = '') => {
  const canonical = normalizeCourseCode(value)
  const tokens = canonical.split('_').filter(Boolean)
  let semesterIndex = -1
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/^\d{2}[123]$/.test(tokens[index])) {
      semesterIndex = index
      break
    }
  }

  if (semesterIndex < 0) return canonical ? [canonical] : []

  const withStandalonePhase = [...tokens]
  withStandalonePhase.splice(semesterIndex + 1, 0, '1')
  const withCompactSemester = [...tokens]
  withCompactSemester[semesterIndex] = `${withCompactSemester[semesterIndex]}1`
  const withCompactSemesterAndPhase = [...withCompactSemester]
  withCompactSemesterAndPhase.splice(semesterIndex + 1, 0, '1')

  return [...new Set([
    canonical,
    withStandalonePhase.join('_'),
    withCompactSemester.join('_'),
    withCompactSemesterAndPhase.join('_'),
  ])]
}

const fetchMatchingSystemCourses = async (
  courseCodes: unknown[],
  columns = COURSE_SCHEDULE_COLUMNS,
) => {
  const canonicalCodes = [...new Set(courseCodes.map(normalizeCourseCode).filter(Boolean))]
  if (canonicalCodes.length === 0) return new Map<string, any[]>()

  const equivalentCodes = [...new Set(courseCodes.flatMap(buildEquivalentCourseCodes))]
  const filters = equivalentCodes.map((courseCode) => `course_code.ilike.${courseCode}`).join(',')
  const { data, error } = await supabase
    .from('course_schedules')
    .select(columns)
    .or(filters)
    .limit(1000)

  if (error) throw error

  const targetCodes = new Set(canonicalCodes)
  return (data || []).reduce((matches: Map<string, any[]>, course: any) => {
    const canonical = normalizeCourseCode(course.course_code)
    if (!targetCodes.has(canonical)) return matches
    const existing = matches.get(canonical) || []
    existing.push(course)
    matches.set(canonical, existing)
    return matches
  }, new Map<string, any[]>())
}

const chooseMatchingSystemCourse = (matches: any[] = [], preferredSemester = '') => {
  return [...matches].sort((left, right) => {
    const leftSemester = left.semester === preferredSemester ? 1 : 0
    const rightSemester = right.semester === preferredSemester ? 1 : 0
    if (leftSemester !== rightSemester) return rightSemester - leftSemester

    const leftOfficial = left.is_user_added ? 0 : 1
    const rightOfficial = right.is_user_added ? 0 : 1
    return rightOfficial - leftOfficial
  })[0] || null
}
const DEFAULT_ADMIN_SCHEDULE_LIMIT = 200
const MAX_ADMIN_SCHEDULE_LIMIT = 500
const ADMIN_SCHEDULE_SCAN_BATCH_SIZE = 500
const MAX_ADMIN_SCHEDULE_SCAN_ROWS = 5000

const normalizeComparable = (value: unknown) => {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

const normalizeOptionValue = (value: unknown) => String(value || '').trim()

const uniqueSortedOptions = (values: unknown[]) => [...new Set(values.map(normalizeOptionValue).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }))

const parseGroupTokens = (value: unknown) => {
  const raw = normalizeOptionValue(value)
  if (!raw) return []

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return []

  const firstPrefix = parts[0].match(/^(.+_N)(\d+)$/i)?.[1]
  return [...new Set(parts.map((part, index) => {
    if (index > 0 && firstPrefix && /^\d+$/.test(part)) {
      return `${firstPrefix}${part}`
    }
    return part
  }).filter(Boolean))]
}

const uniqueSortedGroupOptions = (values: unknown[]) => uniqueSortedOptions(values.flatMap(parseGroupTokens))

const fetchCourseFilterOptionRows = async ({
  semester,
  phase,
  isUserAdded,
}: {
  semester: string | null
  phase: string | null
  isUserAdded: string
}) => {
  const rows: any[] = []
  const batchSize = 1000

  for (let offset = 0; offset < 10000; offset += batchSize) {
    let query = supabase
      .from('course_schedules')
      .select('subject_name, major, cohort, group_name, academic_program')
      .range(offset, offset + batchSize - 1)

    if (semester) query = query.eq('semester', semester)
    if (phase && phase !== 'all') query = query.eq('phase', phase)

    if (isUserAdded === 'true') {
      query = query.eq('is_user_added', true)
    } else if (isUserAdded === 'false') {
      query = query.or('is_user_added.is.false,is_user_added.is.null')
    }

    const { data, error } = await query
    if (error) throw error

    const batchRows = data || []
    rows.push(...batchRows)
    if (batchRows.length < batchSize) break
  }

  return rows
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

const getRequestUser = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}

const fetchProfilesMap = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return {}
  const map: Record<string, any> = {}
  for (let index = 0; index < uniqueUserIds.length; index += 200) {
    const result = await callProfileAuthorityInternal<{
      success: true
      data: Array<{ id: string; full_name: string | null; student_code: string | null; email: string | null }>
    }>({
      writer: 'courses_edge',
      operation: 'read_profile_map',
      userIds: uniqueUserIds.slice(index, index + 200),
    })
    result.data.forEach((profile) => {
      map[profile.id] = profile
    })
  }
  return map
}

const handleMySchedule = async (request: Request, params: URLSearchParams) => {
  const user = await getRequestUser(request)
  if (!user?.id) return json({ error: 'Unauthorized' }, 401)

  const requestedUserId = (params.get('userId') || '').trim()
  let targetUserId = user.id

  if (requestedUserId && requestedUserId !== user.id) {
    const role = await getActorRole(request)
    if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)
    targetUserId = requestedUserId
  }

  const { data, error } = await supabase
    .from('user_schedules')
    .select(`id, user_id, course_id, semester, custom_data, course_schedules (${COURSE_SCHEDULE_COLUMNS})`)
    .eq('user_id', targetUserId)
  if (error) throw error

  const rows = data || []
  const profilesMap: Record<string, any> = await fetchProfilesMap(rows.map((item: any) => item.user_id))
  const schedule = rows
    .map((item: any) => mergeScheduleCourse(item, profilesMap[item.user_id] || {}))
    .filter((course: any) => course.id)

  return json({ success: true, data: schedule })
}

const handleUserSchedules = async (request: Request, params: URLSearchParams) => {
  const role = await getActorRole(request)
  if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)

  const mode = params.get('mode') || 'changed'
  const semester = params.get('semester') || 'HK1_2026_2027'
  const phase = params.get('phase') || 'all'
  const search = params.get('search') || ''
  const userId = params.get('userId') || ''
  const limit = params.get('limit')
  const offset = params.get('offset')
  const pageLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_ADMIN_SCHEDULE_LIMIT, MAX_ADMIN_SCHEDULE_LIMIT))
  const pageOffset = Math.max(0, Number(offset) || 0)
  const dbSemester = normalizeSemester(semester)
  const semesterValues = [...new Set([semester, dbSemester].filter(Boolean))]

  if (mode === 'summaries') {
    const { data: summaryRows, error: summaryError } = await supabase
      .from('user_schedules')
      .select('user_id, semester')
      .in('semester', semesterValues)

    if (summaryError) throw summaryError

    const grouped = (summaryRows || []).reduce((map: Record<string, any>, item: any) => {
      if (!item.user_id) return map
      if (!map[item.user_id]) {
        map[item.user_id] = { course_count: 0, semesters: new Set() }
      }
      map[item.user_id].course_count += 1
      if (item.semester) map[item.user_id].semesters.add(item.semester)
      return map
    }, {})

    const userIds = Object.keys(grouped)
    const profilesMap: Record<string, any> = await fetchProfilesMap(userIds)
    const data = userIds
      .map((id: string) => {
        const profile = profilesMap[id] || {}
        return {
          user_id: id,
          full_name: profile.full_name || 'Chưa có tên',
          student_code: profile.student_code || id,
          email: profile.email,
          course_count: grouped[id].course_count,
          semesters: [...grouped[id].semesters],
        }
      })
      .sort((a: any, b: any) => a.student_code.localeCompare(b.student_code, 'vi'))

    return json({
      success: true,
      data: data.slice(pageOffset, pageOffset + pageLimit),
      hasMore: data.length > pageOffset + pageLimit,
      total: data.length,
    })
  }

  if (mode === 'courses') {
    if (!userId) return json({ error: 'Missing userId' }, 400)

    const { data: rows, error, count } = await supabase
      .from('user_schedules')
      .select(`id, user_id, course_id, semester, custom_data, course_schedules (${COURSE_SCHEDULE_COLUMNS})`, { count: 'exact' })
      .in('semester', semesterValues)
      .eq('user_id', userId)
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (error) throw error

    const profilesMap: Record<string, any> = await fetchProfilesMap([userId])
    const data = (rows || [])
      .map((item: any) => mergeScheduleCourse(item, profilesMap[userId] || {}))
      .filter((course: any) => course.id)

    return json({
      success: true,
      data,
      hasMore: (count || 0) > pageOffset + data.length,
      total: count || 0,
    })
  }

  const targetCount = pageOffset + pageLimit + 1
  const data: any[] = []
  let scannedRows = 0
  let sourceHasMore = true

  while (data.length < targetCount && sourceHasMore && scannedRows < MAX_ADMIN_SCHEDULE_SCAN_ROWS) {
    const batchStart = scannedRows
    const batchEnd = Math.min(
      batchStart + ADMIN_SCHEDULE_SCAN_BATCH_SIZE - 1,
      MAX_ADMIN_SCHEDULE_SCAN_ROWS - 1,
    )

    const { data: schedules, error } = await supabase
      .from('user_schedules')
      .select(`id, user_id, course_id, semester, custom_data, course_schedules (${COURSE_SCHEDULE_COLUMNS})`)
      .in('semester', semesterValues)
      .not('custom_data', 'is', null)
      .not('custom_data', 'eq', '{}')
      .range(batchStart, batchEnd)

    if (error) throw error

    const rows = schedules || []
    sourceHasMore = rows.length === (batchEnd - batchStart + 1)
    scannedRows += rows.length

    if (rows.length === 0) break

    const profilesMap: Record<string, any> = await fetchProfilesMap(rows.map((item: any) => item.user_id))
    const matchedRows = rows
      .filter((item: any) => Object.keys(getSyncableDiff(item)).length > 0)
      .map((item: any) => mergeScheduleCourse(item, profilesMap[item.user_id] || { full_name: 'Ẩn danh', student_code: '???' }))
      .filter((course: any) => course.id)
      .filter((course: any) => phase === 'all' || String(course.phase || '') === String(phase))
      .filter((course: any) => matchesSearch(course, search))

    data.push(...matchedRows)
  }

  const hasMore = data.length > pageOffset + pageLimit
    || (sourceHasMore && scannedRows >= MAX_ADMIN_SCHEDULE_SCAN_ROWS)

  return json({
    success: true,
    data: data.slice(pageOffset, pageOffset + pageLimit),
    hasMore,
    total: hasMore ? Math.max(data.length, pageOffset + pageLimit + 1) : data.length,
  })
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
    .select(`id, user_id, course_id, custom_data, course_schedules (${COURSE_SCHEDULE_COLUMNS})`)
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
  // An earlier request may have updated the shared course row successfully but
  // failed before the D1 schedule mutation completed.  A retry then has no
  // course diff left to apply, but it still must finish clearing the exact
  // custom-data keys from the D1-authoritative private schedule.  Only an
  // explicitly selected, syncable key whose current source value already
  // equals the custom value qualifies for that replay-safe case.
  const keysToClear = selectedFieldKeys.length > 0
    ? [...new Set([
      ...Object.keys(selectedUpdates),
      ...selectedFieldKeys.filter((key) => (
        SYNCABLE_COURSE_FIELDS.includes(key)
        && Object.prototype.hasOwnProperty.call(customData, key)
        && normalizeComparable(customData[key]) === normalizeComparable(row.course_schedules[key])
      )),
    ])]
    : Object.keys(selectedUpdates)

  // Check the D1-authoritative owner-scoped target before making the
  // independent legacy course-catalog mutation. This also makes the narrow
  // schedule freeze block this privileged flow before it changes any data.
  await callScheduleAuthorityInternal({
    writer: 'courses_edge',
    operation: 'authorize_user_schedule_custom_data',
    userId: String(row.user_id || ''),
    scheduleId: String(row.id || ''),
  })

  if (Object.keys(selectedUpdates).length === 0 && keysToClear.length === 0) {
    return json({ success: true, data: { updates: {}, remainingCustomData: customData } })
  }

  if (Object.keys(selectedUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('course_schedules')
      .update(selectedUpdates)
      .eq('id', row.course_schedules.id)
    if (updateError) throw updateError
  }

  const remainingCustomData = Object.entries(customData).reduce((result: Record<string, unknown>, [key, value]) => {
    if (!keysToClear.includes(key)) result[key] = value
    return result
  }, {})

  await callScheduleAuthorityInternal({
    writer: 'courses_edge',
    operation: 'update_user_schedule_custom_data',
    userId: String(row.user_id || ''),
    scheduleId: String(row.id || ''),
    customData: remainingCustomData,
    idempotencyKey: `courses-sync:${crypto.randomUUID()}`,
  })

  return json({ success: true, data: { updates: selectedUpdates, remainingCustomData } })
}

const notifyCourseRequestApproved = async (userId: string | null, course: any) => {
  if (!userId) return { notification: false, push: { sent: 0, failed: 0 } }

  const subjectName = String(course?.subject_name || 'môn học').trim()
  const courseCode = String(course?.course_code || '').trim()
  const courseLabel = courseCode ? `${subjectName} (${courseCode})` : subjectName
  const content = `Môn ${courseLabel} bạn yêu cầu đã được cập nhật lên hệ thống.`
  const payload = {
    title: 'Môn học đã được cập nhật',
    body: content,
    url: '/schedule',
    category: 'schedule',
  }

  let notification = false
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      receiver_id: userId,
      actor_id: null,
      type: 'course_request_approved',
      content,
      link: '/schedule',
      is_read: false,
    })

  if (!notificationError) {
    notification = true
  } else {
    console.error('Course request notification insert failed:', notificationError.message)
  }

  const { data: preference } = await supabase
    .from('notification_preferences')
    .select('schedule')
    .eq('user_id', userId)
    .maybeSingle()

  if (preference?.schedule === false) {
    return { notification, push: { sent: 0, skipped: true, failed: 0 } }
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)

  if (subscriptionError) {
    console.error('Course request push subscription lookup failed:', subscriptionError.message)
    return { notification, push: { sent: 0, failed: 0 } }
  }

  const results = await Promise.all((subscriptions || []).map(async (sub: any) => {
    try {
      await sendWebPush(sub.subscription, JSON.stringify(payload))
      return true
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
      console.error('Course request push failed:', error?.message || error)
      return false
    }
  }))

  const sent = results.filter(Boolean).length
  return { notification, push: { sent, failed: results.length - sent } }
}

const handleManualCourseRequest = async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getRequestUser(request)
  if (!user?.id) return json({ error: 'Unauthorized' }, 401)

  const body = await request.json().catch(() => ({}))
  const subjectName = String(body.subject_name || '').trim().slice(0, 200)
  const courseCode = String(body.course_code || '').trim().slice(0, 120)
  const instructor = String(body.instructor || 'Chưa rõ').trim().slice(0, 160) || 'Chưa rõ'
  const semester = String(body.semester || '').trim().slice(0, 60)

  if (!subjectName || !courseCode) {
    return json({ error: 'Vui lòng nhập tên môn học và mã học phần.' }, 400)
  }

  const canonicalCode = normalizeCourseCode(courseCode)
  if (!canonicalCode) return json({ error: 'Mã học phần không hợp lệ.' }, 400)

  const matches = await fetchMatchingSystemCourses([courseCode])
  const duplicateCourse = chooseMatchingSystemCourse(matches.get(canonicalCode) || [], semester)
  if (duplicateCourse) {
    return json({
      error: 'Môn học này đã có trong hệ thống.',
      code: 'COURSE_ALREADY_EXISTS',
      normalized_course_code: canonicalCode,
      data: duplicateCourse,
    }, 409)
  }

  const { data, error } = await supabase
    .from('user_course_requests')
    .insert({
      subject_name: subjectName,
      course_code: courseCode,
      instructor,
      user_id: user.id,
      status: 'pending',
    })
    .select(USER_COURSE_REQUEST_COLUMNS)
    .single()

  if (error) throw error
  return json({ success: true, data }, 201)
}

const handleCourseRequests = async (request: Request, params: URLSearchParams) => {
  const role = await getActorRole(request)
  if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)

  if (request.method === 'GET') {
    const status = params.get('status') || 'pending'
    const search = params.get('search') || ''
    const pageLimit = Math.max(1, Math.min(Number(params.get('limit')) || 10, 100))
    const pageOffset = Math.max(0, Number(params.get('offset')) || 0)

    let query = supabase
      .from('user_course_requests')
      .select(USER_COURSE_REQUEST_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (status && status !== 'all') query = query.eq('status', status)

    const term = search.trim()
    if (term) {
      query = query.or(`subject_name.ilike.%${term}%,course_code.ilike.%${term}%,instructor.ilike.%${term}%`)
    }

    const { data, error, count } = await query
    if (error) throw error

    const profilesMap: Record<string, any> = await fetchProfilesMap((data || []).map((item: any) => item.user_id))
    const duplicateMatches = await fetchMatchingSystemCourses(
      (data || []).map((item: any) => item.course_code),
      COURSE_SCHEDULE_SUMMARY_COLUMNS,
    )
    const rows = (data || []).map((item: any) => ({
      ...item,
      user: profilesMap[item.user_id] || null,
      duplicate_course: chooseMatchingSystemCourse(
        duplicateMatches.get(normalizeCourseCode(item.course_code)) || [],
      ),
    }))

    return json({
      success: true,
      data: rows,
      hasMore: (count || 0) > pageOffset + rows.length,
      total: count || 0,
    })
  }

  if (request.method === 'PATCH') {
    if (role !== 'admin') return json({ error: 'Forbidden' }, 403)

    const body = await request.json().catch(() => ({}))
    const requestId = body.requestId
    const status = body.status
    if (!requestId || !['pending', 'approved', 'rejected'].includes(status)) {
      return json({ error: 'Invalid request update' }, 400)
    }

    const { data, error } = await supabase
      .from('user_course_requests')
      .update({ status })
      .eq('id', requestId)
      .select(USER_COURSE_REQUEST_COLUMNS)
      .single()

    if (error) throw error
    return json({ success: true, data })
  }

  if (request.method === 'POST') {
    if (role !== 'admin') return json({ error: 'Forbidden' }, 403)

    const body = await request.json().catch(() => ({}))
    const requestId = body.requestId
    const course = body.course || {}
    if (!requestId || !course.subject_name || !course.course_code) {
      return json({ error: 'Missing course request data' }, 400)
    }

    const { data: courseRequest, error: requestReadError } = await supabase
      .from('user_course_requests')
      .select('id, user_id, subject_name, course_code')
      .eq('id', requestId)
      .maybeSingle()

    if (requestReadError) throw requestReadError
    if (!courseRequest) return json({ error: 'Course request not found' }, 404)

    const payload = {
      ...course,
      is_user_added: false,
    }
    delete payload.id
    delete payload.user
    delete payload.created_at
    delete payload.status

    const { data: existingCourse, error: existingCourseError } = await supabase
      .from('course_schedules')
      .select('id')
      .eq('course_code', payload.course_code)
      .eq('semester', payload.semester)
      .maybeSingle()

    if (existingCourseError) throw existingCourseError

    let officialCourse: any = null
    if (existingCourse?.id) {
      const { data: updatedCourse, error: updateCourseError } = await supabase
        .from('course_schedules')
        .update(payload)
        .eq('id', existingCourse.id)
        .select(COURSE_SCHEDULE_COLUMNS)
        .single()

      if (updateCourseError) throw updateCourseError
      officialCourse = updatedCourse
    } else {
      const { data: insertedCourse, error: insertError } = await supabase
        .from('course_schedules')
        .insert(payload)
        .select(COURSE_SCHEDULE_COLUMNS)
        .single()

      if (insertError) throw insertError
      officialCourse = insertedCourse
    }

    const { error: requestError } = await supabase
      .from('user_course_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)

    if (requestError) throw requestError

    let notification = { notification: false, push: { sent: 0, failed: 0 }, error: null as string | null }
    try {
      notification = {
        ...(await notifyCourseRequestApproved(courseRequest.user_id, officialCourse)),
        error: null,
      }
    } catch (error) {
      notification.error = 'Notification delivery failed'
      logServerError('course_request_notification', error)
    }

    return json({ success: true, data: officialCourse, notification, reusedExistingCourse: Boolean(existingCourse?.id) })
  }

  return json({ error: 'Method not allowed' }, 405)
}

const handleCourseFilterOptions = async (params: URLSearchParams) => {
  const semester = params.get('semester')
  const phase = params.get('phase')
  const major = params.get('major')
  const cohort = params.get('cohort')
  const academicProgram = params.get('academicProgram')
  const isUserAdded = params.get('isUserAdded') || 'all'
  const rows = await fetchCourseFilterOptionRows({ semester, phase, isUserAdded })
  const matchesMajor = (row: any) => !major || normalizeOptionValue(row.major) === normalizeOptionValue(major)
  const matchesCohort = (row: any) => !cohort || normalizeOptionValue(row.cohort) === normalizeOptionValue(cohort)
  const matchesAcademicProgram = (row: any) => !academicProgram || normalizeOptionValue(row.academic_program) === normalizeOptionValue(academicProgram)
  const optionRows = rows.filter((row: any) => matchesMajor(row) && matchesCohort(row) && matchesAcademicProgram(row))

  return json({
    success: true,
    majorOptions: uniqueSortedOptions(rows.filter((row: any) => matchesCohort(row) && matchesAcademicProgram(row)).map((row: any) => row.major)),
    cohortOptions: uniqueSortedOptions(rows.filter((row: any) => matchesMajor(row) && matchesAcademicProgram(row)).map((row: any) => row.cohort)),
    subjectNameOptions: uniqueSortedOptions(optionRows.map((row: any) => row.subject_name)),
    groupNameOptions: uniqueSortedGroupOptions(optionRows.map((row: any) => row.group_name)),
    academicProgramOptions: uniqueSortedOptions(rows.filter((row: any) => matchesMajor(row) && matchesCohort(row)).map((row: any) => row.academic_program)),
  })
}

const applyCourseListFilters = (query: any, { semester, phase, major, cohort, academicProgram, subjectName, isUserAdded, search }: any) => {
  let nextQuery = query
  if (semester) nextQuery = nextQuery.eq('semester', semester)
  if (phase && phase !== 'all') nextQuery = nextQuery.eq('phase', phase)
  if (major) nextQuery = nextQuery.eq('major', major)
  if (cohort) nextQuery = nextQuery.eq('cohort', cohort)
  if (academicProgram) nextQuery = nextQuery.eq('academic_program', academicProgram)
  if (subjectName) nextQuery = nextQuery.eq('subject_name', subjectName)
  if (isUserAdded === 'true') {
    nextQuery = nextQuery.eq('is_user_added', true)
  } else if (isUserAdded === 'false') {
    nextQuery = nextQuery.or('is_user_added.is.false,is_user_added.is.null')
  }
  if (search) nextQuery = nextQuery.or(`subject_name.ilike.%${search}%,course_code.ilike.%${search}%,instructor.ilike.%${search}%`)
  return nextQuery
}

const fetchGroupedCoursePage = async ({ semester, phase, search, major, cohort, academicProgram, subjectName, groupName, isUserAdded, pageLimit, pageOffset }: any) => {
  const rows: any[] = []
  const batchSize = 500
  let matchedCount = 0
  let hasMore = false
  const normalizedGroupName = normalizeOptionValue(groupName)

  for (let offset = 0; offset < 10000; offset += batchSize) {
    let query = supabase
      .from('course_schedules')
      .select(COURSE_SCHEDULE_SUMMARY_COLUMNS)
      .range(offset, offset + batchSize - 1)

    query = applyCourseListFilters(query, { semester, phase, major, cohort, academicProgram, subjectName, isUserAdded, search })

    const { data, error } = await query
    if (error) throw error

    const batchRows = data || []
    for (const row of batchRows) {
      if (!parseGroupTokens(row.group_name).includes(normalizedGroupName)) continue
      if (matchedCount >= pageOffset && rows.length < pageLimit) rows.push(row)
      matchedCount += 1
      if (matchedCount > pageOffset + pageLimit) hasMore = true
    }

    if (batchRows.length < batchSize) break
  }

  return { rows, total: matchedCount, hasMore }
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
    if (resource === 'course-requests') return await handleCourseRequests(req, params)
    if (resource === 'manual-course-request') return await handleManualCourseRequest(req)
    if (req.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET' }, 405)
    if (resource === 'user-schedules') return await handleUserSchedules(req, params)
    if (resource === 'my-schedule') return await handleMySchedule(req, params)
    if (resource === 'filter-options') return await handleCourseFilterOptions(params)
    if (resource === 'course-detail') {
      const id = params.get('id')
      if (!id) return json({ error: 'Missing course id' }, 400)
      const { data, error } = await supabase
        .from('course_schedules')
        .select(COURSE_SCHEDULE_COLUMNS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'Course not found' }, 404)
      return json({ success: true, data })
    }

    const semester = params.get('semester')
    const phase = params.get('phase')
    const search = params.get('search')
    const major = params.get('major')
    const cohort = params.get('cohort')
    const academicProgram = params.get('academicProgram')
    const groupName = params.get('groupName')
    const subjectName = params.get('subjectName')
    const view = params.get('view') || 'summary'
    const isUserAdded = params.get('isUserAdded') || 'all'
    const isSuggestionRequest = params.get('suggestions') === 'true'
    const pageLimit = isSuggestionRequest
      ? Math.max(1, Math.min(Number(params.get('limit')) || 10, 10))
      : Math.max(1, Math.min(Number(params.get('limit')) || 50, 100))
    const pageOffset = isSuggestionRequest ? 0 : Math.max(0, Number(params.get('offset')) || 0)

    let rows: any[] = []
    let total = 0
    let hasMore = false
    const selectedColumns = view === 'detail' ? COURSE_SCHEDULE_COLUMNS : COURSE_SCHEDULE_SUMMARY_COLUMNS

    if (groupName && !isSuggestionRequest) {
      const groupedPage = await fetchGroupedCoursePage({ semester, phase, search, major, cohort, academicProgram, subjectName, groupName, isUserAdded, pageLimit, pageOffset })
      rows = groupedPage.rows
      total = groupedPage.total
      hasMore = groupedPage.hasMore
    } else {
      let query = isSuggestionRequest
        ? supabase.from('course_schedules').select(selectedColumns)
        : supabase.from('course_schedules').select(selectedColumns, { count: 'exact' })
      query = query.range(pageOffset, pageOffset + pageLimit - 1)

      query = applyCourseListFilters(query, { semester, phase, major, cohort, academicProgram, subjectName, isUserAdded, search })

      const { data, error, count } = await query
      if (error) throw error
      rows = data || []
      total = isSuggestionRequest ? rows.length : (count || 0)
      hasMore = isSuggestionRequest ? false : total > pageOffset + rows.length
    }

    return json({ success: true, data: rows, total, hasMore, limit: pageLimit, offset: pageOffset })
  } catch (error) {
    const safe = safeHttpError(error)
    if (safe.status >= 500 && safe.status !== 503) logServerError('courses_request', error)
    return json({ error: safe.message }, safe.status)
  }
})
