import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'
import { assertCrawlerSecret, json } from '../_shared/hub_notifications.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders)

  const url = new URL(req.url)

  try {
    assertCrawlerSecret(req, url)
    const [total, success, ocr, failed, latestRun, newRows, backfillProgress] = await Promise.all([
      supabase.from('school_notifications').select('id', { count: 'exact', head: true }),
      supabase.from('school_notifications').select('id', { count: 'exact', head: true }).eq('extraction_status', 'success'),
      supabase.from('school_notifications').select('id', { count: 'exact', head: true }).eq('extraction_method', 'ocr'),
      supabase.from('school_notifications').select('id', { count: 'exact', head: true }).eq('extraction_status', 'failed'),
      supabase.from('school_notification_crawl_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('school_notifications').select('title, published_date, detail_url, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('school_notification_backfill_progress').select('*').order('source_id', { ascending: true }),
    ])

    return json({
      success: true,
      total_notifications: total.count || 0,
      pdf_extract_success: success.count || 0,
      pdf_ocr: ocr.count || 0,
      pdf_failed: failed.count || 0,
      last_crawl: latestRun.data || null,
      backfill_progress: backfillProgress.data || [],
      newest_notifications: newRows.data || [],
    }, 200, corsHeaders)
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, (error as any)?.status || 500, corsHeaders)
  }
})
