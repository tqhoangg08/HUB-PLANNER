import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "npm:@upstash/redis";
import { Ratelimit } from "npm:@upstash/ratelimit";
import { getCorsHeaders, isAllowedCorsOrigin } from "../_shared/cors.ts";

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
const ADMIN_EXPORT_OTP_EMAIL = "tqhoangg2@gmail.com";

const ratelimit = redisUrl && redisToken
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      analytics: false,
    })
  : null;

type OtpPurpose = "delete_data" | "reset_data" | "forgot_password" | "reset_password" | "register" | "admin_export";

const purposeCopy: Record<OtpPurpose, { title: string; subjectAction: string; message: string; safety: string }> = {
  delete_data: {
    title: "Xác nhận xoá dữ liệu HUB Planner",
    subjectAction: "xoá dữ liệu",
    message: "Dưới đây là mã xác nhận để tiến hành xoá dữ liệu của bạn trên hệ thống:",
    safety: "Nếu bạn không yêu cầu xoá dữ liệu, vui lòng bỏ qua email này.",
  },
  reset_data: {
    title: "Xác nhận xoá dữ liệu HUB Planner",
    subjectAction: "xoá dữ liệu",
    message: "Dưới đây là mã xác nhận để tiến hành xoá dữ liệu của bạn trên hệ thống:",
    safety: "Nếu bạn không yêu cầu xoá dữ liệu, vui lòng bỏ qua email này.",
  },
  forgot_password: {
    title: "Đặt lại mật khẩu HUB Planner",
    subjectAction: "cài đặt lại mật khẩu",
    message: "Dưới đây là mã xác nhận để tiến hành cài đặt lại mật khẩu của bạn trên hệ thống:",
    safety: "Nếu bạn không yêu cầu cài đặt lại mật khẩu, vui lòng bỏ qua email này.",
  },
  reset_password: {
    title: "Đặt lại mật khẩu HUB Planner",
    subjectAction: "cài đặt lại mật khẩu",
    message: "Dưới đây là mã xác nhận để tiến hành cài đặt lại mật khẩu của bạn trên hệ thống:",
    safety: "Nếu bạn không yêu cầu cài đặt lại mật khẩu, vui lòng bỏ qua email này.",
  },
  register: {
    title: "Xác nhận đăng ký HUB Planner",
    subjectAction: "tạo mới tài khoản",
    message: "Dưới đây là mã xác nhận để tiến hành tạo mới tài khoản của bạn trên hệ thống:",
    safety: "Nếu bạn không yêu cầu tạo mới tài khoản, vui lòng bỏ qua email này.",
  },
  admin_export: {
    title: "Xác nhận xuất danh sách sinh viên HUB Planner",
    subjectAction: "xuất danh sách sinh viên",
    message: "Dưới đây là mã xác nhận để admin/auditor xuất danh sách sinh viên ra Excel:",
    safety: "Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email và kiểm tra lại quyền truy cập quản trị.",
  },
};

const normalizePurpose = (value: unknown): OtpPurpose => {
  if (
    value === "delete_data" ||
    value === "reset_data" ||
    value === "forgot_password" ||
    value === "reset_password" ||
    value === "register" ||
    value === "admin_export"
  ) {
    return value;
  }
  throw new Error(`Loại OTP không hợp lệ: ${String(value || "missing")}`);
};

const formatVietnamTime = (value?: string) => {
  const parsed = value ? new Date(value) : new Date(Date.now() + 10 * 60 * 1000);
  const date = Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 10 * 60 * 1000) : parsed;
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!isAllowedCorsOrigin(req)) {
      return new Response(JSON.stringify({ error: "Forbidden", message: "Origin not allowed." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const { success, limit, remaining } = await ratelimit.limit(`otp_${ip}`);

      if (!success) {
        return new Response(
          JSON.stringify({
            error: "Too Many Requests",
            message: "Bạn đã yêu cầu gửi mã quá nhiều lần. Vui lòng thử lại vào ngày mai.",
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": remaining.toString(),
            },
          },
        );
      }
    }

    const { email: requestedEmail, passcode, time, expiresAt, purpose: rawPurpose } = await req.json();
    const purpose = normalizePurpose(rawPurpose);
    const email = purpose === "admin_export" ? ADMIN_EXPORT_OTP_EMAIL : requestedEmail;
    if (!email || !passcode) {
      return new Response(JSON.stringify({ error: "Missing email or passcode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const copy = purposeCopy[purpose];
    const studentId = String(email).split("@")[0];
    const currentYear = new Date().getFullYear();
    const expiresTime = formatVietnamTime(expiresAt || time);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "HUB Planner <noreply@hotrosinhvienhub.id.vn>",
        to: [email],
        subject: `Mã xác nhận ${copy.subjectAction} HUB Planner của bạn`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f9f9f9;padding:40px 0;margin:0;">
            <div style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
              <p style="font-size:16px;color:#333333;margin-top:0;">Xin chào <strong>${studentId}</strong>,</p>
              <h2 style="font-size:22px;color:#003375;margin:0 0 18px 0;">${copy.title}</h2>
              <p style="font-size:15px;color:#333333;line-height:1.6;">${copy.message}</p>
              <div style="font-size:38px;font-weight:bold;color:#000000;letter-spacing:2px;margin:25px 0;">${passcode}</div>
              <p style="font-size:14px;color:#666666;">Mã này sẽ hết hạn vào lúc <strong>${expiresTime}</strong>.</p>
              <p style="font-size:14px;color:#333333;margin-bottom:30px;">${copy.safety}</p>
              <p style="font-size:15px;color:#333333;margin-bottom:5px;">Trân trọng,</p>
              <p style="font-size:15px;font-weight:bold;color:#333333;margin-top:0;">Đội ngũ HUB Planner</p>
              <hr style="border:none;border-top:1px solid #eaeaea;margin:30px 0 20px 0;" />
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <a href="https://hotrosinhvienhub.id.vn" target="_blank" style="text-decoration:none;">
                      <span style="font-size:20px;font-weight:900;color:#003375;letter-spacing:-0.5px;">HUB PLANNER</span>
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <a href="https://www.facebook.com/hubplannerr" target="_blank" style="text-decoration:none;margin-left:12px;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="20" height="20" alt="Facebook" style="display:inline-block;filter:grayscale(100%);opacity:0.6;" />
                    </a>
                    <a href="https://hotrosinhvienhub.id.vn" target="_blank" style="text-decoration:none;margin-left:12px;">
                      <img src="https://cdn-icons-png.flaticon.com/512/1006/1006771.png" width="20" height="20" alt="Website" style="display:inline-block;filter:grayscale(100%);opacity:0.6;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;font-size:13px;color:#555555;">
                    Hệ thống quản lý lộ trình học tập và hỗ trợ sinh viên
                  </td>
                </tr>
                <tr>
                  <td colspan="2" align="center" style="padding-top:30px;font-size:12px;color:#999999;">
                    © ${currentYear} HUB Planner. Bảo lưu mọi quyền.
                  </td>
                </tr>
              </table>
            </div>
          </div>
        `,
        text: `${passcode} là mã xác nhận ${copy.subjectAction} HUB Planner. ${copy.title}. Mã hết hạn lúc ${expiresTime}.`,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: res.ok ? 200 : res.status,
    });
  } catch (error) {
    console.error("send-otp-email error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
