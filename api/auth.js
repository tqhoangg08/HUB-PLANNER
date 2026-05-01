import { createHash, randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
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
  if (!identifier) throw new Error('Thieu Gmail HUB hoac MSSV.');

  if (identifier.includes('@')) {
    if (!identifier.endsWith(`@${SCHOOL_DOMAIN}`)) {
      const error = new Error(`Chi ho tro Gmail HUB @${SCHOOL_DOMAIN}.`);
      error.statusCode = 400;
      throw error;
    }
    return identifier;
  }

  if (!/^[a-z0-9._-]{3,64}$/.test(identifier)) {
    const error = new Error('MSSV khong hop le.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('student_code', identifier)
    .maybeSingle();

  if (error) throw error;
  if (!data?.email) {
    const notFound = new Error('Khong tim thay MSSV trong he thong.');
    notFound.statusCode = 404;
    throw notFound;
  }
  return normalizeEmail(data.email);
};

const passwordError = (password, confirmPassword) => {
  if (!password || password.length < 8) return 'Mat khau can it nhat 8 ky tu.';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Hai mat khau chua trung khop.';
  return null;
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
      throw new Error(data?.error || error?.message || 'Chua cau hinh RESEND_API_KEY hoac Edge Function gui OTP.');
    }
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'HUB Planner <onboarding@resend.dev>';
  const title = purpose === 'register'
    ? 'X\u00e1c nh\u1eadn \u0111\u0103ng k\u00fd HUB Planner'
    : '\u0110\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u HUB Planner';
  const actionText = purpose === 'register'
    ? 'ho\u00e0n t\u1ea5t \u0111\u0103ng k\u00fd t\u00e0i kho\u1ea3n'
    : '\u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u';

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `${otp} l\u00e0 m\u00e3 x\u00e1c nh\u1eadn HUB Planner`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin:0 0 12px;color:#003375">${title}</h2>
          <p>M\u00e3 x\u00e1c nh\u1eadn \u0111\u1ec3 ${actionText} c\u1ee7a b\u1ea1n l\u00e0:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#003375;margin:16px 0">${otp}</div>
          <p>M\u00e3 c\u00f3 hi\u1ec7u l\u1ef1c trong ${OTP_TTL_MINUTES} ph\u00fat. N\u1ebfu b\u1ea1n kh\u00f4ng y\u00eau c\u1ea7u thao t\u00e1c n\u00e0y, h\u00e3y b\u1ecf qua email.</p>
        </div>
      `,
      text: `${otp} l\u00e0 m\u00e3 x\u00e1c nh\u1eadn HUB Planner. M\u00e3 c\u00f3 hi\u1ec7u l\u1ef1c trong ${OTP_TTL_MINUTES} ph\u00fat.`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Khong the gui email OTP.');
  }
};

const resolveIdentifier = async (request, response) => {
  const email = await resolveEmail(request.body?.identifier);
  return response.status(200).json({ email });
};

const sendOtp = async (request, response) => {
  const purpose = request.body?.purpose;
  if (!['register', 'forgot_password'].includes(purpose)) {
    return response.status(400).json({ error: 'Loai OTP khong hop le.' });
  }

  const email = await resolveEmail(request.body?.email || request.body?.identifier);

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (purpose === 'register' && existingProfile?.id) {
    return response.status(409).json({ error: 'Email nay da duoc dang ky. Hay chuyen sang dang nhap.' });
  }
  if (purpose === 'forgot_password' && !existingProfile?.id) {
    return response.status(404).json({ error: 'Khong tim thay tai khoan voi Gmail HUB/MSSV nay.' });
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
        error: `Vui long cho ${Math.ceil(retryAfterSeconds / 60)} phut truoc khi gui lai ma OTP.`,
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
};

const verifyOtpRecord = async ({ email, purpose, otp }) => {
  const { data, error } = await supabase
    .from('auth_otp_codes')
    .select('id, otp_hash, attempts, expires_at')
    .eq('email', email)
    .eq('purpose', purpose)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Ma OTP khong ton tai hoac da duoc su dung.');
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error('Ma OTP da het han.');
  if (data.attempts >= MAX_ATTEMPTS) throw new Error('Ban da nhap sai qua nhieu lan. Hay gui lai ma moi.');

  const expectedHash = hashOtp(email, purpose, otp);
  if (data.otp_hash !== expectedHash) {
    await supabase
      .from('auth_otp_codes')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id);
    throw new Error('Ma OTP khong chinh xac.');
  }

  await supabase
    .from('auth_otp_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id);
};

const verifyOtp = async (request, response) => {
  const purpose = request.body?.purpose;
  const email = normalizeEmail(request.body?.email);
  const otp = String(request.body?.otp || '').replace(/\D/g, '').slice(0, 6);
  const password = String(request.body?.password || '');
  const confirmPassword = request.body?.confirmPassword !== undefined ? String(request.body.confirmPassword) : undefined;

  if (!['register', 'forgot_password'].includes(purpose)) {
    return response.status(400).json({ error: 'Loai OTP khong hop le.' });
  }
  if (!email.endsWith(`@${SCHOOL_DOMAIN}`)) {
    return response.status(400).json({ error: `Chi ho tro Gmail HUB @${SCHOOL_DOMAIN}.` });
  }
  if (otp.length !== 6) {
    return response.status(400).json({ error: 'Ma OTP can du 6 chu so.' });
  }

  const invalidPassword = passwordError(password, confirmPassword);
  if (invalidPassword) return response.status(400).json({ error: invalidPassword });

  await verifyOtpRecord({ email, purpose, otp });

  if (purpose === 'register') {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { password_set_at: true },
    });
    if (error) throw error;

    if (data.user?.id) {
      await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          email,
          student_code: email.split('@')[0],
          password_set_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    }

    return response.status(200).json({ email, created: true });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.id) throw new Error('Khong tim thay tai khoan can dat lai mat khau.');

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password });
  if (updateError) throw updateError;

  await supabase
    .from('profiles')
    .update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  return response.status(200).json({ email, passwordUpdated: true });
};

async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chi ho tro phuong thuc POST.' });
  }

  try {
    const action = request.body?.action;
    if (action === 'resolve-identifier') return await resolveIdentifier(request, response);
    if (action === 'send-otp') return await sendOtp(request, response);
    if (action === 'verify-otp') return await verifyOtp(request, response);
    return response.status(400).json({ error: 'Thao tac auth khong hop le.' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message?.includes('already been registered')
      ? 'Email nay da duoc dang ky. Hay chuyen sang dang nhap.'
      : error.message || 'Khong the xu ly xac thuc.';
    return response.status(statusCode).json({ error: message });
  }
}

export default withLogging(handler);
