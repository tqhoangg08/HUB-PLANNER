import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "npm:@upstash/redis";
import { Ratelimit } from "npm:@upstash/ratelimit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

const ratelimit = redisUrl && redisToken
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      analytics: false,
    })
  : null;

type OtpPurpose = "delete_data" | "forgot_password" | "register";

const purposeCopy: Record<OtpPurpose, { title: string; message: string }> = {
  delete_data: {
    title: "Xac nhan xoa du lieu HUB Planner",
    message: "Duoi day la ma xac nhan de tien hanh xoa du lieu cua ban tren he thong:",
  },
  forgot_password: {
    title: "Dat lai mat khau HUB Planner",
    message: "Duoi day la ma xac nhan de dat lai mat khau tai khoan HUB Planner cua ban:",
  },
  register: {
    title: "Xac nhan dang ky HUB Planner",
    message: "Duoi day la ma xac nhan de hoan tat dang ky tai khoan HUB Planner cua ban:",
  },
};

const normalizePurpose = (value: unknown): OtpPurpose => {
  if (value === "forgot_password" || value === "register" || value === "delete_data") return value;
  return "delete_data";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const { success, limit, remaining } = await ratelimit.limit(`otp_${ip}`);

      if (!success) {
        return new Response(
          JSON.stringify({
            error: "Too Many Requests",
            message: "Ban da yeu cau gui ma qua nhieu lan. Vui long thu lai vao ngay mai!",
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

    const { email, passcode, time, purpose: rawPurpose } = await req.json();
    if (!email || !passcode || !time) {
      return new Response(JSON.stringify({ error: "Missing email, passcode or time" }), {
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

    const purpose = normalizePurpose(rawPurpose);
    const copy = purposeCopy[purpose];
    const studentId = String(email).split("@")[0];
    const currentYear = new Date().getFullYear();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "HUB Planner <noreply@hotrosinhvienhub.id.vn>",
        to: [email],
        subject: `${passcode} la ma xac nhan HUB Planner cua ban`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 0; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
              <p style="font-size: 16px; color: #333333; margin-top: 0;">Xin chao <strong>${studentId}</strong>,</p>
              <p style="font-size: 15px; color: #333333; line-height: 1.6;">
                ${copy.message}
              </p>
              <div style="font-size: 38px; font-weight: bold; color: #000000; letter-spacing: 2px; margin: 25px 0;">
                ${passcode}
              </div>
              <p style="font-size: 14px; color: #666666;">
                Ma nay se het han vao luc <strong>${time}</strong>.
              </p>
              <p style="font-size: 14px; color: #333333; margin-bottom: 30px;">
                Neu ban khong yeu cau ma nay, vui long bo qua email nay.
              </p>
              <p style="font-size: 15px; color: #333333; margin-bottom: 5px;">Tran trong,</p>
              <p style="font-size: 15px; font-weight: bold; color: #333333; margin-top: 0;">Doi ngu HUB Planner</p>
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
                    He thong quan ly lo trinh hoc tap va ho tro sinh vien
                  </td>
                </tr>
                <tr>
                  <td colspan="2" align="center" style="padding-top: 30px; font-size: 12px; color: #999999;">
                    © ${currentYear} HUB Planner. Bao luu moi quyen.
                  </td>
                </tr>
              </table>
            </div>
          </div>
        `,
        text: `${passcode} la ma xac nhan HUB Planner. ${copy.title}. Ma het han luc ${time}.`,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: res.ok ? 200 : res.status,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
