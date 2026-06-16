import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { sendWebPush } from '../_shared/webpush.ts'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VN_OFFSET_MS = 7 * HOUR_MS
const ONE_HOUR_WINDOW_MIN = 65
const ONE_HOUR_WINDOW_MAX = 45
const EVENING_START_MIN = 20 * 60
const EVENING_END_MIN = 20 * 60 + 30
const SCHEDULE_REMINDERS_ENABLED = false
const USER_QUERY_BATCH_SIZE = 50
const COURSE_REMINDER_COLUMNS = 'id, subject_name, shift, day_of_week, weeks, room, exam_date, exam_shift, exam_room'

type CourseRow = Record<string, any>
type ScheduleRow = {
  id: string
  user_id: string
  course_id: string
  semester: string
  custom_data?: any
  course_schedules?: CourseRow
}

type ReminderEvent = {
  userId: string
  userScheduleId: string
  courseId: string
  key: string
  kind: 'tomorrow' | 'one_hour'
  title: string
  body: string
  url: string
  startMinutes?: number
  scheduledFor: string
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const chunkArray = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_value, index) => items.slice(index * size, index * size + size))

const parseJson = (value: any) => {
  if (!value) return {}
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const splitData = (value?: string) => {
  if (!value) return []
  const text = value.toString().trim()
  if (!text) return []
  if (text.includes('\n')) return text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  return text.split(/\s+/).filter(Boolean)
}

const parseWeeks = (weeks?: string): number[] => {
  if (!weeks) return []
  const result = new Set<number>()

  weeks
    .toString()
    .replace(/[,;]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const range = part.match(/^(\d+)\s*-\s*(\d+)$/)
      if (range) {
        const start = Number(range[1])
        const end = Number(range[2])
        for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) result.add(week)
        return
      }

      const week = Number(part)
      if (Number.isFinite(week)) result.add(week)
    })

  return [...result]
}

const getMainShiftType = (shift?: string) => {
  const normalized = (shift || '').trim().toUpperCase()
  if (normalized === 'S') return 'S'
  if (normalized === 'C') return 'C'
  if (/\b(6|7|8|9|10)\b/.test(normalized)) return 'C'
  if (/\b(1|2|3|4|5)\b/.test(normalized)) return 'S'
  return ''
}

const getCourseStart = (shift?: string) => {
  const normalized = (shift || '').trim().toUpperCase()
  if (normalized === 'S') return { time: '07:00', minutes: 7 * 60, range: '07:00 - 11:05' }
  if (normalized === 'C') return { time: '13:00', minutes: 13 * 60, range: '13:00 - 17:05' }
  if (normalized.includes('1-3')) return { time: '07:00', minutes: 7 * 60, range: '07:00 - 09:15' }
  if (normalized.includes('4-5')) return { time: '09:35', minutes: 9 * 60 + 35, range: '09:35 - 11:05' }
  if (normalized.includes('6-8')) return { time: '13:00', minutes: 13 * 60, range: '13:00 - 15:15' }
  if (normalized.includes('9-10')) return { time: '15:35', minutes: 15 * 60 + 35, range: '15:35 - 17:05' }
  return getMainShiftType(normalized) === 'C'
    ? { time: '13:00', minutes: 13 * 60, range: '13:00 - 17:05' }
    : { time: '07:00', minutes: 7 * 60, range: '07:00 - 11:05' }
}

const getExamStart = (shift?: string) => {
  const normalized = (shift || '').replace(/\s/g, '').toUpperCase()
  const map: Record<string, string> = {
    CA1: '07:00',
    '1': '07:00',
    CA2: '09:30',
    '2': '09:30',
    CA3: '13:00',
    '3': '13:00',
    CA4: '15:30',
    '4': '15:30',
    CA5: '18:00',
    '5': '18:00',
    CAS1: '07:00',
    S1: '07:00',
    CAS2: '08:30',
    S2: '08:30',
    CAS3: '10:00',
    S3: '10:00',
    CAC1: '13:00',
    C1: '13:00',
    CAC2: '14:30',
    C2: '14:30',
    CAC3: '16:00',
    C3: '16:00',
  }
  const time = map[normalized] || '07:00'
  const [hour, minute] = time.split(':').map(Number)
  return { time, minutes: hour * 60 + minute }
}

const pad = (value: number) => value.toString().padStart(2, '0')

const getVnParts = (timestamp = Date.now()) => {
  const date = new Date(timestamp + VN_OFFSET_MS)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  }
}

const makeVnDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day))

const addDays = (parts: ReturnType<typeof getVnParts>, days: number) => {
  const date = makeVnDate(parts.year, parts.month, parts.day + days)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

const dateInfo = (parts: { year: number; month: number; day: number }, semester?: string) => {
  const date = makeVnDate(parts.year, parts.month, parts.day)
  const dayOfWeek = date.getUTCDay() === 0 ? 8 : date.getUTCDay() + 1
  const start = semester === 'HK1_2025_2026' ? Date.UTC(2025, 7, 11) : Date.UTC(2026, 1, 2)

  return {
    iso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    display: `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`,
    dayMonth: `${pad(parts.day)}/${pad(parts.month)}`,
    dayOfWeek,
    week: Math.floor((date.getTime() - start) / DAY_MS / 7) + 1,
  }
}

const matchesDate = (value: string | undefined, target: ReturnType<typeof dateInfo>) => {
  if (!value) return false
  const text = value.trim()
  return text === target.display || text === target.dayMonth
}

const getCourseDetailsForSlot = (course: CourseRow, targetDay: number, targetWeek: number, targetShiftType: string) => {
  const weekArr = splitData(course.weeks)
  const dayArr = splitData(course.day_of_week)
  const roomArr = splitData(course.room)
  const shiftArr = splitData(course.shift)
  const maxLen = Math.max(weekArr.length, dayArr.length, shiftArr.length)

  for (let index = maxLen - 1; index >= 0; index -= 1) {
    const dayText = dayArr[index] !== undefined ? dayArr[index] : (dayArr[dayArr.length - 1] || '')
    const shiftText = shiftArr[index] !== undefined ? shiftArr[index] : (shiftArr[0] || '')
    const roomText = roomArr[index] !== undefined ? roomArr[index] : (roomArr[0] || '')
    const weekText = weekArr[index] !== undefined ? weekArr[index] : (weekArr[0] || '')

    if (!parseWeeks(weekText).includes(targetWeek)) continue

    const days = dayText.replace(/,/g, ' ').trim().split(/\s+/).map(Number)
    if (!days.includes(targetDay)) continue
    if (getMainShiftType(shiftText) !== targetShiftType) continue

    return { shift: shiftText, room: roomText, weeks: weekText }
  }

  return null
}

const labelText = (label: any) => label.type === 'Khác' ? (label.text || 'Ghi chú') : label.type

const makeReminder = (
  base: Omit<ReminderEvent, 'kind' | 'title' | 'body' | 'scheduledFor'> & { date: string },
  kind: ReminderEvent['kind'],
  title: string,
  body: string,
): ReminderEvent => ({
  ...base,
  kind,
  title,
  body,
  scheduledFor: `${base.date}T00:00:00+07:00`,
  key: `${base.userId}:${kind}:${base.key}`,
})

const buildEventsForDate = (row: ScheduleRow, target: ReturnType<typeof dateInfo>, kind: ReminderEvent['kind']) => {
  const baseCourse = row.course_schedules
  if (!baseCourse || !row.user_id) return []

  const customData = parseJson(row.custom_data)
  const course = { ...baseCourse, ...customData, id: baseCourse.id }
  const subject = course.subject_name || 'Môn học'
  const events: ReminderEvent[] = []
  const labels = (course.labels || []).filter((label: any) => matchesDate(label.date, target))
  const labelsBlockNormalClass = labels.length > 0

  const add = (key: string, startMinutes: number | undefined, title: string, body: string) => {
    events.push(makeReminder({
      userId: row.user_id,
      userScheduleId: row.id,
      courseId: course.id,
      key,
      date: target.iso,
      url: '/schedule',
      startMinutes,
    }, kind, title, body))
  }

  const slots = ['S', 'C']
    .map((slot) => {
      const details = getCourseDetailsForSlot(course, target.dayOfWeek, target.week, slot)
      if (!details) return null
      const start = getCourseStart(details.shift)
      return { details, start }
    })
    .filter(Boolean) as Array<{ details: { shift: string; room: string }; start: ReturnType<typeof getCourseStart> }>

  labels.forEach((label: any) => {
    const text = labelText(label)
    const isOff = text.toLowerCase().includes('nghỉ')
    const slot = slots[0]
    const title = kind === 'tomorrow' ? `Ngày mai: ${text}` : `Sắp đến: ${text}`
    const body = slot && !isOff
      ? `${subject} lúc ${slot.start.range}${slot.details.room ? ` tại P. ${slot.details.room}` : ''}.`
      : `${subject}${isOff ? ' được đánh dấu nghỉ.' : ' có nhãn trong thời khóa biểu.'}`

    add(`label:${label.id || text}:${course.id}`, isOff ? undefined : slot?.start.minutes, title, body)
  })

  ;(course.makeup_schedules || [])
    .filter((item: any) => matchesDate(item.date, target))
    .forEach((item: any) => {
      const start = getCourseStart(item.shift)
      add(
        `makeup:${item.id || item.date}:${course.id}`,
        start.minutes,
        kind === 'tomorrow' ? 'Ngày mai có lịch học bù' : 'Sắp tới giờ học bù',
        `${subject} lúc ${start.range}${item.room ? ` tại P. ${item.room}` : ''}.`,
      )
    })

  if (matchesDate(course.exam_date, target)) {
    const start = getExamStart(course.exam_shift)
    add(
      `exam:${course.exam_date}:${course.id}`,
      start.minutes,
      kind === 'tomorrow' ? 'Ngày mai có lịch thi' : 'Sắp tới giờ thi',
      `${subject} lúc ${start.time}${course.exam_room ? ` tại P. ${course.exam_room}` : ''}.`,
    )
  }

  if (!labelsBlockNormalClass) {
    slots.forEach(({ details, start }) => {
      add(
        `class:${target.iso}:${details.shift}:${course.id}`,
        start.minutes,
        kind === 'tomorrow' ? 'Ngày mai có lịch học' : 'Sắp tới giờ học',
        `${subject} lúc ${start.range}${details.room ? ` tại P. ${details.room}` : ''}.`,
      )
    })
  }

  return events
}

const shouldSend = (event: ReminderEvent, nowMinutes: number) => {
  if (event.kind === 'tomorrow') return true
  if (event.startMinutes === undefined) return false
  const minutesUntil = event.startMinutes - nowMinutes
  return minutesUntil <= ONE_HOUR_WINDOW_MIN && minutesUntil >= ONE_HOUR_WINDOW_MAX
}

const reserveReminders = async (events: ReminderEvent[]) => {
  if (!events.length) return []
  const uniqueEventsByKey = new Map<string, ReminderEvent>()
  events.forEach((event) => {
    if (!uniqueEventsByKey.has(event.key)) uniqueEventsByKey.set(event.key, event)
  })

  const uniqueEvents = [...uniqueEventsByKey.values()]
  const { data, error } = await supabase
    .from('schedule_notification_logs')
    .upsert(uniqueEvents.map((event) => ({
      user_id: event.userId,
      user_schedule_id: event.userScheduleId,
      course_id: event.courseId,
      reminder_key: event.key,
      reminder_kind: event.kind,
      scheduled_for: event.scheduledFor,
    })), { onConflict: 'reminder_key', ignoreDuplicates: true })
    .select('reminder_key')

  if (error) {
    if ((error as any).code === '23505') return []
    throw error
  }

  const insertedKeys = new Set((data || []).map((row: any) => row.reminder_key))
  return uniqueEvents.filter((event) => insertedKeys.has(event.key))
}

const sendToUser = async (event: ReminderEvent, subscriptions: any[]) => {
  const payload = JSON.stringify({ title: event.title, body: event.body, url: event.url })
  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      await sendWebPush(sub.subscription, payload)
      return true
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
      console.error('Schedule reminder push failed:', error)
      return false
    }
  }))

  return results.filter(Boolean).length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  const cronSecret = Deno.env.get('CRON_SECRET')
  const legacyCronSecret = Deno.env.get('MY_SECRET_SCRAPER_KEY')
  if (cronSecret || legacyCronSecret) {
    const url = new URL(req.url)
    const token = req.headers.get('authorization')?.replace('Bearer ', '') || url.searchParams.get('secret')
    if (token !== cronSecret && token !== legacyCronSecret) return json({ success: false, error: 'Unauthorized' }, 401)
  }

  if (!SCHEDULE_REMINDERS_ENABLED) {
    return json({
      success: true,
      disabled: true,
      sent: 0,
      skipped: 0,
      candidates: 0,
      message: 'Schedule reminders are disabled',
    })
  }

  try {
    const now = getVnParts()
    const nowMinutes = now.hour * 60 + now.minute
    const runTomorrow = nowMinutes >= EVENING_START_MIN && nowMinutes < EVENING_END_MIN
    const todayInfo = dateInfo(now)
    const tomorrowParts = addDays(now, 1)

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription')

    if (subError) return json({ success: false, error: subError.message }, 500)
    if (!subscriptions?.length) return json({ success: true, sent: 0, message: 'No subscriptions' })

    const subscriptionsByUser = new Map<string, any[]>()
    subscriptions.forEach((sub: any) => {
      if (!sub.user_id) return
      subscriptionsByUser.set(sub.user_id, [...(subscriptionsByUser.get(sub.user_id) || []), sub])
    })

    const userIds = [...subscriptionsByUser.keys()]
    const scheduleRows: any[] = []
    for (const userIdBatch of chunkArray(userIds, USER_QUERY_BATCH_SIZE)) {
      const { data, error: scheduleError } = await supabase
        .from('user_schedules')
        .select(`id, user_id, course_id, semester, custom_data, course_schedules (${COURSE_REMINDER_COLUMNS})`)
        .in('user_id', userIdBatch)

      if (scheduleError) return json({ success: false, error: scheduleError.message }, 500)
      scheduleRows.push(...(data || []))
    }

    const events = scheduleRows.flatMap((row: any) => {
      const rowTodayInfo = dateInfo(now, row.semester)
      const rowTomorrowInfo = dateInfo(tomorrowParts, row.semester)
      return [
        ...buildEventsForDate(row, rowTodayInfo, 'one_hour'),
        ...(runTomorrow ? buildEventsForDate(row, rowTomorrowInfo, 'tomorrow') : []),
      ]
    }).filter((event: ReminderEvent) => shouldSend(event, nowMinutes))

    let sent = 0
    const reservedEvents = await reserveReminders(events)
    let skipped = events.length - reservedEvents.length

    for (const event of reservedEvents) {
      sent += await sendToUser(event, subscriptionsByUser.get(event.userId) || [])
    }

    return json({
      success: true,
      sent,
      skipped,
      candidates: events.length,
      runTomorrow,
      now: `${todayInfo.iso} ${pad(now.hour)}:${pad(now.minute)} Asia/Ho_Chi_Minh`,
    })
  } catch (error) {
    console.error('Schedule reminder failed:', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
