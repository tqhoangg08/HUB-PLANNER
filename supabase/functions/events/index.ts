// supabase/functions/events/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'GET') {
    return json({ error: 'Chỉ hỗ trợ phương thức GET' }, 405)
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) throw error
    return json({ success: true, data: data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
