import Groq from 'groq-sdk';
import { createHash, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';
import { sendModeratorAlert } from '../moderator-notifications.shared.js';
import { analyzeEventCandidate } from '../event-candidate-ai.shared.js';
import { handleCors } from '../api-cors.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const INGEST_SECRET = String(process.env.EVENT_CANDIDATE_INGEST_SECRET || '');
const R2_ENDPOINT = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : '';
const MAX_CANDIDATE_IMAGE_BYTES = 8 * 1024 * 1024;
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_CHAT_KEY,
].filter(Boolean);
const GROQ_MODEL = process.env.GROQ_EVENT_CANDIDATE_MODEL || process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
const EVENT_CATEGORIES = [
  'Hoạt động phong trào',
  'Minigame',
  'Tình nguyện',
  'Cuộc thi học thuật',
  'Cổ vũ',
  'Talkshow',
  'Tọa đàm',
  'Hội thảo',
  'Sự kiện offline',
  'Teambuilding',
  'Hoạt động thể thao',
  'Khác (Tự nhập)',
];
const DEFAULT_EVENT_CATEGORY = EVENT_CATEGORIES[0];

const allowedModeratorRoles = new Set(['admin', 'auditor']);

const parseBody = (request) => {
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body || '{}');
    } catch {
      return null;
    }
  }
  return request.body || {};
};

const normalizeText = (value) => String(value || '').trim();
const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text ? text : null;
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
    throw new Error(`Không thể upload ảnh candidate lên R2 (${uploadResponse.status}). ${detail}`.trim());
  }
};
const getCandidateImageExtension = (contentType, imageUrl) => {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('avif')) return 'avif';

  try {
    const pathname = new URL(imageUrl).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(match[1])) {
      return match[1] === 'jpeg' ? 'jpg' : match[1];
    }
  } catch {
    // Ignore and fall back to jpg.
  }

  return 'jpg';
};
const isR2PublicUrl = (imageUrl) => {
  const publicBaseUrl = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return Boolean(publicBaseUrl && String(imageUrl || '').startsWith(`${publicBaseUrl}/`));
};
const mirrorCandidateImageToR2 = async (imageUrl) => {
  const sourceUrl = normalizeOptionalText(imageUrl);
  if (!sourceUrl || isR2PublicUrl(sourceUrl)) return sourceUrl;

  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  const imageResponse = await fetch(sourceUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 (compatible; HUBPlannerEventCollector/1.0)',
    },
  });

  if (!imageResponse.ok) {
    throw new Error(`Không tải được ảnh nguồn (${imageResponse.status}).`);
  }

  const contentType = String(imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`URL nguồn không phải ảnh (${contentType}).`);
  }

  const contentLength = Number(imageResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_CANDIDATE_IMAGE_BYTES) {
    throw new Error('Ảnh nguồn quá lớn.');
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_CANDIDATE_IMAGE_BYTES) {
    throw new Error('Ảnh nguồn quá lớn hoặc không hợp lệ.');
  }

  const safeContentType = contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg';
  const extension = getCandidateImageExtension(safeContentType, sourceUrl);
  const key = `event-candidates/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  await putR2Object({ key, body: buffer, contentType: safeContentType });
  const { publicBaseUrl } = getR2Config();
  return `${publicBaseUrl.replace(/\/$/, '')}/${encodeR2Path(key)}`;
};
const normalizeCategory = (value) => {
  const text = normalizeOptionalText(value);
  if (!text) return DEFAULT_EVENT_CATEGORY;
  return EVENT_CATEGORIES.includes(text) ? text : DEFAULT_EVENT_CATEGORY;
};
const normalizeBoolean = (value) => Boolean(value);
const normalizeDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};
const normalizeTime = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = String(match[1]).padStart(2, '0');
  const minutes = String(match[2]).padStart(2, '0');
  const seconds = String(match[3] || '00').padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};
const normalizePoints = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim();
};
const getAnalyzeCandidateId = (request, body = {}) => {
  const fromQuery = normalizeText(request.query?.id);
  if (fromQuery) return fromQuery;

  const fromBody = normalizeText(body.id || body.candidate_id);
  if (fromBody) return fromBody;

  const rawUrl = String(request.url || '').split('?')[0];
  const match = rawUrl.match(/\/api\/event-candidates\/([^/]+)\/analyze\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : '';
};
const isAnalyzeRoute = (request) => {
  const resource = normalizeText(request.query?.resource).toLowerCase();
  if (resource === 'analyze') return true;

  const rawUrl = String(request.url || '').split('?')[0];
  return /\/api\/event-candidates\/[^/]+\/analyze\/?$/i.test(rawUrl);
};
const toIsoTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const cleanAiResult = (result) => {
  const safe = result && typeof result === 'object' ? result : {};
  return {
    is_event: Boolean(safe.is_event),
    confidence: Number.isFinite(Number(safe.confidence))
      ? Math.max(0, Math.min(1, Number(safe.confidence)))
      : 0,
    title: normalizeOptionalText(safe.title),
    organizer: normalizeOptionalText(safe.organizer),
    category: normalizeOptionalText(safe.category),
    criteria: normalizeOptionalText(safe.criteria),
    points: safe.points === undefined || safe.points === null ? null : safe.points,
    format: normalizeOptionalText(safe.format),
    location_type: normalizeOptionalText(safe.location_type),
    classification: normalizeOptionalText(safe.classification),
    event_date: normalizeDate(safe.event_date),
    event_time: normalizeTime(safe.event_time),
    deadline: normalizeDate(safe.deadline),
    deadline_time: normalizeTime(safe.deadline_time),
    registration_start_date: normalizeDate(safe.registration_start_date),
    registration_start_time: normalizeTime(safe.registration_start_time),
    link: normalizeOptionalText(safe.link),
    description: normalizeOptionalText(safe.description),
    reason: normalizeOptionalText(safe.reason),
  };
};

const buildEventDraft = (candidate, aiResult = {}) => {
  const title = normalizeOptionalText(aiResult.title) || normalizeOptionalText(candidate.source_name) || 'Sự kiện mới';
  const organizer = normalizeOptionalText(aiResult.organizer) || normalizeOptionalText(candidate.source_name);
  const category = normalizeCategory(aiResult.category);
  const criteria = normalizeOptionalText(aiResult.criteria) || 'III';
  const points = normalizePoints(aiResult.points) || '3';
  const format = normalizeOptionalText(aiResult.format) || 'Offline';
  const locationType = normalizeOptionalText(aiResult.location_type) || 'Trong trường';
  const classification = normalizeOptionalText(aiResult.classification);
  const link = normalizeOptionalText(aiResult.link) || normalizeOptionalText(candidate.post_url);
  const eventDate = normalizeDate(aiResult.event_date);
  const eventTime = normalizeTime(aiResult.event_time);
  const deadline = normalizeDate(aiResult.deadline);
  const deadlineTime = normalizeOptionalText(aiResult.deadline_time) || null;
  const registrationStartDate = normalizeDate(aiResult.registration_start_date);
  const registrationStartTime = normalizeTime(aiResult.registration_start_time);
  const description = normalizeOptionalText(aiResult.description) || normalizeOptionalText(candidate.raw_content);
  const imageUrl = normalizeOptionalText(aiResult.image_url) || normalizeOptionalText(candidate.image_url);

  return {
    title,
    organizer,
    category,
    criteria,
    points,
    format,
    link,
    image_url: imageUrl,
    location_type: locationType,
    classification,
    event_date: eventDate,
    event_time: eventTime,
    deadline,
    deadline_time: deadlineTime,
    description,
    registration_start_date: registrationStartDate,
    registration_start_time: registrationStartTime,
    status: 'Đang diễn ra',
    is_manually_closed: false,
    is_deleted: false,
    close_on_full: false,
  };
};

const getGroqClient = () => {
  if (GROQ_KEYS.length === 0) {
    throw new Error('Thiếu GROQ_API_KEY hoặc GROQ_CHAT_KEY');
  }
  const apiKey = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
  return new Groq({ apiKey });
};

const analyzeCandidate = async (candidate) => {
  const groq = getGroqClient();
  const prompt = `
Bạn là hệ thống phân tích bài đăng để quyết định có phải sự kiện hay không.
Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.

Quy tắc:
- Bài recap, cảm ơn, chúc mừng, tuyển thành viên, kết quả, album ảnh sau sự kiện: is_event = false.
- Không bịa dữ liệu. Thiếu gì để null.
- format chỉ là Online, Offline, Hỗn hợp.
- location_type chỉ là Trong trường, Ngoài trường.
- Ngày định dạng YYYY-MM-DD.
- Giờ định dạng HH:mm:ss.
- Nếu có "điểm rèn luyện", "ĐRL", "tiêu chí" thì trích vào points, criteria.

Mẫu JSON:
{
  "is_event": true,
  "confidence": 0.87,
  "title": "Workshop Kỹ năng viết CV",
  "organizer": "CLB Kỹ năng",
  "category": "Workshop",
  "criteria": "I",
  "points": 3,
  "format": "Offline",
  "location_type": "Trong trường",
  "classification": "Kỹ năng",
  "event_date": "2026-05-21",
  "event_time": "18:00:00",
  "deadline": "2026-05-19",
  "deadline_time": "23:59:00",
  "registration_start_date": null,
  "registration_start_time": null,
  "link": "https://facebook.com/...",
  "description": "Nội dung tóm tắt sự kiện...",
  "reason": "Bài có ngày, giờ, địa điểm và lời kêu gọi đăng ký tham gia."
}

Nguồn:
- Nguồn: ${candidate.source_name || ''}
- Link: ${candidate.post_url || ''}
- Nội dung:
${candidate.raw_content || ''}
`.trim();

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Bạn là bộ phân loại sự kiện của HUB Planner. Hãy luôn trả JSON hợp lệ.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const rawContent = completion.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
  } catch {
    parsed = {};
  }
  return cleanAiResult(parsed);
};

const getActor = async (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) return null;

  const userId = userData.user.id;
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (roleRow?.role) {
    return { userId, role: String(roleRow.role).trim() };
  }

  const { data: fallbackRoleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const role = String(fallbackRoleRow?.role || '').trim();
  return { userId, role };
};

const requireModerator = async (request) => {
  const actor = await getActor(request);
  if (!actor || !allowedModeratorRoles.has(actor.role)) {
    return null;
  }
  return actor;
};

const getDuplicateCandidate = async (postUrl) => {
  const { data, error } = await supabase
    .from('event_candidates')
    .select('*')
    .eq('post_url', postUrl)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
};

const analyzeAndUpdateCandidate = async (candidate) => {
  const aiResult = await analyzeEventCandidate(candidate);
  const { data: updated, error } = await supabase
    .from('event_candidates')
    .update({
      ai_is_event: aiResult.is_event,
      ai_confidence: aiResult.confidence,
      ai_reason: aiResult.reason,
      ai_result: aiResult,
    })
    .eq('id', candidate.id)
    .select('*')
    .single();

  if (error) throw error;
  return { candidate: updated, ai_result: aiResult };
};

const listCandidates = async (request, response) => {
  const actor = await requireModerator(request);
  if (!actor) return response.status(401).json({ success: false, error: 'Unauthorized' });

  const status = String(request.query.review_status || request.query.status || 'pending').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
  const search = normalizeText(request.query.search);
  const candidateId = normalizeText(request.query.id);

  if (candidateId) {
    const { data, error } = await supabase
      .from('event_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();
    if (error) throw error;
    return response.status(200).json({ success: true, candidate: data || null });
  }

  let query = supabase
    .from('event_candidates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') {
    query = query.eq('review_status', status);
  }

  if (search) {
    query = query.or(`source_name.ilike.%${search}%,post_url.ilike.%${search}%,raw_content.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return response.status(200).json({ success: true, candidates: data || [] });
};

const ingestCandidate = async (request, response, body) => {
  const authHeader = String(request.headers.authorization || '');
  if (!INGEST_SECRET || authHeader !== `Bearer ${INGEST_SECRET}`) {
    return response.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const sourceName = normalizeText(body.source_name);
  const postUrl = normalizeText(body.post_url);
  const rawContent = normalizeText(body.raw_content);
  let imageUrl = body.image_url === null || body.image_url === undefined || body.image_url === ''
    ? null
    : normalizeText(body.image_url);
  let imageMirrorError = null;
  if (imageUrl) {
    try {
      imageUrl = await mirrorCandidateImageToR2(imageUrl);
    } catch (error) {
      imageMirrorError = error?.message || 'Mirror image failed';
      console.warn('Mirror event candidate image failed:', imageMirrorError);
    }
  }
  const submittedFrom = normalizeText(body.submitted_from) || 'chrome_extension';
  const clientCreatedAt = toIsoTimestamp(body.client_created_at);

  if (!sourceName || !postUrl || !rawContent) {
    return response.status(400).json({
      success: false,
      error: 'source_name, post_url, raw_content là bắt buộc.',
    });
  }

  const existing = await getDuplicateCandidate(postUrl);
  if (existing) {
    let existingForResponse = existing;
    if (imageUrl && imageUrl !== existing.image_url && (!existing.image_url || !isR2PublicUrl(existing.image_url))) {
      const { data: updatedExisting, error: updateExistingError } = await supabase
        .from('event_candidates')
        .update({ image_url: imageUrl })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (updateExistingError) throw updateExistingError;
      existingForResponse = updatedExisting || existing;
    }

    if (!existing.ai_result && normalizeText(existing.raw_content)) {
      try {
        const analyzed = await analyzeAndUpdateCandidate(existingForResponse);
        return response.status(200).json({
          success: true,
          candidate: analyzed.candidate,
          ai_result: analyzed.ai_result,
          message: 'Candidate already exists',
          analyzed: true,
          image_mirror_error: imageMirrorError,
        });
      } catch (error) {
        console.warn('Auto analyze existing candidate failed:', error?.details || error?.message || error);
        return response.status(200).json({
          success: true,
          candidate: existingForResponse,
          message: 'Candidate already exists',
          analyzed: false,
          analyze_error: error?.message || 'Auto analyze failed',
          analyze_details: error?.details || null,
          image_mirror_error: imageMirrorError,
        });
      }
    }

    return response.status(200).json({
      success: true,
      candidate: existingForResponse,
      message: 'Candidate already exists',
      image_mirror_error: imageMirrorError,
    });
  }

  const insertPayload = {
    source_name: sourceName,
    post_url: postUrl,
    raw_content: rawContent,
    image_url: imageUrl,
    review_status: 'pending',
    submitted_from: submittedFrom,
    client_created_at: clientCreatedAt,
  };

  const { data, error } = await supabase
    .from('event_candidates')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) {
    if (String(error.code || '') === '23505') {
      const duplicate = await getDuplicateCandidate(postUrl);
      if (duplicate && !duplicate.ai_result && normalizeText(duplicate.raw_content)) {
        try {
          const analyzed = await analyzeAndUpdateCandidate(duplicate);
          return response.status(200).json({
            success: true,
            candidate: analyzed.candidate,
            ai_result: analyzed.ai_result,
            message: 'Candidate already exists',
            analyzed: true,
            image_mirror_error: imageMirrorError,
          });
        } catch (analyzeError) {
          console.warn('Auto analyze duplicate candidate failed:', analyzeError?.details || analyzeError?.message || analyzeError);
        }
      }
      return response.status(200).json({
        success: true,
        candidate: duplicate,
        message: 'Candidate already exists',
        image_mirror_error: imageMirrorError,
      });
    }
    throw error;
  }

  let candidateForResponse = data;
  let aiResult = null;
  let analyzeError = null;
  try {
    const analyzed = await analyzeAndUpdateCandidate(data);
    candidateForResponse = analyzed.candidate;
    aiResult = analyzed.ai_result;
  } catch (error) {
    analyzeError = {
      error: error?.message || 'Auto analyze failed',
      details: error?.details || null,
    };
    console.warn('Auto analyze event candidate failed:', error?.details || error?.message || error);
  }

  void sendModeratorAlert({
    title: 'Candidate sự kiện mới',
    body: `${sourceName} vừa gửi bài mới cần duyệt.`,
    url: '/admin/event-candidates',
    actorId: null,
    content: `${sourceName} vừa gửi bài mới cần duyệt.`,
  }).catch((err) => console.warn('Không gửi được alert moderator cho candidate mới:', err));

  return response.status(201).json({
    success: true,
    candidate: candidateForResponse,
    ai_result: aiResult,
    analyzed: Boolean(aiResult),
    analyze_error: analyzeError,
    image_mirror_error: imageMirrorError,
  });
};

const analyzeCandidateAction = async (request, response, body, candidateIdOverride = '') => {
  const actor = await requireModerator(request);
  if (!actor) {
    return response.status(401).json({
      success: false,
      error: 'Unauthorized',
      details: 'Admin or auditor session is required to analyze event candidates.',
    });
  }

  const candidateId = normalizeText(candidateIdOverride || body.id || body.candidate_id);
  if (!candidateId) {
    return response.status(400).json({
      success: false,
      error: 'Missing candidate id',
      details: 'Call POST /api/event-candidates/{id}/analyze or provide id in the request.',
    });
  }

  const { data: candidate, error } = await supabase
    .from('event_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) throw error;
  if (!candidate) {
    return response.status(404).json({ success: false, error: 'Candidate not found' });
  }

  if (!normalizeText(candidate.raw_content)) {
    return response.status(400).json({
      success: false,
      error: 'raw_content is empty',
      details: 'Candidate has no raw_content to analyze.',
    });
  }

  let aiResult;
  try {
    aiResult = await analyzeEventCandidate(candidate);
  } catch (error) {
    const isGroqError = error?.message === 'Groq API error';
    return response.status(500).json({
      success: false,
      error: isGroqError ? 'Groq API error' : (error?.message || 'Analyze failed'),
      details: error?.details || null,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from('event_candidates')
    .update({
      ai_is_event: aiResult.is_event,
      ai_confidence: aiResult.confidence,
      ai_reason: aiResult.reason,
      ai_result: aiResult,
    })
    .eq('id', candidateId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  return response.status(200).json({
    success: true,
    candidate: updated,
    ai_result: aiResult,
  });
};

const approveCandidateAction = async (request, response, body) => {
  const actor = await requireModerator(request);
  if (!actor) return response.status(401).json({ success: false, error: 'Unauthorized' });

  const candidateId = normalizeText(body.id || body.candidate_id);
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : (body.event_draft && typeof body.event_draft === 'object' ? body.event_draft : {});

  if (!candidateId) {
    return response.status(400).json({ success: false, error: 'Missing candidate id' });
  }

  const { data: candidate, error } = await supabase
    .from('event_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) throw error;
  if (!candidate) {
    return response.status(404).json({ success: false, error: 'Candidate not found' });
  }

  if (candidate.review_status === 'approved' && candidate.approved_event_id) {
    return response.status(409).json({ success: false, error: 'Candidate already approved' });
  }

  let aiResult = candidate.ai_result;
  if (typeof aiResult === 'string') {
    try {
      aiResult = JSON.parse(aiResult);
    } catch {
      aiResult = {};
    }
  }

  const mergedDraft = {
    ...buildEventDraft(candidate, aiResult || {}),
    ...draft,
  };

  const eventPayload = {
    title: normalizeText(mergedDraft.title),
    organizer: normalizeOptionalText(mergedDraft.organizer),
    category: normalizeOptionalText(mergedDraft.category) || 'Hoạt động phong trào',
    criteria: normalizeOptionalText(mergedDraft.criteria) || 'III',
    points: normalizePoints(mergedDraft.points) || '3',
    format: normalizeOptionalText(mergedDraft.format) || 'Offline',
    link: normalizeOptionalText(mergedDraft.link) || normalizeText(candidate.post_url),
    image_url: normalizeOptionalText(mergedDraft.image_url) || normalizeOptionalText(candidate.image_url),
    location_type: normalizeOptionalText(mergedDraft.location_type) || 'Trong trường',
    classification: normalizeOptionalText(mergedDraft.classification),
    event_date: normalizeDate(mergedDraft.event_date),
    event_time: normalizeTime(mergedDraft.event_time),
    deadline: normalizeDate(mergedDraft.deadline),
    deadline_time: normalizeOptionalText(mergedDraft.deadline_time),
    description: normalizeOptionalText(mergedDraft.description),
    registration_start_date: normalizeDate(mergedDraft.registration_start_date),
    registration_start_time: normalizeTime(mergedDraft.registration_start_time),
    status: normalizeOptionalText(mergedDraft.status) || 'Đang diễn ra',
    is_manually_closed: normalizeBoolean(mergedDraft.is_manually_closed),
    is_deleted: false,
    close_on_full: normalizeBoolean(mergedDraft.close_on_full),
  };

  if (!eventPayload.title) {
    return response.status(400).json({ success: false, error: 'Title là bắt buộc' });
  }

  const { data: insertedEvent, error: insertError } = await supabase
    .from('events')
    .insert([eventPayload])
    .select('*')
    .single();

  if (insertError) throw insertError;

  const { data: updatedCandidate, error: candidateUpdateError } = await supabase
    .from('event_candidates')
    .update({
      review_status: 'approved',
      approved_event_id: insertedEvent.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', candidateId)
    .select('*')
    .single();

  if (candidateUpdateError) {
    await supabase.from('events').delete().eq('id', insertedEvent.id);
    throw candidateUpdateError;
  }

  return response.status(200).json({
    success: true,
    candidate: updatedCandidate,
    event: insertedEvent,
  });
};

const rejectCandidateAction = async (request, response, body) => {
  const actor = await requireModerator(request);
  if (!actor) return response.status(401).json({ success: false, error: 'Unauthorized' });

  const candidateId = normalizeText(body.id || body.candidate_id);
  if (!candidateId) {
    return response.status(400).json({ success: false, error: 'Missing candidate id' });
  }

  const { data, error } = await supabase
    .from('event_candidates')
    .update({
      review_status: 'rejected',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', candidateId)
    .select('*')
    .single();

  if (error) throw error;

  return response.status(200).json({
    success: true,
    candidate: data,
  });
};

async function handler(request, response) {
  if (handleCors(request, response, {
    headers: 'Content-Type, Authorization',
    methods: 'GET,POST,PATCH,OPTIONS',
  })) return;

  const body = parseBody(request);
  if (body === null) {
    return response.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  if (request.method === 'GET') {
    return listCandidates(request, response);
  }

  if (request.method === 'POST') {
    if (isAnalyzeRoute(request)) {
      return analyzeCandidateAction(request, response, body, getAnalyzeCandidateId(request, body));
    }

    const authHeader = String(request.headers.authorization || '');
    if (authHeader === `Bearer ${INGEST_SECRET}`) {
      return ingestCandidate(request, response, body);
    }

    const action = normalizeText(body.action);
    if (!action) {
      return response.status(400).json({ success: false, error: 'Missing action' });
    }

    if (action === 'analyze') {
      return analyzeCandidateAction(request, response, body);
    }

    if (action === 'approve') {
      return approveCandidateAction(request, response, body);
    }

    if (action === 'reject') {
      return rejectCandidateAction(request, response, body);
    }

    return response.status(400).json({ success: false, error: 'Unknown action' });
  }

  return response.status(405).json({ success: false, error: 'Method not allowed' });
}

export default withLogging(handler);
