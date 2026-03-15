import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Import Upstash theo chuẩn của Deno (thêm npm: ở trước)
import { Redis } from "npm:@upstash/redis"
import { Ratelimit } from "npm:@upstash/ratelimit"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Khởi tạo Redis & Rate Limiter từ biến môi trường
const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

const ratelimit = (redisUrl && redisToken)
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      // Giới hạn: 1 IP chỉ được gửi tối đa 5 mã OTP trong 1 ngày
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      analytics: false,
    })
  : null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ============================================================
    // 🛡️ LỚP 1: RATE LIMITING (Chống Spam API Gửi Mail)
    // ============================================================
    if (ratelimit) {
      // Lấy IP thật của người dùng (Supabase giấu trong header x-forwarded-for)
      const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
      
      // Prefix 'otp_' để tách biệt giới hạn này với giới hạn OCR PDF của bạn
      const { success, limit, remaining } = await ratelimit.limit(`otp_${ip}`);

      if (!success) {
        console.warn(`⛔ Spam OTP Blocked for IP: ${ip}`);
        return new Response(
          JSON.stringify({ 
            error: "Too Many Requests", 
            message: "Bạn đã yêu cầu gửi mã quá nhiều lần. Vui lòng thử lại vào ngày mai!" 
          }), 
          { 
            status: 429, 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString()
            } 
          }
        );
      }
    }

    // ============================================================
    // ✉️ LỚP 2: GỬI EMAIL QUA RESEND
    // ============================================================
    const { email, passcode, time } = await req.json()
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'HUB Planner <noreply@hotrosinhvienhub.id.vn>',
        to: [email],
        subject: '[HUB Planner] Mã xác nhận xóa dữ liệu',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #003375; text-align: center;">HUB PLANNER</h2>
            <p>Chào bạn,</p>
            <p>Bạn vừa yêu cầu xóa vĩnh viễn dữ liệu trên hệ thống.</p>
            <p>Mã OTP xác nhận của bạn là: <strong style="font-size: 24px; color: #990000; letter-spacing: 3px;">${passcode}</strong></p>
            <p>Mã này sẽ có hiệu lực trong 15 phút (đến <strong>${time}</strong>).</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #777;">Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không yêu cầu, vui lòng phớt lờ email này.</p>
          </div>
        `
      })
    })

    const data = await res.json()
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})