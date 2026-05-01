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

const formatVietnamTime = (date) => date.toLocaleTimeString('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
});

const hashOtp = (email, purpose, otp) => {
  const secret = process.env.OTP_SECRET || process.env.RESEND_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createHash('sha256').update(`${email}:${purpose}:${otp}:${secret}`).digest('hex');
};

const resolveEmail = async (rawValue) => {
  const identifier = normalizeEmail(rawValue);
  if (!identifier) throw new Error('Thiếu Gmail HUB hoặc MSSV.');

  if (identifier.includes('@')) {
    if (!identifier.endsWith(`@${SCHOOL_DOMAIN}`)) {
      const error = new Error(`Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.`);
      error.statusCode = 400;
      throw error;
    }
    return identifier;
  }

  if (!/^[a-z0-9._-]{3,64}$/.test(identifier)) {
    const error = new Error('MSSV không hợp lệ.');
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
    const notFound = new Error('Không tìm thấy MSSV trong hệ thống.');
    notFound.statusCode = 404;
    throw notFound;
  }
  return normalizeEmail(data.email);
};

const passwordError = (password, confirmPassword) => {
  if (!password || password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Hai mật khẩu chưa trùng khớp.';
  return null;
};

const getAuthUserByEmail = async (email) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data?.users?.find((item) => normalizeEmail(item.email) === email);
    if (user) return user;
    if (!data?.users || data.users.length < 1000) return null;
  }
  return null;
};

const markPasswordProfile = async (userId, email) => {
  await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email,
      student_code: email.split('@')[0],
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
};

const deleteRows = async (table, column, value) => {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) console.error(`Skip cleanup ${table}:`, error.message);
};

const sendEmail = async ({ email, otp, purpose }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const expireTime = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const time = formatVietnamTime(expireTime);
    const { data, error } = await supabase.functions.invoke('send-otp-email', {
      body: { email, passcode: otp, time, expiresAt: expireTime.toISOString(), purpose },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Chưa cấu hình RESEND_API_KEY hoac Edge Function gui OTP.');
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
  const expireTime = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const time = formatVietnamTime(expireTime);

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
          <p>M\u00e3 n\u00e0y s\u1ebd h\u1ebft h\u1ea1n v\u00e0o l\u00fac <strong>${time}</strong> theo gi\u1edd Vi\u1ec7t Nam. N\u1ebfu b\u1ea1n kh\u00f4ng y\u00eau c\u1ea7u thao t\u00e1c n\u00e0y, h\u00e3y b\u1ecf qua email.</p>
        </div>
      `,
      text: `${otp} l\u00e0 m\u00e3 x\u00e1c nh\u1eadn HUB Planner. ${title}. M\u00e3 h\u1ebft h\u1ea1n l\u00fac ${time} theo gi\u1edd Vi\u1ec7t Nam.`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Không thể gửi email OTP.');
  }
};

const resolveIdentifier = async (request, response) => {
  const email = await resolveEmail(request.body?.identifier);
  return response.status(200).json({ email });
};

const sendOtp = async (request, response) => {
  const purpose = request.body?.purpose;
  if (!['register', 'forgot_password'].includes(purpose)) {
    return response.status(400).json({ error: 'Loại OTP không hợp lệ.' });
  }

  const email = await resolveEmail(request.body?.email || request.body?.identifier);

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (purpose === 'register' && existingProfile?.id) {
    return response.status(409).json({ error: 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.' });
  }
  if (purpose === 'forgot_password' && !existingProfile?.id) {
    return response.status(404).json({ error: 'Không tìm thấy tài khoản HUB/MSSV này.' });
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
  if (!data) throw new Error('Mã OTP không tồn tại hoặc đã được sử dụng.');
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error('Mã OTP đã hết hạn.');
  if (data.attempts >= MAX_ATTEMPTS) throw new Error('Bạn đã nhập sai quá nhiều lần. Hãy gửi lại mã mới.');

  const expectedHash = hashOtp(email, purpose, otp);
  if (data.otp_hash !== expectedHash) {
    await supabase
      .from('auth_otp_codes')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id);
    throw new Error('Mã OTP không chính xác.');
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
    return response.status(400).json({ error: 'Loại OTP không hợp lệ.' });
  }
  if (!email.endsWith(`@${SCHOOL_DOMAIN}`)) {
    return response.status(400).json({ error: `Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.` });
  }
  if (otp.length !== 6) {
    return response.status(400).json({ error: 'Mã OTP cần đủ 6 chữ số.' });
  }

  const invalidPassword = passwordError(password, confirmPassword);
  if (invalidPassword) return response.status(400).json({ error: invalidPassword });

  await verifyOtpRecord({ email, purpose, otp });

  if (purpose === 'register') {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;

    if (existingProfile?.id) {
      const { error: updateExistingError } = await supabase.auth.admin.updateUserById(existingProfile.id, {
        password,
        user_metadata: { password_set_at: true },
      });
      if (updateExistingError) throw updateExistingError;
      await markPasswordProfile(existingProfile.id, email);
      return response.status(200).json({ email, created: false, passwordUpdated: true });
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { password_set_at: true },
    });
    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
        const existingUser = await getAuthUserByEmail(email);
        if (!existingUser?.id) throw error;

        const { error: updateExistingAuthError } = await supabase.auth.admin.updateUserById(existingUser.id, {
          password,
          user_metadata: {
            ...(existingUser.user_metadata || {}),
            password_set_at: true,
          },
        });
        if (updateExistingAuthError) throw updateExistingAuthError;

        await markPasswordProfile(existingUser.id, email);
        return response.status(200).json({ email, created: false, passwordUpdated: true });
      }
      throw error;
    }

    if (data.user?.id) {
      await markPasswordProfile(data.user.id, email);
    }

    return response.status(200).json({ email, created: true });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.id) throw new Error('Không tìm thấy tài khoản cần đặt lại mật khẩu.');

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password });
  if (updateError) throw updateError;

  await supabase
    .from('profiles')
    .update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  return response.status(200).json({ email, passwordUpdated: true });
};

const deleteAccount = async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Thieu phien dang nhap.' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return response.status(401).json({ error: 'Phien dang nhap khong hop le.' });
  }

  const userId = userData.user.id;
  const email = normalizeEmail(userData.user.email || '');

  try {
    const { data: avatarFiles, error: avatarError } = await supabase.storage.from('avatars').list(userId);
    if (!avatarError && avatarFiles?.length) {
      await supabase.storage
        .from('avatars')
        .remove(avatarFiles.map((file) => `${userId}/${file.name}`));
    }
  } catch (error) {
    console.error('Skip avatar cleanup:', error.message);
  }

  const userIdTables = [
    'activity_logs',
    'ai_chat_logs',
    'benchmark_rankings',
    'bug_reports',
    'comment_likes',
    'comments',
    'course_reports',
    'ctv_requests',
    'donations',
    'event_reports',
    'feedback',
    'lost_found_items',
    'user_schedules',
    'user_participations',
    'user_course_requests',
    'user_roles',
    'notifications',
    'push_subscriptions',
    'schedule_reminders',
  ];

  for (const table of userIdTables) {
    await deleteRows(table, 'user_id', userId);
  }

  if (email) await deleteRows('auth_otp_codes', 'email', email);
  await deleteRows('profiles', 'id', userId);

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;

  return response.status(200).json({ deleted: true });
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
    if (action === 'delete-account') return await deleteAccount(request, response);
    return response.status(400).json({ error: 'Thao tac auth khong hop le.' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message?.includes('already been registered')
      ? 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.'
      : error.message || 'Không thể xử lý xác thực.';
    return response.status(statusCode).json({ error: message });
  }
}

export default withLogging(handler);
