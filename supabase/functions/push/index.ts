// supabase/functions/push/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { sendWebPush } from '../_shared/webpush.ts'

const RESOURCE_SEND = 'send'
const RESOURCE_SUBSCRIPTION = 'subscription'
const RESOURCE_ANNOUNCEMENT_QUEUE = 'announcement-queue'
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MINUTES = 10
const PUSH_SPACING_MINUTES = 10

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })
const retryAt = () => new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString()
const parseResource = (params: URLSearchParams, body: any) => String(params.get('resource') || body.resource || '').trim().toLowerCase()
const isAuthorized = (req: Request, params: URLSearchParams, body: any) => {
  const token = params.get('secret') || body.secret || req.headers.get('x-secret-key')
  const bearer = req.headers.get('authorization')
  if (Deno.env.get('CRON_SECRET') && bearer === `Bearer ${Deno.env.get('CRON_SECRET')}`) return true
  if (Deno.env.get('CRON_SECRET') && token === Deno.env.get('CRON_SECRET')) return true
  return Boolean(Deno.env.get('MY_SECRET_SCRAPER_KEY') && token === Deno.env.get('MY_SECRET_SCRAPER_KEY'))
}
const getPushUserFromRequest = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}
const getPushActorRole = async (req: Request) => {
  const user = await getPushUserFromRequest(req)
  if (!user?.id) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role || 'student'
}
const deleteSubscriptionsByEndpoint = async (endpoint: string, exceptUserId?: string) => {
  let query = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (exceptUserId) query = query.neq('user_id', exceptUserId)
  const { error } = await query
  if (error) throw error
}
const categoryFromPayload = (payload: any) => {
  const raw = `${payload?.category || ''} ${payload?.type || ''} ${payload?.url || ''}`.toLowerCase()
  if (raw.includes('event') || raw.includes('/events')) return 'events'
  if (raw.includes('lost') || raw.includes('found') || raw.includes('/lost-found')) return 'lost_found'
  if (raw.includes('schedule') || raw.includes('course') || raw.includes('/schedule')) return 'schedule'
  if (raw.includes('school') || raw.includes('announcement')) return 'school'
  return 'system'
}
const filterSubscriptionsByPreference = async (subscriptions: any[], category: string) => {
  if (!subscriptions.length) return []
  const userIds = Array.from(new Set(subscriptions.map((sub: any) => sub.user_id).filter(Boolean)))
  if (!userIds.length) return subscriptions
  const { data } = await supabase
    .from('notification_preferences')
    .select('user_id, system, events, lost_found, schedule, school')
    .in('user_id', userIds)
  const prefs = new Map((data || []).map((row: any) => [row.user_id, row]))
  return subscriptions.filter((sub: any) => {
    const pref = prefs.get(sub.user_id)
    return !pref || pref[category] !== false
  })
}
const handlePushSubscription = async (req: Request, body: any) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)
  const user = await getPushUserFromRequest(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)
  const subscription = body.subscription
  const endpoint = subscription?.endpoint
  if (!endpoint) return json({ error: 'Missing subscription endpoint' }, 400)
  if (req.method === 'DELETE') {
    await deleteSubscriptionsByEndpoint(endpoint)
    return json({ success: true })
  }
  try {
    await deleteSubscriptionsByEndpoint(endpoint, user.id)
    const { data: existingRows, error: lookupError } = await supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).limit(1)
    if (lookupError) throw lookupError
    if (existingRows?.length) {
      const { error } = await supabase.from('push_subscriptions').update({ user_id: user.id, subscription, endpoint }).eq('id', existingRows[0].id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('push_subscriptions').insert({ user_id: user.id, subscription, endpoint })
      if (error) throw error
    }
    return json({ success: true, userId: user.id })
  } catch (error) {
    return json({ error: 'Cannot sync push subscription', detail: error instanceof Error ? error.message : String(error) }, 500)
  }
}
const handleSendNotification = async (req: Request, body: any) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const { title, body: messageBody, url, targetUserId } = body
  const params = new URL(req.url).searchParams
  const actorRole = await getPushActorRole(req)
  const canBroadcast = isAuthorized(req, params, body) || ['admin', 'editor'].includes(actorRole || '')
  if (!targetUserId && !canBroadcast) return json({ error: 'Forbidden' }, 403)
  let query = supabase.from('push_subscriptions').select('id, endpoint, user_id, subscription')
  if (targetUserId) query = query.eq('user_id', targetUserId)
  const { data: subscriptions, error } = await query
  if (error) return json({ error: error.message }, 500)
  if (!subscriptions?.length) return json({ error: 'Khong tim thay nguoi nhan' }, 404)
  const payloadObject = { title: title || 'HUB Planner', body: messageBody || 'Bạn có thông báo mới.', url: url || '/', category: body.category || undefined }
  const allowedSubscriptions = await filterSubscriptionsByPreference(subscriptions, categoryFromPayload(payloadObject))
  if (!allowedSubscriptions.length) return json({ success: false, skipped: true, message: 'Tat ca nguoi nhan da tat loai thong bao nay', sent: 0, failed: 0 })
  const payload = JSON.stringify(payloadObject)
  const results = await Promise.all(allowedSubscriptions.map(async (sub: any) => {
    try {
      const pushResponse = await sendWebPush(sub.subscription, payload)
      return { id: sub.id, endpoint: sub.endpoint || sub.subscription?.endpoint, ok: true, statusCode: pushResponse.statusCode }
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      return { id: sub.id, endpoint: sub.endpoint || sub.subscription?.endpoint, ok: false, statusCode: error?.statusCode, body: error?.body, message: error?.message }
    }
  }))
  const sent = results.filter((result) => result.ok).length
  return json({ success: sent > 0, message: `Da gui ${sent}/${allowedSubscriptions.length} thiet bi`, sent, skipped: subscriptions.length - allowedSubscriptions.length, failed: results.length - sent, results }, sent > 0 ? 200 : 502)
}
const enqueueRecentAnnouncements = async () => {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: announcements, error } = await supabase.from('school_announcements').select('id, title, link').eq('is_new', true).eq('is_hidden', false).gte('created_at', recentCutoff).order('created_at', { ascending: true }).limit(20)
  if (error || !announcements?.length) return { queued: 0, error: error?.message }
  const ids = announcements.map((item: any) => item.id)
  const { data: queuedRows, error: queuedError } = await supabase.from('school_announcement_push_queue').select('announcement_id').in('announcement_id', ids)
  if (queuedError) return { queued: 0, error: queuedError.message }
  const queuedIds = new Set((queuedRows || []).map((item: any) => item.announcement_id))
  const missingRows = announcements.filter((item: any) => !queuedIds.has(item.id))
  if (!missingRows.length) return { queued: 0 }
  const now = Date.now()
  const rows = missingRows.map((item: any, index: number) => ({ announcement_id: item.id, title: item.title, link: item.link, scheduled_at: new Date(now + index * PUSH_SPACING_MINUTES * 60 * 1000).toISOString() }))
  const { error: upsertError } = await supabase.from('school_announcement_push_queue').upsert(rows, { onConflict: 'announcement_id' })
  return { queued: upsertError ? 0 : rows.length, error: upsertError?.message }
}
const lostFoundBody = (item: any) => `${item.user_name?.trim() || 'Một bạn HUB'} ${item.type === 'FOUND' ? 'vừa nhặt được' : 'vừa làm mất'} ${item.title?.trim() || 'một món đồ'} ở ${item.location?.trim() || 'khu vực HUB'}.`
const lostFoundPayload = (item: any) => ({ title: item.type === 'FOUND' ? 'Có đồ vừa được nhặt' : 'Có bạn vừa báo mất đồ', body: lostFoundBody(item), url: '/lost-found' })
const enqueueRecentLostFoundItems = async () => {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: items, error } = await supabase.from('lost_found_items').select('id, title, location, user_name, type').eq('status', 'approved').eq('is_deleted', false).gte('created_at', recentCutoff).order('created_at', { ascending: true }).limit(20)
  if (error || !items?.length) return { queued: 0, error: error?.message }
  const itemIds = items.map((item: any) => item.id)
  const { data: queuedRows, error: queuedError } = await supabase.from('lost_found_push_queue').select('lost_found_item_id').in('lost_found_item_id', itemIds)
  if (queuedError) return { queued: 0, error: queuedError.message }
  const queuedIds = new Set((queuedRows || []).map((item: any) => item.lost_found_item_id))
  const missingRows = items.filter((item: any) => !queuedIds.has(item.id))
  if (!missingRows.length) return { queued: 0 }
  const now = Date.now()
  const rows = missingRows.map((item: any, index: number) => ({ lost_found_item_id: item.id, title: lostFoundPayload(item).title, body: lostFoundBody(item), url: '/lost-found', scheduled_at: new Date(now + index * PUSH_SPACING_MINUTES * 60 * 1000).toISOString() }))
  const { error: upsertError } = await supabase.from('lost_found_push_queue').upsert(rows, { onConflict: 'lost_found_item_id' })
  return { queued: upsertError ? 0 : rows.length, error: upsertError?.message }
}
const loadSubscriptions = async () => {
  const { data, error } = await supabase.from('push_subscriptions').select('id, endpoint, user_id, subscription')
  if (error) throw error
  return data || []
}
const sendPushToAll = async (subscriptions: any[], payload: any, category?: string) => {
  const allowedSubscriptions = await filterSubscriptionsByPreference(subscriptions, category || categoryFromPayload(payload))
  const results = await Promise.all(allowedSubscriptions.map(async (sub) => {
    try {
      await sendWebPush(sub.subscription, JSON.stringify(payload))
      return { ok: true, id: sub.id }
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      return { ok: false, id: sub.id, statusCode: error?.statusCode, message: error?.message }
    }
  }))
  const sent = results.filter((result) => result.ok).length
  return { sent, skipped: subscriptions.length - allowedSubscriptions.length, failed: results.length - sent, results }
}
const getActorRole = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
  return roleData?.role || 'student'
}
const approveLostFound = async (req: Request, body: any) => {
  const role = await getActorRole(req)
  if (!['admin', 'editor'].includes(role || '')) return json({ error: 'Forbidden' }, 403)
  const itemId = Number(body.id)
  if (!Number.isFinite(itemId)) return json({ error: 'Missing lost-found item id' }, 400)
  const { data: existingItem, error } = await supabase.from('lost_found_items').select('id, title, location, user_name, type, status, is_deleted').eq('id', itemId).maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!existingItem || existingItem.is_deleted) return json({ error: 'Not found' }, 404)
  let item = existingItem
  if (existingItem.status !== 'approved') {
    const { data: approvedItem, error: approveError } = await supabase.from('lost_found_items').update({ status: 'approved' }).eq('id', itemId).select('id, title, location, user_name, type, status, is_deleted').single()
    if (approveError) return json({ error: approveError.message }, 500)
    item = approvedItem
  }
  const payload = lostFoundPayload(item)
  const subscriptions = await loadSubscriptions()
  const pushResult = await sendPushToAll(subscriptions, payload, 'lost_found')
  return json({ success: true, approved: true, ...pushResult })
}
const processQueue = async ({ table, select, payloadFor, emptyMessage, subscriptions }: any) => {
  const nowIso = new Date().toISOString()
  const { data: dueItems, error } = await supabase.from(table).select(select).is('sent_at', null).is('failed_at', null).lte('scheduled_at', nowIso).order('scheduled_at', { ascending: true }).limit(1)
  if (error) return { success: false, sent: 0, error: error.message }
  const item = dueItems?.[0] || null
  if (!item) return { success: true, sent: 0, message: emptyMessage }
  if (!subscriptions.length) {
    await supabase.from(table).update({ sent_at: nowIso, last_error: 'No push subscriptions' }).eq('id', item.id)
    return { success: true, sent: 0, skipped: true, message: 'No subscriptions' }
  }
  const payload = payloadFor(item)
  const result = await sendPushToAll(subscriptions, payload, payload.category)
  if (result.sent > 0) {
    await supabase.from(table).update({ sent_at: new Date().toISOString(), attempts: (item.attempts || 0) + 1 }).eq('id', item.id)
    return { success: true, ...result }
  }
  const attempts = (item.attempts || 0) + 1
  await supabase.from(table).update({ attempts, scheduled_at: attempts >= MAX_ATTEMPTS ? nowIso : retryAt(), failed_at: attempts >= MAX_ATTEMPTS ? nowIso : null, last_error: result.results[0]?.message || 'Push failed' }).eq('id', item.id)
  return { success: false, attempts, ...result }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  const params = new URL(req.url).searchParams
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
  const resource = parseResource(params, body)
  try {
    if (resource === RESOURCE_SUBSCRIPTION) return await handlePushSubscription(req, body)
    if (resource === RESOURCE_SEND) return await handleSendNotification(req, body)
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (req.method === 'POST' && body.action === 'approve-lost-found') return await approveLostFound(req, body)
    if (resource !== RESOURCE_ANNOUNCEMENT_QUEUE) return json({ error: 'Missing or invalid resource' }, 400)
    if (!isAuthorized(req, params, body)) return json({ error: 'Forbidden' }, 403)
    const backfill = { announcements: await enqueueRecentAnnouncements(), lostFound: await enqueueRecentLostFoundItems() }
    const subscriptions = await loadSubscriptions()
    const announcements = await processQueue({ table: 'school_announcement_push_queue', select: 'id, title, link, attempts', subscriptions, emptyMessage: 'No due announcement push', payloadFor: (item: any) => ({ title: 'Thông báo mới từ trường', body: item.title, url: item.link || '/dashboard', category: 'school' }) })
    const lostFound = await processQueue({ table: 'lost_found_push_queue', select: 'id, title, body, url, attempts', subscriptions, emptyMessage: 'No due lost-found push', payloadFor: (item: any) => ({ title: item.title, body: item.body, url: item.url || '/lost-found', category: 'lost_found' }) })
    const ok = announcements.success && lostFound.success
    return json({ success: ok, backfill, announcements, lostFound }, ok ? 200 : 502)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
