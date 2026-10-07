import { requireBetterAuthStaff, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

export interface EventBannerEnv extends BetterAuthIdentityEnv {
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
}

export class EventBannerError extends Error {
  readonly status: 400 | 404 | 405 | 413 | 415 | 503;
  constructor(status: EventBannerError['status'], message: string) {
    super(message);
    this.name = 'EventBannerError';
    this.status = status;
  }
}

export const MAX_EVENT_BANNER_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
const KEY_PATTERN = /^event-banners\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
const URL_PREFIX = '/api/public/v1/event-banners/';

const bucketOf = (env: EventBannerEnv) => {
  if (!env.SUPPORT_ATTACHMENTS_BUCKET) throw new EventBannerError(503, 'Kho ảnh sự kiện chưa sẵn sàng.');
  return env.SUPPORT_ATTACHMENTS_BUCKET;
};

export const validateEventBannerBytes = (bytes: Uint8Array, contentType: string) => {
  if (!TYPES[contentType]) throw new EventBannerError(415, 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.');
  if (bytes.length === 0) throw new EventBannerError(400, 'Ảnh sự kiện trống.');
  if (bytes.length > MAX_EVENT_BANNER_BYTES) throw new EventBannerError(413, 'Ảnh sự kiện vượt quá 2 MB.');
  const jpeg = contentType === 'image/jpeg' && bytes.length >= 4 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const png = contentType === 'image/png' && bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp = contentType === 'image/webp' && bytes.length >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new EventBannerError(415, 'Nội dung tệp không phải ảnh hợp lệ.');
};

const readBoundedImage = async (request: Request): Promise<Uint8Array> => {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_EVENT_BANNER_BYTES) throw new EventBannerError(413, 'Ảnh sự kiện vượt quá 2 MB.');
  if (!request.body) throw new EventBannerError(400, 'Thiếu ảnh sự kiện.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_EVENT_BANNER_BYTES) {
        await reader.cancel();
        throw new EventBannerError(413, 'Ảnh sự kiện vượt quá 2 MB.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
};

export const uploadEventBanner = async (request: Request, env: EventBannerEnv) => {
  if (request.method !== 'POST') throw new EventBannerError(405, 'Chỉ hỗ trợ POST.');
  await requireBetterAuthStaff(request, env);
  const contentType = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!TYPES[contentType]) throw new EventBannerError(415, 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.');
  const bytes = await readBoundedImage(request);
  validateEventBannerBytes(bytes, contentType);
  const key = `event-banners/${crypto.randomUUID()}.${TYPES[contentType]}`;
  await bucketOf(env).put(key, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { purpose: 'event-banner' },
  });
  return { success: true, image_url: `${URL_PREFIX}${key}` };
};

export const readEventBanner = async (request: Request, key: string, env: EventBannerEnv) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new EventBannerError(405, 'Chỉ hỗ trợ GET/HEAD.');
  if (!KEY_PATTERN.test(key)) throw new EventBannerError(404, 'Không tìm thấy ảnh.');
  const object = await bucketOf(env).get(key);
  if (!object) throw new EventBannerError(404, 'Không tìm thấy ảnh.');
  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};
