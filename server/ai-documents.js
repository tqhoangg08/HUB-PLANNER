import crypto from 'node:crypto';

export const AI_DOCUMENT_BUCKET = process.env.AI_DOCUMENTS_BUCKET || 'ai-documents';
export const AI_DOCUMENT_MAX_SIZE_MB = Number(process.env.AI_DOCUMENT_MAX_SIZE_MB || 20);
export const AI_DOCUMENT_MAX_BYTES = AI_DOCUMENT_MAX_SIZE_MB * 1024 * 1024;

export const SUPPORTED_DOCUMENTS = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['txt', 'text/plain'],
  ['csv', 'text/csv'],
]);

export const sanitizeFileName = (value = '') => String(value)
  .normalize('NFKC')
  .replace(/[\\/\0-\x1f\x7f]+/g, '-')
  .replace(/\.\.+/g, '.')
  .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180);

export const validateStoragePath = (path, userId) => {
  const normalized = String(path || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('/..')) {
    throw new Error('Đường dẫn lưu trữ không hợp lệ');
  }
  if (userId && !normalized.startsWith(`${userId}/`)) {
    throw new Error('File không thuộc thư mục của tài khoản quản trị');
  }
  return normalized;
};

export const validateDocumentFile = ({ fileName, mimeType, fileSize }) => {
  const safeName = sanitizeFileName(fileName);
  const extension = safeName.split('.').pop()?.toLowerCase() || '';
  const expectedMime = SUPPORTED_DOCUMENTS.get(extension);
  if (!safeName || !expectedMime) throw new Error('Định dạng tài liệu không được hỗ trợ');
  if (Number(fileSize) <= 0 || Number(fileSize) > AI_DOCUMENT_MAX_BYTES) {
    throw new Error(`Dung lượng file phải nhỏ hơn hoặc bằng ${AI_DOCUMENT_MAX_SIZE_MB} MB`);
  }
  const actualMime = String(mimeType || '').toLowerCase();
  if (actualMime && actualMime !== 'application/octet-stream' && actualMime !== expectedMime) {
    throw new Error('Phần mở rộng và MIME type của file không khớp');
  }
  return { safeName, extension, mimeType: expectedMime };
};

export const validateDocumentSignature = (buffer, extension) => {
  const bytes = Buffer.from(buffer || []);
  const header = bytes.subarray(0, 8).toString('hex').toLowerCase();
  const isZip = header.startsWith('504b0304') || header.startsWith('504b0506') || header.startsWith('504b0708');
  const valid = extension === 'pdf'
    ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : extension === 'doc'
      ? header.startsWith('d0cf11e0a1b11ae1')
      : ['docx', 'pptx', 'xlsx'].includes(extension)
        ? isZip
        : ['txt', 'csv'].includes(extension)
          ? !bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0)
          : false;
  if (!valid) throw new Error('Nội dung file không khớp với định dạng đã khai báo');
  return true;
};

export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export const escapeMetadataFilterValue = (value) =>
  String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const buildDocumentMetadataFilter = ({ visibility = 'public', programCode } = {}) => {
  const clauses = [`visibility = "${escapeMetadataFilterValue(visibility)}"`];
  if (programCode) {
    const code = escapeMetadataFilterValue(programCode);
    clauses.push(`(program_code = "${code}" OR program_code = "all")`);
  }
  return clauses.join(' AND ');
};

export const extractDocumentSources = (interaction) => {
  const citations = [];
  for (const step of interaction?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const content of step.content || []) {
      if (content?.type !== 'text') continue;
      for (const annotation of content.annotations || []) {
        if (annotation?.type !== 'file_citation') continue;
        citations.push({
          documentId: null,
          fileName: annotation.file_name || 'Tài liệu tham khảo',
          title: null,
          pageNumber: annotation.page_number ?? null,
          source: annotation.source || annotation.document_uri || '',
          category: null,
          storagePath: null,
        });
      }
    }
  }
  const unique = new Map();
  for (const citation of citations) {
    unique.set(`${citation.source}|${citation.fileName}|${citation.pageNumber ?? ''}`, citation);
  }
  return [...unique.values()];
};

export const extractDocumentCitations = extractDocumentSources;

