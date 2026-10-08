import {
  detectEventBannerContentType,
  MAX_EVENT_BANNER_BYTES,
  readBoundedEventBannerImage,
  validateEventBannerBytes,
} from './event-banner.ts';

export type CandidateImageStatus = 'missing' | 'pending' | 'stored' | 'manual_required' | 'failed';
export type CandidateImageRightsBasis = 'owned' | 'licensed' | 'permission';

export interface CandidateImageEnv {
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
}

const FACEBOOK_IMAGE_HOST = /^scontent(?:[.-][a-z0-9-]+)*\.fbcdn\.net$/i;
const IMAGE_RIGHTS_BASIS = new Set<CandidateImageRightsBasis>(['owned', 'licensed', 'permission']);
const BANNER_URL_PREFIX = '/api/public/v1/event-banners/';
const BANNER_KEY_PATTERN = /^event-banners\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export const imageRightsBasis = (value: unknown, confirmed: unknown): CandidateImageRightsBasis | null =>
  confirmed === true && typeof value === 'string' && IMAGE_RIGHTS_BASIS.has(value as CandidateImageRightsBasis)
    ? value as CandidateImageRightsBasis : null;

export const candidateImageKey = (imageUrl: string | null | undefined): string | null => {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl, 'https://hotrosinhvienhub.id.vn');
    if (url.origin !== 'https://hotrosinhvienhub.id.vn' || !url.pathname.startsWith(BANNER_URL_PREFIX)) return null;
    const key = url.pathname.slice(BANNER_URL_PREFIX.length);
    return BANNER_KEY_PATTERN.test(key) ? key : null;
  } catch { return null; }
};

export const isDurableCandidateImage = (imageUrl: string | null | undefined): boolean =>
  candidateImageKey(imageUrl) !== null;

// A narrow public-CDN allowlist also excludes IP literals, localhost and private
// network hostnames. No arbitrary host, URL credentials, non-HTTPS port or redirect.
export const allowedCandidateImageUrl = (value: unknown): URL | null => {
  if (typeof value !== 'string' || !value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    return FACEBOOK_IMAGE_HOST.test(url.hostname) ? url : null;
  } catch { return null; }
};

export const fetchCandidateImage = async (
  url: URL,
  fetcher: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> => {
  if (!allowedCandidateImageUrl(url.href)) throw new Error('image_source_not_allowed');
  const response = await fetcher(url.href, {
    redirect: 'manual',
    headers: { Accept: 'image/jpeg,image/png,image/webp' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error('image_source_unavailable');
  const declaredType = String(response.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  const bytes = await readBoundedEventBannerImage(response.body, response.headers.get('Content-Length'));
  const detectedType = detectEventBannerContentType(bytes);
  if (!detectedType || declaredType !== detectedType) throw new Error('image_type_invalid');
  validateEventBannerBytes(bytes, detectedType);
  return { bytes, contentType: detectedType };
};

export const validateCandidateBinaryImage = (requestType: string | null, bytes: Uint8Array) => {
  const declaredType = String(requestType || '').split(';', 1)[0].trim().toLowerCase();
  const detectedType = detectEventBannerContentType(bytes);
  if (!detectedType || declaredType !== detectedType) throw new Error('image_type_invalid');
  validateEventBannerBytes(bytes, detectedType);
  return detectedType;
};

export const putCandidateImage = async (
  env: CandidateImageEnv,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ key: string; imageUrl: string }> => {
  if (!env.SUPPORT_ATTACHMENTS_BUCKET) throw new Error('image_storage_unavailable');
  validateEventBannerBytes(bytes, contentType);
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
  const key = `event-banners/${crypto.randomUUID()}.${extension}`;
  await env.SUPPORT_ATTACHMENTS_BUCKET.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { purpose: 'event-candidate-banner' },
  });
  return { key, imageUrl: `${BANNER_URL_PREFIX}${key}` };
};

export const MAX_CANDIDATE_IMAGE_BYTES = MAX_EVENT_BANNER_BYTES;
