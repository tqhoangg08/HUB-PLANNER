import { apiHeaders, apiUrl } from './api';
import { supabase } from './supabase';
import type { SupportTicketAttachment } from './supportTicketsApi';

export const SUPPORT_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const SUPPORT_MAX_ATTACHMENTS = 3;
export const SUPPORT_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_PDF_MAX_BYTES = 10 * 1024 * 1024;

export interface PendingSupportAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  progress: number;
  error?: string;
}

const endpoint = () => apiUrl('/auth?resource=support-attachments');
const isDev = import.meta.env.DEV;

const logSupportAttachmentPayload = (queryName: string, data: unknown) => {
  if (!isDev) return;
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
  const bytes = new Blob([JSON.stringify(data ?? null)]).size;
  console.info(`[support-attachment-query] ${queryName}`, { rows, bytes });
};

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Bạn cần đăng nhập để gửi file hỗ trợ.');
  return token;
};

const postSupportAttachmentAction = async <T>(action: string, payload: Record<string, unknown>) => {
  const token = await getAccessToken();
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok) logSupportAttachmentPayload(action, data);
  if (!response.ok) throw new Error(data?.error || 'Không thể xử lý file đính kèm.');
  return data as T;
};

export const formatAttachmentSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export const sanitizeDisplayFileName = (value: string) => value
  .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180) || 'attachment';

export const validateSupportFile = (file: File) => {
  const mimeType = file.type;
  if (!SUPPORT_ATTACHMENT_MIME_TYPES.includes(mimeType as any)) {
    throw new Error('Chỉ hỗ trợ JPG, PNG, WEBP và PDF.');
  }
  if (!file.size) throw new Error('File không được để trống.');
  const limit = mimeType === 'application/pdf' ? SUPPORT_PDF_MAX_BYTES : SUPPORT_IMAGE_MAX_BYTES;
  if (file.size > limit) throw new Error('Ảnh tối đa 5 MB, PDF tối đa 10 MB.');
};

export const createPendingSupportAttachments = (
  files: File[],
  current: PendingSupportAttachment[] = [],
) => {
  if (current.length + files.length > SUPPORT_MAX_ATTACHMENTS) {
    throw new Error('Mỗi tin nhắn chỉ được đính kèm tối đa 3 file.');
  }
  const totalSize = current.reduce((sum, item) => sum + item.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > SUPPORT_MAX_TOTAL_BYTES) {
    throw new Error('Tổng dung lượng mỗi tin nhắn tối đa 15 MB.');
  }
  return files.map((file) => {
    validateSupportFile(file);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: sanitizeDisplayFileName(file.name),
      mimeType: file.type,
      size: file.size,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      progress: 0,
    } satisfies PendingSupportAttachment;
  });
};

export const createSupportUploadUrl = (ticketId: string, file: File) => postSupportAttachmentAction<{
  upload_url: string;
  file_key: string;
  expires_at: string;
}>('create-upload-url', {
  ticket_id: ticketId,
  file_name: sanitizeDisplayFileName(file.name),
  mime_type: file.type,
  size: file.size,
});

export const completeSupportUpload = (ticketId: string, file: File, fileKey: string) => postSupportAttachmentAction<{
  attachment: SupportTicketAttachment;
}>('complete-upload', {
  ticket_id: ticketId,
  file_key: fileKey,
  file_name: sanitizeDisplayFileName(file.name),
  mime_type: file.type,
  size: file.size,
});

export const linkSupportMessageAttachments = (
  ticketId: string,
  messageId: string,
  attachmentIds: string[],
) => postSupportAttachmentAction<{ attachments: SupportTicketAttachment[] }>('link-message-attachments', {
  ticket_id: ticketId,
  message_id: messageId,
  attachment_ids: attachmentIds,
});

export const createSupportDownloadUrl = (attachmentId: string) => postSupportAttachmentAction<{
  download_url: string;
  expires_at: string;
}>('create-download-url', {
  attachment_id: attachmentId,
});

export const uploadFileToSignedUrl = (
  uploadUrl: string,
  file: File,
  onProgress?: (progress: number) => void,
) => new Promise<void>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', uploadUrl);
  xhr.setRequestHeader('Content-Type', file.type);
  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    onProgress?.(Math.max(1, Math.min(95, Math.round((event.loaded / event.total) * 95))));
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      onProgress?.(100);
      resolve();
      return;
    }
    reject(new Error('Upload file lên R2 không thành công.'));
  };
  xhr.onerror = () => reject(new Error('Không thể kết nối Cloudflare R2 để upload file.'));
  xhr.send(file);
});

export const uploadSupportAttachments = async (
  ticketId: string,
  pendingFiles: PendingSupportAttachment[],
  onProgress?: (id: string, progress: number) => void,
) => {
  const attachments: SupportTicketAttachment[] = [];
  for (const item of pendingFiles) {
    onProgress?.(item.id, 5);
    const upload = await createSupportUploadUrl(ticketId, item.file);
    await uploadFileToSignedUrl(upload.upload_url, item.file, (progress) => onProgress?.(item.id, progress));
    const completed = await completeSupportUpload(ticketId, item.file, upload.file_key);
    onProgress?.(item.id, 100);
    attachments.push(completed.attachment);
  }
  return attachments;
};
