// supabase/functions/moderator-notifications/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { sendWebPush } from '../_shared/webpush.ts'

const MODERATOR_ROLES = ['admin', 'auditor']
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })
const truncate = (value: unknown, max = 96) => {
  const text = String(value || '').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`
}
const rowTitle = (row: any, fallback = 'Nội dung mới') => truncate(
  row?.title || row?.event_name || row?.subject_name || row?.error_location || row?.full_name || row?.content || fallback,
)

const CONFIG: Record<string, any> = {
  event_pending: {
    table: 'events',
    select: 'id, title, status',
    valid: (row: any) => row?.status === 'pending',
    title: 'Sự kiện chờ duyệt',
    content: (row: any) => `Có sự kiện mới cần duyệt: ${rowTitle(row, 'Sự kiện mới')}`,
    link: (row: any) => `/events/edit/${row.id}`,
  },
  lost_found_pending: {
    table: 'lost_found_items',
    select: 'id, title, type, status, user_id',
    valid: (row: any) => row?.status === 'pending',
    title: 'Tin thất lạc chờ duyệt',
    content: (row: any) => `Có tin ${row?.type === 'FOUND' ? 'nhặt được đồ' : 'báo mất đồ'} cần duyệt: ${rowTitle(row, 'Tin mới')}`,
    link: () => '/lost-found',
  },
  course_report: {
    table: 'course_reports',
    select: 'id, course_code, subject_name, status, user_id',
    valid: (row: any) => !row?.status || row.status === 'pending',
    title: 'Báo cáo môn học mới',
    content: (row: any) => `Có báo cáo môn học mới: ${truncate(row?.course_code || row?.subject_name || 'Môn học')}`,
    link: () => '/admin-reports',
  },
  event_report: {
    table: 'event_reports',
    select: 'id, event_id, event_name, status, user_id',
    valid: (row: any) => !row?.status || row.status === 'pending',
    title: 'Báo cáo sự kiện mới',
    content: (row: any) => `Có báo cáo sự kiện mới: ${rowTitle(row, 'Sự kiện')}`,
    link: () => '/admin-reports',
  },
  bug_report: {
    table: 'bug_reports',
    select: 'id, error_location, status, user_id',
    valid: (row: any) => !row?.status || row.status === 'pending',
    title: 'Báo lỗi hệ thống mới',
    content: (row: any) => `Có báo lỗi hệ thống mới: ${rowTitle(row, 'Lỗi hệ thống')}`,
    link: () => '/admin-reports',
  },
  feedback: {
    table: 'feedback',
    select: 'id, type, content, status, user_id',
    valid: (row: any) => !row?.status || ['new', 'pending'].includes(row.status),
    title: 'Phản hồi mới',
    content: (row: any) => `Có phản hồi/góp ý mới: ${rowTitle(row, 'Phản hồi')}`,
    link: () => '/admin-reports',
  },
  ctv_request: {
    table: 'ctv_requests',
    select: 'id, full_name, status, user_id',
    valid: (row: any) => !row?.status || row.status === 'pending',
    title: 'Đơn CTV mới',
    content: (row: any) => `Có đơn xin CTV mới: ${rowTitle(row, 'Ứng viên')}`,
    link: () => '/admin-reports',
  },
  user_course_request: {
    table: 'user_course_requests',
    select: 'id, course_code, subject_name, status, user_id',
    valid: (row: any) => !row?.status || row.status === 'pending',
    title: 'Yêu cầu thêm môn mới',
    content: (row: any) => `Có yêu cầu thêm môn mới: ${truncate(row?.course_code || row?.subject_name || 'Môn học')}`,
    link: () => '/schedule',
  },
}

const getRequestUserId = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

const getModeratorIds = async () => {
  const { data: roleRows, error } = await supabase.from('user_roles').select('id, user_id, role').in('role', MODERATOR_ROLES)
  if (error) throw error
  // Push remains a deferred Supabase domain, but moderator identity must not
  // depend on the retired Profile authority merely to validate an existing ID.
  return [...new Set((roleRows || []).map((row: any) => row.user_id || row.id).filter(Boolean))]
}

const sendPushToModerators = async (receiverIds: string[], payload: any) => {
  if (!receiverIds.length) return { sent: 0, failed: 0 }
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_id, subscription')
    .in('user_id', receiverIds)
  if (error) throw error
  if (!subscriptions?.length) return { sent: 0, failed: 0 }
  const body = JSON.stringify(payload)
  const results = await Promise.all(subscriptions.map(async (sub: any) => {
    try {
      await sendWebPush(sub.subscription, body)
      return true
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      console.error('Moderator push failed:', error)
      return false
    }
  }))
  const sent = results.filter(Boolean).length
  return { sent, failed: results.length - sent }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const { kind, recordId } = body
    const config = CONFIG[kind]
    if (!config || !recordId) return json({ error: 'Missing notification kind or recordId' }, 400)

    const { data: row, error } = await supabase.from(config.table).select(config.select).eq('id', recordId).maybeSingle()
    if (error) throw error
    if (!row) return json({ error: 'Record not found' }, 404)
    if (!config.valid(row)) return json({ success: true, skipped: true })

    const receiverIds = await getModeratorIds()
    if (!receiverIds.length) return json({ success: true, notified: 0, push: { sent: 0, failed: 0 } })

    const actorId = row.user_id || await getRequestUserId(req)
    const content = config.content(row)
    const link = config.link(row)
    const { data: existingRows, error: existingError } = await supabase
      .from('notifications')
      .select('receiver_id')
      .in('receiver_id', receiverIds)
      .eq('type', 'system_alert')
      .eq('content', content)
      .eq('link', link)
    if (existingError) throw existingError

    const existingReceivers = new Set((existingRows || []).map((item: any) => item.receiver_id))
    const notificationRows = receiverIds
      .filter((receiverId) => !existingReceivers.has(receiverId))
      .map((receiverId) => ({ receiver_id: receiverId, actor_id: actorId || null, type: 'system_alert', content, link, is_read: false }))
    if (notificationRows.length) {
      const { error: insertError } = await supabase.from('notifications').insert(notificationRows)
      if (insertError) throw insertError
    }
    const push = await sendPushToModerators(receiverIds, { title: config.title, body: content, url: link })
    return json({ success: true, notified: notificationRows.length, push })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
