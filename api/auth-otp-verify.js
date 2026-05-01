import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const MAX_ATTEMPTS = 5;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeEmail = (value = '') => value.trim().toLowerCase();

const hashOtp = (email, purpose, otp) => {
  const secret = process.env.OTP_SECRET || process.env.RESEND_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createHash('sha256').update(`${email}:${purpose}:${otp}:${secret}`).digest('hex');
};

const passwordError = (password, confirmPassword) => {
  if (!password || password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Hai mật khẩu chưa trùng khớp.';
  return null;
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

async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST.' });
  }

  try {
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
    if (!profile?.id) throw new Error('Không tìm thấy tài khoản cần đặt lại mật khẩu.');

    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password });
    if (updateError) throw updateError;

    await supabase
      .from('profiles')
      .update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    return response.status(200).json({ email, passwordUpdated: true });
  } catch (error) {
    const message = error.message?.includes('already been registered')
      ? 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.'
      : error.message || 'Không thể xác minh mã OTP.';
    return response.status(400).json({ error: message });
  }
}

export default withLogging(handler);
