import { createHash, createHmac, randomInt, randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
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
const hasSupportPushConfig = Boolean(process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (hasSupportPushConfig) {
  webpush.setVapidDetails(
    'mailto:admin@hotrosinhvienhub.id.vn',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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

const getPrivateR2Config = () => {
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!R2_ENDPOINT || !bucket || !accessKeyId || !secretAccessKey) {
    const error = new Error('Chưa cấu hình R2 cho file hỗ trợ.');
    error.statusCode = 500;
    throw error;
  }

  return { bucket, accessKeyId, secretAccessKey };
};

const SUPPORT_ATTACHMENT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const SUPPORT_PDF_MAX_BYTES = 10 * 1024 * 1024;
const SUPPORT_UPLOAD_EXPIRES_SECONDS = 5 * 60;
const SUPPORT_DOWNLOAD_EXPIRES_SECONDS = 3 * 60;

const supportAttachmentExt = (mimeType) => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
})[mimeType] || 'bin';

const sanitizeAttachmentFileName = (value = '') => String(value)
  .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180) || 'attachment';

const assertSupportAttachmentFile = ({ fileName, mimeType, size }) => {
  const cleanMimeType = String(mimeType || '').toLowerCase();
  const cleanSize = Number(size || 0);
  if (!SUPPORT_ATTACHMENT_MIME.has(cleanMimeType)) {
    const error = new Error('Chỉ hỗ trợ JPG, PNG, WEBP và PDF.');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(cleanSize) || cleanSize <= 0) {
    const error = new Error('File không được để trống.');
    error.statusCode = 400;
    throw error;
  }
  const limit = cleanMimeType === 'application/pdf' ? SUPPORT_PDF_MAX_BYTES : SUPPORT_IMAGE_MAX_BYTES;
  if (cleanSize > limit) {
    const error = new Error('Ảnh tối đa 5 MB, PDF tối đa 10 MB.');
    error.statusCode = 400;
    throw error;
  }
  return {
    fileName: sanitizeAttachmentFileName(fileName),
    mimeType: cleanMimeType,
    size: cleanSize,
  };
};

const requireAuthenticatedUser = async (request) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    const error = new Error('Thiếu phiên đăng nhập.');
    error.statusCode = 401;
    throw error;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    const authError = new Error('Phiên đăng nhập không hợp lệ.');
    authError.statusCode = 401;
    throw authError;
  }
  return data.user;
};

const isSupportStaffUser = async (userId) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id,user_id,role')
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .in('role', ['admin', 'auditor', 'support'])
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
};

const isClosedSupportTicketStatus = (status) => ['resolved', 'closed'].includes(status);

const requireSupportTicketAccess = async ({ ticketId, userId, requireOpen = false }) => {
  if (!ticketId) {
    const error = new Error('Thiếu ticket_id.');
    error.statusCode = 400;
    throw error;
  }
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select('id,user_id,status')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!ticket?.id) {
    const notFound = new Error('Ticket không tồn tại.');
    notFound.statusCode = 404;
    throw notFound;
  }
  const isStaff = await isSupportStaffUser(userId);
  if (!isStaff && ticket.user_id !== userId) {
    const forbidden = new Error('Bạn không có quyền truy cập ticket này.');
    forbidden.statusCode = 403;
    throw forbidden;
  }
  if (requireOpen && isClosedSupportTicketStatus(ticket.status)) {
    const closed = new Error('Ticket đã đóng, không thể gửi thêm phản hồi.');
    closed.statusCode = 409;
    throw closed;
  }
  return { ticket, isStaff };
};

const buildR2PresignedUrl = ({ method, key, expiresInSeconds }) => {
  const { bucket, accessKeyId, secretAccessKey } = getPrivateR2Config();
  const encodedKey = encodeR2Path(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const signedHeaders = 'host';
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalQueryString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signature = hmac(getSignatureKey(secretAccessKey, dateStamp, region, service), stringToSign, 'hex');
  params.set('X-Amz-Signature', signature);
  return `${R2_ENDPOINT}${canonicalUri}?${params.toString()}`;
};

const headR2SupportObject = async (fileKey) => {
  const url = buildR2PresignedUrl({
    method: 'HEAD',
    key: fileKey,
    expiresInSeconds: 60,
  });
  const result = await fetch(url, { method: 'HEAD' });
  if (!result.ok) {
    const error = new Error('Không tìm thấy file đã upload trên R2.');
    error.statusCode = 400;
    throw error;
  }
  return {
    size: Number(result.headers.get('content-length') || 0),
    mimeType: String(result.headers.get('content-type') || '').split(';')[0].toLowerCase(),
  };
};

const deleteR2SupportObject = async (fileKey) => {
  const runDelete = async () => {
    const url = buildR2PresignedUrl({
      method: 'DELETE',
      key: fileKey,
      expiresInSeconds: 60,
    });
    return await fetch(url, { method: 'DELETE' });
  };

  let result = await runDelete();
  if (!result.ok && result.status !== 404) result = await runDelete();
  if (!result.ok && result.status !== 404) {
    const detail = await result.text().catch(() => '');
    const error = new Error(`Không thể xóa file đính kèm trên R2 (${result.status}). ${detail}`.trim());
    error.statusCode = 502;
    throw error;
  }
};

const createSupportAttachmentUploadUrl = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { ticket_id: ticketId, file_name: fileName, mime_type: mimeType, size } = request.body || {};
  const file = assertSupportAttachmentFile({ fileName, mimeType, size });
  await requireSupportTicketAccess({ ticketId, userId: user.id, requireOpen: true });

  const fileKey = `support-tickets/${ticketId}/${randomUUID()}.${supportAttachmentExt(file.mimeType)}`;
  const uploadUrl = buildR2PresignedUrl({
    method: 'PUT',
    key: fileKey,
    expiresInSeconds: SUPPORT_UPLOAD_EXPIRES_SECONDS,
  });
  const expiresAt = new Date(Date.now() + SUPPORT_UPLOAD_EXPIRES_SECONDS * 1000).toISOString();

  return response.status(200).json({
    upload_url: uploadUrl,
    file_key: fileKey,
    expires_at: expiresAt,
  });
};

const completeSupportAttachmentUpload = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { ticket_id: ticketId, file_key: fileKey, file_name: fileName, mime_type: mimeType, size, metadata } = request.body || {};
  const file = assertSupportAttachmentFile({ fileName, mimeType, size });
  await requireSupportTicketAccess({ ticketId, userId: user.id, requireOpen: true });

  if (!String(fileKey || '').startsWith(`support-tickets/${ticketId}/`)) {
    const error = new Error('File key không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const object = await headR2SupportObject(fileKey);
  if (object.size && object.size !== file.size) {
    const error = new Error('Kích thước file upload không khớp.');
    error.statusCode = 400;
    throw error;
  }
  if (object.mimeType && SUPPORT_ATTACHMENT_MIME.has(object.mimeType) && object.mimeType !== file.mimeType) {
    const error = new Error('Định dạng file upload không khớp.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from('support_ticket_attachments')
    .insert({
      ticket_id: ticketId,
      uploaded_by: user.id,
      file_key: fileKey,
      file_name: file.fileName,
      mime_type: file.mimeType,
      size_bytes: file.size,
      status: 'uploaded',
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    })
    .select('id,ticket_id,message_id,uploaded_by,file_name,mime_type,size_bytes,storage_provider,status,metadata,created_at')
    .single();
  if (error) throw error;

  return response.status(200).json({ attachment: data });
};

const createSupportAttachmentDownloadUrl = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { attachment_id: attachmentId } = request.body || {};
  if (!attachmentId) return response.status(400).json({ error: 'Thiếu attachment_id.' });

  const { data: attachment, error } = await supabase
    .from('support_ticket_attachments')
    .select('id,ticket_id,message_id,file_key,file_name,mime_type,status')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error) throw error;
  if (!attachment?.id || attachment.status === 'deleted') {
    return response.status(404).json({ error: 'Không tìm thấy file đính kèm.' });
  }
  const { isStaff } = await requireSupportTicketAccess({ ticketId: attachment.ticket_id, userId: user.id });
  if (!isStaff && attachment.message_id) {
    const { data: message, error: messageError } = await supabase
      .from('support_ticket_messages')
      .select('id,is_internal_note')
      .eq('id', attachment.message_id)
      .maybeSingle();
    if (messageError) throw messageError;
    if (message?.is_internal_note) {
      return response.status(403).json({ error: 'Bạn không có quyền xem file này.' });
    }
  }

  const downloadUrl = buildR2PresignedUrl({
    method: 'GET',
    key: attachment.file_key,
    expiresInSeconds: SUPPORT_DOWNLOAD_EXPIRES_SECONDS,
  });
  return response.status(200).json({
    download_url: downloadUrl,
    expires_at: new Date(Date.now() + SUPPORT_DOWNLOAD_EXPIRES_SECONDS * 1000).toISOString(),
  });
};

const linkSupportMessageAttachments = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { ticket_id: ticketId, message_id: messageId, attachment_ids: attachmentIds } = request.body || {};
  const ids = Array.isArray(attachmentIds) ? attachmentIds.filter(Boolean).slice(0, 3) : [];
  if (!messageId || ids.length === 0) return response.status(400).json({ error: 'Thiếu message_id hoặc attachment_ids.' });
  const { isStaff } = await requireSupportTicketAccess({ ticketId, userId: user.id, requireOpen: true });

  const { data: message, error: messageError } = await supabase
    .from('support_ticket_messages')
    .select('id,ticket_id,sender_id,is_internal_note')
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message?.id) return response.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  if (!isStaff && message.sender_id !== user.id) {
    return response.status(403).json({ error: 'Bạn không có quyền gắn file vào tin nhắn này.' });
  }
  if (message.is_internal_note) {
    return response.status(400).json({ error: 'Tạm thời chưa hỗ trợ đính kèm trong ghi chú nội bộ.' });
  }

  const { data, error } = await supabase
    .from('support_ticket_attachments')
    .update({ message_id: messageId, status: 'linked' })
    .in('id', ids)
    .eq('ticket_id', ticketId)
    .eq('uploaded_by', user.id)
    .is('message_id', null)
    .select('id,ticket_id,message_id,uploaded_by,file_name,mime_type,size_bytes,storage_provider,status,metadata,created_at');
  if (error) throw error;
  if ((data || []).length !== ids.length) {
    return response.status(400).json({ error: 'Không thể gắn một hoặc nhiều file vào tin nhắn.' });
  }

  return response.status(200).json({ attachments: data || [] });
};

const resolveSupportTicket = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { ticket_id: ticketId } = request.body || {};
  const { isStaff } = await requireSupportTicketAccess({ ticketId, userId: user.id });
  const resolvedRole = isStaff ? 'admin' : 'user';

  const { data, error } = await supabase
    .from('support_tickets')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolved_by_role: resolvedRole,
    })
    .eq('id', ticketId)
    .select('id,user_id,assigned_to,subject,status,resolved_at,resolved_by,resolved_by_role')
    .single();
  if (error) throw error;

  const receiverIds = isStaff
    ? [data.user_id].filter((id) => id && id !== user.id)
    : await getSupportStaffRecipientIds({ ticketId, actorId: user.id });
  await sendSupportPush({
    receiverIds,
    title: 'Ticket đã được xử lý xong',
    body: isStaff
      ? `HUB Planner đã đánh dấu ticket đã xử lý xong: ${data.subject || 'Hỗ trợ'}`
      : `User đã đánh dấu ticket đã xử lý xong: ${data.subject || 'Hỗ trợ'}`,
    url: isStaff ? `/support/${ticketId}` : `/admin/support/${ticketId}`,
  }).catch((pushError) => console.error('Support resolved push failed:', pushError?.message || pushError));

  return response.status(200).json({ ticket: data });
};

const deleteSupportTicketHard = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { ticket_id: ticketId } = request.body || {};
  if (!ticketId) return response.status(400).json({ error: 'Thiếu ticket_id.' });

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id,user_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket?.id) return response.status(404).json({ error: 'Ticket không tồn tại.' });
  if (ticket.user_id !== user.id) {
    return response.status(403).json({ error: 'Bạn không có quyền xóa ticket này.' });
  }

  const { data: attachments, error: attachmentError } = await supabase
    .from('support_ticket_attachments')
    .select('id,file_key')
    .eq('ticket_id', ticketId);
  if (attachmentError) throw attachmentError;

  for (const attachment of attachments || []) {
    await deleteR2SupportObject(attachment.file_key);
  }

  const { error: deleteError } = await supabase
    .from('support_tickets')
    .delete()
    .eq('id', ticketId)
    .eq('user_id', user.id);
  if (deleteError) throw deleteError;

  return response.status(200).json({ deleted: true });
};

const supportTicketsHandler = async (request, response) => {
  const action = request.body?.action;
  if (action === 'resolve-ticket') return await resolveSupportTicket(request, response);
  if (action === 'delete-ticket') return await deleteSupportTicketHard(request, response);
  if (action === 'message-created') return await processSupportMessageCreated(request, response);
  return response.status(400).json({ error: 'Thao tác ticket hỗ trợ không hợp lệ.' });
};

const supportAttachmentsHandler = async (request, response) => {
  const action = request.body?.action;
  if (action === 'create-upload-url') return await createSupportAttachmentUploadUrl(request, response);
  if (action === 'complete-upload') return await completeSupportAttachmentUpload(request, response);
  if (action === 'create-download-url') return await createSupportAttachmentDownloadUrl(request, response);
  if (action === 'link-message-attachments') return await linkSupportMessageAttachments(request, response);
  return response.status(400).json({ error: 'Thao tác file hỗ trợ không hợp lệ.' });
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const SUPPORT_CATEGORY_LABELS = {
  login: 'Đăng nhập',
  grades: 'Lỗi bảng điểm',
  events: 'Lỗi sự kiện',
  schedule: 'Lỗi TKB',
  lost_found: 'Lỗi tìm đồ thất lạc',
  feedback: 'Góp ý',
  other: 'Khác',
};

const SUPPORT_STATUS_LABELS = {
  open: 'Mới',
  pending: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  closed: 'Đã đóng',
};

const getAppUrl = () => String(
  process.env.APP_URL
  || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  || process.env.VITE_APP_URL
  || 'https://hotrosinhvienhub.id.vn'
).replace(/\/$/, '');

const getSupportStaffRecipientIds = async ({ ticketId, actorId }) => {
  const { data, error } = await supabase.rpc('support_staff_recipient_ids', {
    ticket_id: ticketId,
    actor_id: actorId || null,
  });
  if (error) {
    const { data: rows, error: fallbackError } = await supabase
      .from('user_roles')
      .select('id,user_id,role')
      .in('role', ['admin', 'auditor', 'support']);
    if (fallbackError) throw fallbackError;
    return [...new Set((rows || [])
      .map((row) => row.user_id || row.id)
      .filter((id) => id && id !== actorId))];
  }
  return [...new Set((data || []).map((row) => row.receiver_id || row).filter(Boolean))];
};

const sendSupportPush = async ({ receiverIds, title, body, url }) => {
  if (!hasSupportPushConfig || !receiverIds?.length) return { sent: 0, failed: 0 };
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id,user_id,subscription')
    .in('user_id', receiverIds);
  if (error) throw error;

  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.all((subscriptions || []).map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      return true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      console.error('Support ticket push failed:', error?.message || error);
      return false;
    }
  }));
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
};

const sendSupportFirstReplyEmail = async ({ ticket, userProfile }) => {
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_2;
  if (!apiKey) {
    console.warn('Skip support first reply email: missing RESEND_API_KEY/RESEND_API_KEY_2');
    return { sent: false, skipped: 'missing_resend_api_key' };
  }

  const email = String(userProfile?.email || '').trim();
  if (!email || !email.includes('@')) return { sent: false, skipped: 'missing_user_email' };

  const appUrl = getAppUrl();
  const ticketUrl = `${appUrl}/support/${ticket.id}`;
  const from = process.env.SUPPORT_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'HUB Planner <onboarding@resend.dev>';
  const userName = escapeHtml(userProfile?.full_name || userProfile?.student_code || email);
  const subject = `Phản hồi ticket: ${ticket.subject || 'Hỗ trợ'}`.slice(0, 180);
  const categoryLabel = SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category || 'Khác';
  const statusLabel = SUPPORT_STATUS_LABELS[ticket.status] || ticket.status || 'Đang xử lý';

  const html = `
    <div style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;padding:48px 16px;">
        <div style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #eef2f7;">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Xin chào <strong>${userName}</strong>,</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">Ticket hỗ trợ của bạn đã có phản hồi đầu tiên từ đội ngũ HUB Planner.</p>
          <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
            <p style="margin:0 0 8px;font-size:14px;"><strong>Tiêu đề:</strong> ${escapeHtml(ticket.subject || 'Hỗ trợ')}</p>
            <p style="margin:0 0 8px;font-size:14px;"><strong>Loại vấn đề:</strong> ${escapeHtml(categoryLabel)}</p>
            <p style="margin:0;font-size:14px;"><strong>Trạng thái:</strong> ${escapeHtml(statusLabel)}</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Vui lòng bấm nút bên dưới để xem chi tiết và tiếp tục trao đổi nếu cần.</p>
          <a href="${ticketUrl}" style="display:inline-block;background:#003375;color:#ffffff;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 22px;font-size:14px;">Xem phản hồi</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
          <p style="margin:28px 0 0;font-size:14px;line-height:1.6;">Trân trọng,<br><strong>Đội ngũ HUB Planner</strong></p>
          <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;">
            <div style="font-weight:900;color:#003375;font-size:18px;letter-spacing:.3px;">HUB PLANNER</div>
            <div style="margin-top:8px;color:#64748b;font-size:13px;">Hệ thống quản lý lộ trình học tập & hỗ trợ sinh viên</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject,
      html,
      text: `Xin chào ${userProfile?.full_name || userProfile?.student_code || email},\n\nTicket hỗ trợ của bạn đã có phản hồi đầu tiên từ đội ngũ HUB Planner.\n\nTiêu đề: ${ticket.subject}\nLoại vấn đề: ${categoryLabel}\nTrạng thái: ${statusLabel}\n\nXem phản hồi: ${ticketUrl}\n\nTrân trọng,\nĐội ngũ HUB Planner`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Không thể gửi email phản hồi ticket.');
  }

  return { sent: true };
};

const processSupportFirstReplyEmail = async ({ ticket, message }) => {
  if (!['admin', 'support'].includes(message.sender_role) || message.is_internal_note) {
    return { sent: false, skipped: 'not_public_staff_reply' };
  }

  let claim;
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({
        first_admin_reply_email_sent_at: new Date().toISOString(),
        first_admin_reply_email_message_id: message.id,
      })
      .eq('id', ticket.id)
      .is('first_admin_reply_email_sent_at', null)
      .select('id,subject,category,status,user_id')
      .maybeSingle();
    if (error) throw error;
    claim = data;
  } catch (error) {
    console.error('Support first reply email claim failed:', error?.message || error);
    return { sent: false, skipped: 'claim_failed' };
  }

  if (!claim?.id) return { sent: false, skipped: 'already_sent' };

  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,full_name,student_code')
    .eq('id', ticket.user_id)
    .maybeSingle();
  if (profileError) {
    console.error('Support first reply profile lookup failed:', profileError.message);
    return { sent: false, skipped: 'profile_lookup_failed' };
  }

  try {
    return await sendSupportFirstReplyEmail({ ticket: claim, userProfile });
  } catch (error) {
    console.error('Support first reply email send failed:', error?.message || error);
    return { sent: false, skipped: 'send_failed' };
  }
};

const processSupportMessageCreated = async (request, response) => {
  const user = await requireAuthenticatedUser(request);
  const { message_id: messageId } = request.body || {};
  if (!messageId) return response.status(400).json({ error: 'Thiếu message_id.' });

  const { data: message, error: messageError } = await supabase
    .from('support_ticket_messages')
    .select('id,ticket_id,sender_id,sender_role,is_internal_note,created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message?.id) return response.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  if (message.sender_id !== user.id) {
    const isStaff = await isSupportStaffUser(user.id);
    if (!isStaff) return response.status(403).json({ error: 'Bạn không có quyền xử lý tin nhắn này.' });
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id,user_id,assigned_to,subject,category,status')
    .eq('id', message.ticket_id)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket?.id) return response.status(404).json({ error: 'Ticket không tồn tại.' });

  if (message.is_internal_note || isClosedSupportTicketStatus(ticket.status)) {
    return response.status(200).json({ ok: true, push: { sent: 0, failed: 0 }, email: { skipped: 'no_public_notification' } });
  }

  let receiverIds = [];
  let title = 'HUB Planner';
  let body = '';
  let url = '/support';
  let email = { sent: false, skipped: 'not_applicable' };

  if (message.sender_role === 'user') {
    receiverIds = await getSupportStaffRecipientIds({ ticketId: ticket.id, actorId: message.sender_id });
    const { count } = await supabase
      .from('support_ticket_messages')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticket.id)
      .eq('is_internal_note', false);
    title = count <= 1 ? 'Ticket mới' : 'User phản hồi ticket';
    body = count <= 1
      ? `User vừa tạo ticket: ${ticket.subject || 'Hỗ trợ'}`
      : `User vừa phản hồi ticket: ${ticket.subject || 'Hỗ trợ'}`;
    url = `/admin/support/${ticket.id}`;
  } else if (['admin', 'support'].includes(message.sender_role) && ticket.user_id !== message.sender_id) {
    receiverIds = [ticket.user_id];
    title = 'Ticket của bạn đã có phản hồi';
    body = `HUB Planner vừa phản hồi ticket: ${ticket.subject || 'Hỗ trợ'}`;
    url = `/support/${ticket.id}`;
    email = await processSupportFirstReplyEmail({ ticket, message });
  }

  const push = await sendSupportPush({ receiverIds, title, body, url }).catch((error) => {
    console.error('Support message push processing failed:', error?.message || error);
    return { sent: 0, failed: 0 };
  });

  return response.status(200).json({ ok: true, push, email });
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

const OTP_EMAIL_COPY = {
  register: {
    title: 'Xác nhận đăng ký HUB Planner',
    subjectAction: 'tạo mới tài khoản',
    actionText: 'tạo mới tài khoản',
  },
  forgot_password: {
    title: 'Đặt lại mật khẩu HUB Planner',
    subjectAction: 'cài đặt lại mật khẩu',
    actionText: 'cài đặt lại mật khẩu',
  },
};

const getOtpEmailCopy = (purpose) => {
  const copy = OTP_EMAIL_COPY[purpose];
  if (!copy) throw new Error(`Loại OTP không hợp lệ khi gửi email: ${String(purpose || 'missing')}`);
  return copy;
};

const hashOtp = (email, purpose, otp) => {
  const secret = process.env.OTP_SECRET || process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_2 || process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_2;
  if (!apiKey) {
    const expireTime = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const time = formatVietnamTime(expireTime);
    const { data, error } = await supabase.functions.invoke('send-otp-email', {
      body: { email, passcode: otp, time, expiresAt: expireTime.toISOString(), purpose },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Chưa cấu hình RESEND_API_KEY/RESEND_API_KEY_2 hoặc Edge Function gửi OTP.');
    }
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'HUB Planner <onboarding@resend.dev>';
  const copy = getOtpEmailCopy(purpose);
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
      subject: `Mã xác nhận ${copy.subjectAction} HUB Planner của bạn`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin:0 0 12px;color:#003375">${copy.title}</h2>
          <p>Mã xác nhận để ${copy.actionText} của bạn là:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#003375;margin:16px 0">${otp}</div>
          <p>Mã này sẽ hết hạn vào lúc <strong>${time}</strong> theo giờ Việt Nam. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
        </div>
      `,
      text: `${otp} là mã xác nhận ${copy.subjectAction} HUB Planner. ${copy.title}. Mã hết hạn lúc ${time} theo giờ Việt Nam.`,
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
    'canva_pro_requests',
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
    if (resource === 'support-attachments') return await supportAttachmentsHandler(request, response);
    if (resource === 'support-tickets') return await supportTicketsHandler(request, response);

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
