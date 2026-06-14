// supabase/functions/events/index.ts
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const json = (data: unknown, status = 200, headers = corsHeaders) =>
  new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status,
  })

const EVENT_LIST_COLUMNS = [
  'id',
  'title',
  'criteria',
  'points',
  'format',
  'deadline',
  'deadline_time',
  'close_on_full',
  'description',
  'link',
  'organizer',
  'category',
  'classification',
  'location_type',
  'status',
  'is_manually_closed',
  'is_deleted',
  'created_at',
  'event_date',
  'event_time',
  'registration_start_date',
  'registration_start_time',
  'image_url',
].join(', ')

Deno.serve(async (req) => {
  const headers = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 })
  }

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, headers)
  }

  try {
    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 300, 100))
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
    const search = String(url.searchParams.get('search') || '').trim()
    const criteria = String(url.searchParams.get('criteria') || 'all')
    const scope = String(url.searchParams.get('scope') || 'all')
    const sort = String(url.searchParams.get('sort') || 'newest')
    const includeHidden = url.searchParams.has('includeHidden')
      ? url.searchParams.get('includeHidden') === '1'
      : true
    const ids = String(url.searchParams.get('ids') || '')
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))

    let query = supabase
      .from('events')
      .select(EVENT_LIST_COLUMNS, { count: 'exact' })

    if (!includeHidden) query = query.or('is_deleted.is.false,is_deleted.is.null').neq('status', 'pending')
    if (ids.length > 0) query = query.in('id', ids)
    if (criteria && criteria !== 'all' && criteria !== 'participated') query = query.eq('criteria', criteria)
    if (scope === 'internal') query = query.eq('location_type', 'Trong trường')
    if (scope === 'external') query = query.eq('location_type', 'Ngoài trường')
    if (search) query = query.or(`title.ilike.%${search}%,organizer.ilike.%${search}%`)

    if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else if (sort === 'expiring_soon') {
      query = query.order('deadline', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) throw error
    const rows = data || []
    return json({ success: true, data: rows, total: count || 0, hasMore: (count || 0) > offset + rows.length }, 200, headers)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, headers)
  }
})
