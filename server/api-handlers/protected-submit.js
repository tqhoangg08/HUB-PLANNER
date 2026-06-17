import { createHash, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';
import { handleCors } from '../api-cors.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const R2_ENDPOINT = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : '';
const MAX_LOST_FOUND_IMAGE_BYTES = 3 * 1024 * 1024;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const text = (value, max = 2000) => String(value || '').trim().slice(0, max);
const nullableText = (value, max = 2000) => {
  const next = text(value, max);
  return next || null;
};
const encodeR2Path = (key) => key.split('/').map(encodeURIComponent).join('/');
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding);

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
    const error = new Error('Chưa cấu hình R2.');
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
    throw new Error(`Không thể upload ảnh lên R2 (${uploadResponse.status}). ${detail}`.trim());
  }
};

const uploadLostFoundImageToR2 = async (payload = {}) => {
  const image = payload.image || null;
  if (!image?.base64) return nullableText(payload.image_url, 1000);

  const contentType = text(image.contentType, 100).toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw Object.assign(new Error('File phải là ảnh.'), { statusCode: 400 });
  }

  const buffer = Buffer.from(String(image.base64), 'base64');
  if (!buffer.length || buffer.length > MAX_LOST_FOUND_IMAGE_BYTES) {
    throw Object.assign(new Error('Ảnh quá lớn hoặc không hợp lệ.'), { statusCode: 400 });
  }

  const extension = contentType.includes('png') ? 'png'
    : contentType.includes('webp') ? 'webp'
      : contentType.includes('gif') ? 'gif'
        : 'jpg';
  const key = `lost-found/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  await putR2Object({ key, body: buffer, contentType });
  const { publicBaseUrl } = getR2Config();
  return `${publicBaseUrl.replace(/\/$/, '')}/${encodeR2Path(key)}`;
};

const getClientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return request.headers['cf-connecting-ip'] || forwarded || request.socket?.remoteAddress || undefined;
};

const getUser = async (request) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
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

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: getClientIp(request),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    const error = new Error('Xác minh bảo mật không thành công. Vui lòng thử lại.');
    error.statusCode = 400;
    error.details = result?.['error-codes'];
    throw error;
  }
};

const insertFeedback = async (body, user) => {
  const payload = body.payload || {};
  const row = {
    type: text(payload.type || 'idea', 40),
    content: text(payload.content, 5000),
    contact: text(payload.contact, 500),
    user_id: user?.id || payload.user_id || null,
    full_name: nullableText(payload.full_name, 200),
    student_code: nullableText(payload.student_code, 80),
    email: nullableText(payload.email, 320),
  };
  if (!row.content) throw Object.assign(new Error('Thiếu nội dung góp ý.'), { statusCode: 400 });
  let { data, error } = await supabase.from('feedback').insert([row]).select('id').single();
  if (error && String(error.message || '').toLowerCase().includes('column')) {
    const fallback = await supabase.from('feedback').insert([{
      type: row.type,
      content: row.content,
      contact: row.contact,
      user_id: row.user_id,
    }]).select('id').single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return { id: data?.id };
};

const insertDonation = async (body, user) => {
  const payload = body.payload || {};
  const amount = Number.parseInt(String(payload.amount || '').replace(/\D/g, ''), 10) || 0;
  if (!text(payload.name, 200) || amount <= 0) {
    throw Object.assign(new Error('Thiếu tên hoặc số tiền ủng hộ.'), { statusCode: 400 });
  }
  const { data, error } = await supabase.from('donations').insert([{
    name: text(payload.name, 200),
    student_id: text(payload.student_id || payload.mssv, 80),
    message: text(payload.message, 1000),
    amount,
    user_id: user?.id || null,
  }]).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

const insertLostFound = async (body, user) => {
  const payload = body.payload || {};
  const imageUrl = await uploadLostFoundImageToR2(payload);
  const row = {
    title: text(payload.title, 200),
    description: text(payload.description, 2000),
    location: text(payload.location, 300),
    contact_info: text(payload.contact_info, 300),
    user_name: text(payload.user_name || 'Ẩn danh', 200),
    image_url: imageUrl,
    type: payload.type === 'FOUND' ? 'FOUND' : 'LOST',
    user_id: user?.id || payload.user_id || null,
    status: 'pending',
  };
  if (!row.title || !row.location || !row.contact_info) {
    throw Object.assign(new Error('Thiếu thông tin bắt buộc.'), { statusCode: 400 });
  }
  const { data, error } = await supabase.from('lost_found_items').insert([row]).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

const insertEventContribution = async (body) => {
  const payload = body.payload || {};
  const row = {
    title: text(payload.title, 300),
    deadline: payload.close_on_full ? null : nullableText(payload.deadline, 20),
    deadline_time: payload.close_on_full ? null : nullableText(payload.deadline_time, 20),
    close_on_full: Boolean(payload.close_on_full),
    event_date: nullableText(payload.event_date, 20),
    event_time: nullableText(payload.event_time, 20),
    registration_start_date: nullableText(payload.registration_start_date, 20),
    registration_start_time: nullableText(payload.registration_start_time, 20),
    category: text(payload.category, 200),
    criteria: text(payload.criteria, 40),
    points: text(payload.points, 40),
    organizer: text(payload.organizer, 300),
    link: text(payload.link, 1000),
    image_url: nullableText(payload.image_url, 1000),
    format: text(payload.format, 80),
    description: text(payload.description, 5000),
    location_type: text(payload.location_type, 80),
    status: 'pending',
    is_manually_closed: false,
  };
  if (!row.title || !row.link) throw Object.assign(new Error('Thiếu tên sự kiện hoặc link tham gia.'), { statusCode: 400 });
  const { data, error } = await supabase.from('events').insert([row]).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

const insertBugReport = async (body, user) => {
  const payload = body.payload || {};
  const row = {
    user_id: user?.id || payload.user_id || null,
    error_location: text(payload.error_location || payload.location, 500),
    description: text(payload.description, 5000),
  };
  if (!row.error_location || !row.description) throw Object.assign(new Error('Thiếu nội dung báo lỗi.'), { statusCode: 400 });
  const { data, error } = await supabase.from('bug_reports').insert([row]).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

const insertCourseReport = async (body, user) => {
  const payload = body.payload || {};
  const { data, error } = await supabase.from('course_reports').insert({
    course_code: text(payload.course_code, 120),
    subject_name: text(payload.subject_name, 300),
    error_description: text(payload.error_description || payload.description, 3000),
    suggested_correction: nullableText(payload.suggested_correction, 3000),
    user_id: user?.id || payload.user_id || null,
  }).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

const insertEventReport = async (body, user) => {
  const payload = body.payload || {};
  const { data, error } = await supabase.from('event_reports').insert([{
    event_id: Number.parseInt(String(payload.event_id || ''), 10) || null,
    user_id: user?.id || payload.user_id || null,
    event_name: text(payload.event_name, 300),
    organizer: text(payload.organizer, 300),
    issue_description: text(payload.issue_description || payload.issue, 3000),
    status: 'pending',
  }]).select('id').single();
  if (error) throw error;
  return { id: data?.id };
};

async function handler(request, response) {
  if (handleCors(request, response)) return;
  if (request.method !== 'POST') return response.status(405).json({ error: 'Chỉ hỗ trợ POST.' });

  try {
    const body = request.body || {};
    await verifyTurnstile(request, body.turnstileToken);
    const user = await getUser(request);
    const action = String(body.action || '');

    const result = action === 'verify-only' ? { verified: true }
      : action === 'feedback' ? await insertFeedback(body, user)
      : action === 'donation' ? await insertDonation(body, user)
      : action === 'lost-found' ? await insertLostFound(body, user)
      : action === 'event-contribution' ? await insertEventContribution(body, user)
      : action === 'bug-report' ? await insertBugReport(body, user)
      : action === 'course-report' ? await insertCourseReport(body, user)
      : action === 'event-report' ? await insertEventReport(body, user)
      : null;

    if (!result) return response.status(400).json({ error: 'Thao tác không hợp lệ.' });
    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    return response.status(status).json({ error: error.message || 'Không thể xử lý yêu cầu.' });
  }
}

export default withLogging(handler);
