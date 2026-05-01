import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeIdentifier = (value = '') => value.trim().toLowerCase();

async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST' });
  }

  try {
    const identifier = normalizeIdentifier(request.body?.identifier);
    if (!identifier) {
      return response.status(400).json({ error: 'Thiếu MSSV hoặc Gmail HUB.' });
    }

    if (identifier.includes('@')) {
      if (!identifier.endsWith(`@${SCHOOL_DOMAIN}`)) {
        return response.status(400).json({ error: `Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.` });
      }
      return response.status(200).json({ email: identifier });
    }

    if (!/^[a-z0-9._-]{3,64}$/.test(identifier)) {
      return response.status(400).json({ error: 'MSSV không hợp lệ.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('student_code', identifier)
      .maybeSingle();

    if (error) throw error;
    if (!data?.email) {
      return response.status(404).json({ error: 'Không tìm thấy MSSV trong hệ thống.' });
    }

    return response.status(200).json({ email: data.email });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Không thể kiểm tra tài khoản.' });
  }
}

export default withLogging(handler);
