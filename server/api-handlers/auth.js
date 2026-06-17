import { createHash, createHmac, randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';
import { handleCors } from '../api-cors.js';
import protectedSubmitHandler from './protected-submit.js';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const R2_ENDPOINT = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : '';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeEmail = (value = '') => value.trim().toLowerCase();

const getClientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return request.headers['cf-connecting-ip'] || forwarded || request.socket?.remoteAddress || undefined;
};

const verifyTurnstile = async (request, token) => {
  const secret = process.env.TURNSTILE_SECRET_KEY
    || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    || process.env.TURNSTILE_SITE_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return;
    const error = new Error('Hệ thống xác minh đang tạm thời không sẵn sàng.');
    error.statusCode = 500;
    throw error;
  }
  if (!token || typeof token !== 'string') {
    const error = new Error('Vui lòng xác minh bạn không phải robot.');
    error.statusCode = 400;
    throw error;
  }
  const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: getClientIp(request),
    }),
  });
  const result = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok || !result.success) {
    const error = new Error('Xác minh bảo mật không thành công. Vui lòng thử lại.');
    error.statusCode = 400;
    throw error;
  }
};

const encodeR2Path = (key) => key.split('/').map(encodeURIComponent).join('/');

const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding);
const anonymizationSecret = () => process.env.DATA_ANONYMIZATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'hub-planner';
const anonymizedUserHash = (userId) => hmac(anonymizationSecret(), `user:${userId}`, 'hex');

const subscriptionExpiryForPlan = (plan) => {
  const now = new Date();
  if (plan === 'plus') {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }
  if (plan === 'pro') {
    now.setMonth(now.getMonth() + 6);
    return now.toISOString();
  }
  return null;
};

const getSignatureKey = (secretKey, dateStamp, region, service) => {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const getR2Config = () => {
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.R2_PUBLIC_URL;

  if (!R2_ENDPOINT || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    const error = new Error('Chưa cấu hình R2. Cần R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.');
    error.statusCode = 500;
    throw error;
  }

  return { bucket, accessKeyId, secretAccessKey, publicBaseUrl };
};

const putR2Object = async ({ key, body, contentType }) => {
  const { bucket, accessKeyId, secretAccessKey } = getR2Config();
  const encodedKey = encodeR2Path(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    `/${bucket}/${encodedKey}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signature = hmac(getSignatureKey(secretAccessKey, dateStamp, region, service), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadResponse = await fetch(`${R2_ENDPOINT}/${bucket}/${encodedKey}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
    body,
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(`Không thể upload avatar lên R2 (${uploadResponse.status}). ${detail}`.trim());
  }
};

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
    .select('id')
    .eq('student_code', identifier)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    const notFound = new Error('Không tìm thấy MSSV trong hệ thống.');
    notFound.statusCode = 404;
    throw notFound;
  }
  const { data: privateProfile, error: privateError } = await supabase
    .from('profile_private_data')
    .select('email')
    .eq('user_id', data.id)
    .maybeSingle();
  if (privateError) throw privateError;
  if (!privateProfile?.email) {
    const notFound = new Error('Không tìm thấy email của MSSV này.');
    notFound.statusCode = 404;
    throw notFound;
  }
  return normalizeEmail(privateProfile.email);
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

const getPrivateProfileByEmail = async (email) => {
  const { data, error } = await supabase
    .from('profile_private_data')
    .select('user_id, email')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const markPasswordProfile = async (userId, email) => {
  await supabase
    .from('profiles')
    .upsert({
      id: userId,
      student_code: email.split('@')[0],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  const now = new Date().toISOString();
  const { data: updated, error: updatePrivateError } = await supabase
    .from('profile_private_data')
    .update({
      email,
      password_set_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();

  if (updatePrivateError) throw updatePrivateError;
  if (updated?.user_id) return;

  await supabase
    .from('profile_private_data')
    .insert({
      user_id: userId,
      email,
      data: {},
      password_set_at: now,
      updated_at: now,
    });
};

const deleteRows = async (table, column, value) => {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) console.error(`Skip cleanup ${table}:`, error.message);
};

const getClientInfo = (request) => ({
  ip: request.headers['cf-connecting-ip']
    || request.headers['x-forwarded-for']
    || request.headers['x-real-ip']
    || null,
  userAgent: request.headers['user-agent'] || null,
});

const recordPolicyConsentForUser = async ({
  request,
  userId,
  policyType,
  policyVersion,
  context,
  metadata = {},
}) => {
  if (!policyType || !/^[a-z0-9_.:-]{3,80}$/i.test(policyType)) return;
  const clientInfo = getClientInfo(request);
  const { error } = await supabase.from('policy_consents').insert({
    user_id: userId,
    user_id_hash: anonymizedUserHash(userId),
    policy_type: policyType,
    policy_version: String(policyVersion || '2026-06-11').slice(0, 80),
    consent_context: String(context || 'registration').slice(0, 80),
    accepted: true,
    source: 'web',
    ip_address: Array.isArray(clientInfo.ip) ? clientInfo.ip[0] : clientInfo.ip,
    device_info: clientInfo.userAgent,
    metadata,
  });
  if (error) console.error('Failed to record policy consent:', error.message);
};

const recordPolicyConsent = async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Thiếu phiên đăng nhập.' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return response.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });

  await recordPolicyConsentForUser({
    request,
    userId: data.user.id,
    policyType: String(request.body?.policyType || ''),
    policyVersion: request.body?.policyVersion,
    context: request.body?.context || 'manual',
    metadata: { action: 'record-policy-consent' },
  });
  return response.status(200).json({ recorded: true });
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
      throw new Error(data?.error || error?.message || 'Chưa cấu hình RESEND_API_KEY hoặc Edge Function gửi OTP.');
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
  await verifyTurnstile(request, request.body?.turnstileToken || request.body?.captchaToken);

  const email = await resolveEmail(request.body?.email || request.body?.identifier);

  const existingProfile = await getPrivateProfileByEmail(email);

  if (purpose === 'register' && existingProfile?.user_id) {
    return response.status(409).json({ error: 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.' });
  }
  if (purpose === 'forgot_password' && !existingProfile?.user_id) {
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
    const existingProfile = await getPrivateProfileByEmail(email);

    if (existingProfile?.user_id) {
      const { error: updateExistingError } = await supabase.auth.admin.updateUserById(existingProfile.user_id, {
        password,
        user_metadata: { password_set_at: true },
      });
      if (updateExistingError) throw updateExistingError;
      await markPasswordProfile(existingProfile.user_id, email);
      if (Array.isArray(request.body?.acceptedPolicies)) {
        for (const policy of request.body.acceptedPolicies) {
          await recordPolicyConsentForUser({
            request,
            userId: existingProfile.user_id,
            policyType: String(policy?.type || policy),
            policyVersion: policy?.version,
            context: policy?.context || 'registration',
            metadata: { auth_flow: 'register_existing_profile_password_update' },
          });
        }
      }
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
        if (Array.isArray(request.body?.acceptedPolicies)) {
          for (const policy of request.body.acceptedPolicies) {
            await recordPolicyConsentForUser({
              request,
              userId: existingUser.id,
              policyType: String(policy?.type || policy),
              policyVersion: policy?.version,
              context: policy?.context || 'registration',
              metadata: { auth_flow: 'register_existing_auth_password_update' },
            });
          }
        }
        return response.status(200).json({ email, created: false, passwordUpdated: true });
      }
      throw error;
    }

    if (data.user?.id) {
      await markPasswordProfile(data.user.id, email);
      if (Array.isArray(request.body?.acceptedPolicies)) {
        for (const policy of request.body.acceptedPolicies) {
          await recordPolicyConsentForUser({
            request,
            userId: data.user.id,
            policyType: String(policy?.type || policy),
            policyVersion: policy?.version,
            context: policy?.context || 'registration',
            metadata: { auth_flow: 'register_new_user' },
          });
        }
      }
    }

    return response.status(200).json({ email, created: true });
  }

  const profile = await getPrivateProfileByEmail(email);
  const profileError = null;
  if (profile?.user_id) profile.id = profile.user_id;
  if (!profile?.id) throw new Error('Không tìm thấy tài khoản cần đặt lại mật khẩu.');

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password });
  if (updateError) throw updateError;

  await supabase
    .from('profile_private_data')
    .update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', profile.id);

  await supabase
    .from('profiles')
    .update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  return response.status(200).json({ email, passwordUpdated: true });
};

const deleteAccount = async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Thiếu phiên đăng nhập.' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return response.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const userId = userData.user.id;
  const email = normalizeEmail(userData.user.email || '');
  const userIdHash = anonymizedUserHash(userId);

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

  const { error: anonymizeError } = await supabase.rpc('anonymize_deleted_user_logs', {
    p_user_id: userId,
    p_user_id_hash: userIdHash,
    p_reason: 'account_hard_delete',
  });
  if (anonymizeError) console.error('Skip log anonymization:', anonymizeError.message);

  await supabase.from('activity_logs').insert({
    user_id: null,
    user_email: null,
    action: 'delete_account_hard_delete',
    target_table: 'auth.users',
    target_id: userIdHash,
    details: {
      anonymized: true,
      user_id_hash: userIdHash,
      legal_technique: 'de-identification',
      law_reference: 'Khoan 11 Dieu 2 Luat BVDLCN 2025',
    },
    metadata: {
      source: 'auth_api_handler',
      deleted_tables_policy: 'hard_delete_personal_data',
    },
    status: 'success',
    created_at: new Date().toISOString(),
  });

  const userIdTables = [
    'ai_chat_logs',
    'benchmark_rankings',
    'bug_reports',
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
    'payment_requests',
    'practice_attempts',
    'practice_pro_access',
    'profile_private_data',
    'push_subscriptions',
    'schedule_reminders',
    'subscriptions',
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

const createAvatarUpload = async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Thiếu phiên đăng nhập.' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return response.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.R2_PUBLIC_URL;

  if (!R2_ENDPOINT || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return response.status(500).json({
      error: 'Chưa cấu hình R2. Cần R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.',
    });
  }

  const contentType = String(request.body?.contentType || 'image/webp');
  const size = Number(request.body?.size || 0);
  if (!contentType.startsWith('image/')) {
    return response.status(400).json({ error: 'File avatar phải là ảnh.' });
  }
  if (!size || size > 350 * 1024) {
    return response.status(400).json({ error: 'Avatar cần nhỏ hơn 350KB sau khi nén.' });
  }

  const extension = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp';
  const userId = userData.user.id;
  const key = `avatars/${userId}/${Date.now()}.${extension}`;
  const encodedKey = encodeR2Path(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const expires = 300;

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  });

  const canonicalRequest = [
    'PUT',
    `/${bucket}/${encodedKey}`,
    queryParams.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  queryParams.set('X-Amz-Signature', signature);

  const uploadUrl = `${R2_ENDPOINT}/${bucket}/${encodedKey}?${queryParams.toString()}`;
  const publicUrl = `${publicBaseUrl.replace(/\/$/, '')}/${encodedKey}`;

  return response.status(200).json({ uploadUrl, publicUrl, key, expiresInSeconds: expires });
};

const uploadAvatar = async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Thiếu phiên đăng nhập.' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return response.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const { publicBaseUrl } = getR2Config();
  const contentType = String(request.body?.contentType || 'image/webp');
  const size = Number(request.body?.size || 0);
  const base64 = String(request.body?.base64 || '');

  if (!contentType.startsWith('image/')) {
    return response.status(400).json({ error: 'File avatar phải là ảnh.' });
  }
  if (!size || size > 350 * 1024) {
    return response.status(400).json({ error: 'Avatar cần nhỏ hơn 350KB sau khi nén.' });
  }
  if (!base64) {
    return response.status(400).json({ error: 'Thiếu dữ liệu avatar.' });
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || Math.abs(buffer.length - size) > 8) {
    return response.status(400).json({ error: 'Dữ liệu avatar không hợp lệ.' });
  }

  const extension = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp';
  const userId = userData.user.id;
  const key = `avatars/${userId}/${Date.now()}.${extension}`;
  await putR2Object({ key, body: buffer, contentType });

  return response.status(200).json({
    publicUrl: `${publicBaseUrl.replace(/\/$/, '')}/${encodeR2Path(key)}`,
    key,
  });
};

const requireAdminUser = async (request) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const userId = userData.user.id;
  const { data: roleRow, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!roleRow?.role) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }

  return userData.user;
};

const upsertSubscription = async ({ userId, plan, sourcePaymentId = null, updatedBy }) => {
  if (!['free', 'plus', 'pro'].includes(plan)) {
    const error = new Error('Invalid subscription plan.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      plan,
      status: 'active',
      starts_at: new Date().toISOString(),
      expires_at: subscriptionExpiryForPlan(plan),
      source_payment_id: sourcePaymentId,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const adminSetSubscription = async (request, response) => {
  const adminUser = await requireAdminUser(request);
  const { userId, plan } = request.body || {};
  if (!userId || !plan) return response.status(400).json({ error: 'Missing subscription data.' });

  const data = await upsertSubscription({
    userId,
    plan,
    updatedBy: adminUser.id,
  });

  return response.status(200).json({ success: true, data });
};

const approvePaymentRequest = async (request, response) => {
  const adminUser = await requireAdminUser(request);
  const { requestId } = request.body || {};
  if (!requestId) return response.status(400).json({ error: 'Missing payment request id.' });

  const { data: paymentRequest, error: readError } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (readError) throw readError;
  if (paymentRequest.status === 'rejected') {
    return response.status(409).json({ error: 'Payment request was rejected.' });
  }

  const { error: updateError } = await supabase
    .from('payment_requests')
    .update({
      status: 'approved',
      paid_at: paymentRequest.paid_at || new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: adminUser.id,
    })
    .eq('id', requestId);

  if (updateError) throw updateError;

  const data = await upsertSubscription({
    userId: paymentRequest.user_id,
    plan: paymentRequest.plan,
    sourcePaymentId: paymentRequest.id,
    updatedBy: adminUser.id,
  });

  return response.status(200).json({ success: true, data });
};

async function handler(request, response) {
  if (handleCors(request, response, {
    methods: 'POST,OPTIONS',
    headers: 'Content-Type, Authorization',
  })) return;

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST.' });
  }

  try {
    const resource = request.query?.resource || new URL(request.url || '/', 'http://localhost').searchParams.get('resource');
    if (resource === 'protected-submit') return await protectedSubmitHandler(request, response);

    const action = request.body?.action;
    if (action === 'resolve-identifier') return await resolveIdentifier(request, response);
    if (action === 'send-otp') return await sendOtp(request, response);
    if (action === 'verify-otp') return await verifyOtp(request, response);
    if (action === 'record-policy-consent') return await recordPolicyConsent(request, response);
    if (action === 'delete-account') return await deleteAccount(request, response);
    if (action === 'create-avatar-upload') return await createAvatarUpload(request, response);
    if (action === 'upload-avatar') return await uploadAvatar(request, response);
    if (action === 'admin-set-subscription') return await adminSetSubscription(request, response);
    if (action === 'approve-payment-request') return await approvePaymentRequest(request, response);
    return response.status(400).json({ error: 'Thao tác auth không hợp lệ.' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message?.includes('already been registered')
      ? 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.'
      : error.message || 'Không thể xử lý xác thực.';
    return response.status(statusCode).json({ error: message });
  }
}

export default withLogging(handler);
