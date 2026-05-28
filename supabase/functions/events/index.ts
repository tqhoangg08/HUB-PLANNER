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
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) throw error
    return json({ success: true, data: data || [] }, 200, headers)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, headers)
  }
})
