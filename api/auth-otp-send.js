import { createHash, randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 10 * 60;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeEmail = (value = '') => value.trim().toLowerCase();

const hashOtp = (email, purpose, otp) => {
  const secret = process.env.OTP_SECRET || process.env.RESEND_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createHash('sha256').update(`${email}:${purpose}:${otp}:${secret}`).digest('hex');
};

const resolveEmail = async (rawValue) => {
  const identifier = normalizeEmail(rawValue);
  if (!identifier) throw new Error('Thiếu Gmail HUB hoặc MSSV.');

  if (identifier.includes('@')) return identifier;

  if (!/^[a-z0-9._-]{3,64}$/.test(identifier)) {
    throw new Error('MSSV không hợp lệ.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('student_code', identifier)
    .maybeSingle();

  if (error) throw error;
  if (!data?.email) throw new Error('Không tìm thấy MSSV trong hệ thống.');
  return normalizeEmail(data.email);
};

const sendEmail = async ({ email, otp, purpose }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const expireTime = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const time = expireTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const { data, error } = await supabase.functions.invoke('send-otp-email', {
      body: { email, passcode: otp, time, purpose },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Chưa cấu hình RESEND_API_KEY hoặc Edge Function gửi OTP.');
    }
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'HUB Planner <onboarding@resend.dev>';
  const title = purpose === 'register' ? 'Xác nhận đăng ký HUB Planner' : 'Đặt lại mật khẩu HUB Planner';
  const actionText = purpose === 'register' ? 'hoàn tất đăng ký tài khoản' : 'đặt lại mật khẩu';

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `${otp} là mã xác nhận HUB Planner`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin:0 0 12px;color:#003375">${title}</h2>
          <p>Mã xác nhận để ${actionText} của bạn là:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#003375;margin:16px 0">${otp}</div>
          <p>Mã có hiệu lực trong ${OTP_TTL_MINUTES} phút. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
        </div>
      `,
      text: `${otp} là mã xác nhận HUB Planner. Mã có hiệu lực trong ${OTP_TTL_MINUTES} phút.`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Không thể gửi email OTP.');
  }
};

async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST.' });
  }

  try {
    const purpose = request.body?.purpose;
    if (!['register', 'forgot_password'].includes(purpose)) {
      return response.status(400).json({ error: 'Loại OTP không hợp lệ.' });
    }

    const email = await resolveEmail(request.body?.email || request.body?.identifier);
    if (!email.endsWith(`@${SCHOOL_DOMAIN}`)) {
      return response.status(400).json({ error: `Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.` });
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (purpose === 'register' && existingProfile?.id) {
      return response.status(409).json({ error: 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.' });
    }
    if (purpose === 'forgot_password' && !existingProfile?.id) {
      return response.status(404).json({ error: 'Không tìm thấy tài khoản với Gmail HUB/MSSV này.' });
    }

    const { data: latestOtp, error: latestOtpError } = await supabase
      .from('auth_otp_codes')
      .select('created_at, used_at')
      .eq('email', email)
      .eq('purpose', purpose)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOtpError) throw latestOtpError;
    if (latestOtp && !latestOtp.used_at) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(latestOtp.created_at).getTime()) / 1000);
      const retryAfterSeconds = OTP_COOLDOWN_SECONDS - elapsedSeconds;
      if (retryAfterSeconds > 0) {
        return response.status(429).json({
          email,
          error: `Vui lòng chờ ${Math.ceil(retryAfterSeconds / 60)} phút trước khi gửi lại mã OTP.`,
          retryAfterSeconds,
          cooldownUntil: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
        });
      }
    }

    const otp = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    await supabase
      .from('auth_otp_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('email', email)
      .eq('purpose', purpose)
      .is('used_at', null);

    const { error: insertError } = await supabase
      .from('auth_otp_codes')
      .insert({
        email,
        purpose,
        otp_hash: hashOtp(email, purpose, otp),
        expires_at: expiresAt,
      });

    if (insertError) throw insertError;

    await sendEmail({ email, otp, purpose });

    return response.status(200).json({
      email,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      retryAfterSeconds: OTP_COOLDOWN_SECONDS,
      cooldownUntil: new Date(Date.now() + OTP_COOLDOWN_SECONDS * 1000).toISOString(),
    });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Không thể gửi mã OTP.' });
  }
}

export default withLogging(handler);
