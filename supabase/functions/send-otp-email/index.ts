import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Cấu hình CORS để cho phép Web React (Frontend) gọi vào Backend này
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Xử lý yêu cầu kiểm tra (Preflight request) từ trình duyệt
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Nhận dữ liệu do Frontend gửi lên
    const { email, passcode, time } = await req.json()
    
    // 2. Lấy API Key của Resend đang được giấu kín trong két sắt của máy chủ
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    // 3. Ra lệnh cho Resend bắn Email
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
    
    // Trả kết quả về cho Frontend
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