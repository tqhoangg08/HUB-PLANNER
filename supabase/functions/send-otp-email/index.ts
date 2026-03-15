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
      const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
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
    // ✉️ LỚP 2: GỬI EMAIL QUA RESEND VỚI TEMPLATE MỚI
    // ============================================================
    const { email, passcode, time } = await req.json()
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    
    // Tách tên người dùng từ email (Ví dụ: 030839230074)
    const studentId = email.split('@')[0];
    const currentYear = new Date().getFullYear();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'HUB Planner <noreply@hotrosinhvienhub.id.vn>',
        to: [email],
        subject: `${passcode} là mã xác nhận HUB Planner của bạn`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 0; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
              
              <p style="font-size: 16px; color: #333333; margin-top: 0;">Xin chào <strong>${studentId}</strong>,</p>
              
              <p style="font-size: 15px; color: #333333; line-height: 1.6;">
                Cảm ơn bạn đã sử dụng HUB Planner. Dưới đây là mã xác nhận để tiến hành xóa dữ liệu của bạn trên hệ thống:
              </p>

              <div style="font-size: 38px; font-weight: bold; color: #000000; letter-spacing: 2px; margin: 25px 0;">
                ${passcode}
              </div>
              
              <p style="font-size: 14px; color: #666666;">
                Mã này sẽ hết hạn vào lúc <strong>${time}</strong>.
              </p>

              <p style="font-size: 14px; color: #333333; margin-bottom: 30px;">
                Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.
              </p>

              <p style="font-size: 15px; color: #333333; margin-bottom: 5px;">Trân trọng,</p>
              <p style="font-size: 15px; font-weight: bold; color: #333333; margin-top: 0;">Đội ngũ HUB Planner</p>

              <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0 20px 0;" />

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <a href="https://hotrosinhvienhub.id.vn" target="_blank" style="text-decoration: none;">
                      <span style="font-size: 20px; font-weight: 900; color: #003375; letter-spacing: -0.5px;">HUB PLANNER</span>
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <a href="https://www.facebook.com/hubplannerr" target="_blank" style="text-decoration: none; margin-left: 12px;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="20" height="20" alt="Facebook" style="display: inline-block; filter: grayscale(100%); opacity: 0.6;" />
                    </a>
                    <a href="https://hotrosinhvienhub.id.vn" target="_blank" style="text-decoration: none; margin-left: 12px;">
                      <img src="https://cdn-icons-png.flaticon.com/512/1006/1006771.png" width="20" height="20" alt="Website" style="display: inline-block; filter: grayscale(100%); opacity: 0.6;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 12px; font-size: 13px; color: #555555;">
                    Hệ thống quản lý lộ trình học tập & hỗ trợ sinh viên
                  </td>
                </tr>
                <tr>
                  <td colspan="2" align="center" style="padding-top: 30px; font-size: 12px; color: #999999;">
                    © ${currentYear} HUB Planner. Bảo lưu mọi quyền.
                  </td>
                </tr>
              </table>

            </div>
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