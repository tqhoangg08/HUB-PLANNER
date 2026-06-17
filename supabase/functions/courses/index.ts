// supabase/functions/courses/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { sendWebPush } from '../_shared/webpush.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

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
const COURSE_SCHEDULE_COLUMNS = [
  'id',
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
  'is_user_added',
].join(', ')
const USER_COURSE_REQUEST_COLUMNS = 'id, user_id, subject_name, course_code, instructor, status, created_at'
const DEFAULT_ADMIN_SCHEDULE_LIMIT = 200
const MAX_ADMIN_SCHEDULE_LIMIT = 500
const ADMIN_SCHEDULE_SCAN_BATCH_SIZE = 500
const MAX_ADMIN_SCHEDULE_SCAN_ROWS = 5000

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

  const profilesMap = (data || []).reduce((map: Record<string, any>, profile: any) => {
    map[profile.id] = { ...profile, email: privateMap[profile.id]?.email }
    return map
  }, {})

  uniqueUserIds.forEach((id) => {
    if (!profilesMap[id] && privateMap[id]?.email) {
      profilesMap[id] = {
        id,
        email: privateMap[id].email,
        student_code: String(privateMap[id].email || '').split('@')[0],
      }
    }
  })

  const missingUserIds = uniqueUserIds.filter((id) => !profilesMap[id])
  for (const id of missingUserIds) {
    const { data: authUser } = await supabase.auth.admin.getUserById(id)
    const email = authUser?.user?.email || ''
    profilesMap[id] = {
      id,
      email,
      student_code: email ? email.split('@')[0] : id,
    }
  }

  return profilesMap
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
  const semester = params.get('semester') || 'HK2_2025_2026'
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
    .select(`id, course_id, custom_data, course_schedules (${COURSE_SCHEDULE_COLUMNS})`)
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

const ensureNotificationReceiverProfile = async (userId: string) => {
  const { data: existingProfile, error: profileReadError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (profileReadError) throw profileReadError
  if (existingProfile?.id) return

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const email = authUser?.user?.email || null
  const studentCode = email ? email.split('@')[0] : null

  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      student_code: studentCode,
      full_name: studentCode || 'Sinh viên HUB',
    })

  if (insertError) throw insertError
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
  await ensureNotificationReceiverProfile(userId)
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

const handleCourseRequests = async (request: Request, params: URLSearchParams) => {
  const role = await getActorRole(request)
  if (!['admin', 'auditor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)

  if (request.method === 'GET') {
    const status = params.get('status') || 'pending'
    const search = params.get('search') || ''
    const limit = Number(params.get('limit') || 200)

    let query = supabase
      .from('user_course_requests')
      .select(USER_COURSE_REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') query = query.eq('status', status)

    const term = search.trim()
    if (term) {
      query = query.or(`subject_name.ilike.%${term}%,course_code.ilike.%${term}%,instructor.ilike.%${term}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const profilesMap: Record<string, any> = await fetchProfilesMap((data || []).map((item: any) => item.user_id))
    const rows = (data || []).map((item: any) => ({
      ...item,
      user: profilesMap[item.user_id] || null,
    }))

    return json({ success: true, data: rows })
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
      notification.error = errorMessage(error)
      console.error('Course request approval notification failed:', notification.error)
    }

    return json({ success: true, data: officialCourse, notification, reusedExistingCourse: Boolean(existingCourse?.id) })
  }

  return json({ error: 'Method not allowed' }, 405)
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
    if (resource === 'course-requests') return await handleCourseRequests(req, params)
    if (req.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET' }, 405)
    if (resource === 'user-schedules') return await handleUserSchedules(req, params)
    if (resource === 'my-schedule') return await handleMySchedule(req, params)

    const semester = params.get('semester')
    const phase = params.get('phase')
    const search = params.get('search')
    const limit = Number(params.get('limit') || 50)

    let query = supabase.from('course_schedules').select(COURSE_SCHEDULE_COLUMNS).limit(limit)
    if (semester) query = query.eq('semester', semester)
    if (phase && phase !== 'all') query = query.eq('phase', phase)
    if (search) query = query.or(`subject_name.ilike.%${search}%,course_code.ilike.%${search}%,instructor.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return json({ success: true, data })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
})
