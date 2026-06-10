import { corsHeaders } from '../_shared/cors.ts'
import { json } from '../_shared/hub_notifications.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })

  return json({
    error: 'hub_notification_chat_disabled',
    message: 'AI tra cứu nội dung thông báo đã được tắt. Vui lòng mở link nguồn chính thức để xem nội dung.',
  }, 410, corsHeaders)
})
