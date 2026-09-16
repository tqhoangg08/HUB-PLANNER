import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { enqueueLostFoundPush, type NotificationCronEnv } from './notification-cron.ts';

export interface LostFoundEnv extends BetterAuthIdentityEnv, Pick<NotificationCronEnv, 'PUSH_EVENTS_QUEUE'> {
  DB: D1Database;
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
  TURNSTILE_SECRET_KEY?: string;
}

type LostFoundStatus = 'pending' | 'approved' | 'rejected' | 'resolved';
interface D1LostFoundRow {
  id: number; created_at: string; updated_at?: string; type: 'FOUND' | 'LOST';
  title: string; description: string | null; location: string | null;
  contact_info: string | null; user_name: string | null; image_url: string | null;
  image_key?: string | null; status: LostFoundStatus; is_deleted: number; user_id: string | null;
}
export interface LostFoundQuery { limit: number; offset: number; type: 'FOUND' | 'LOST' | null; search: string; }
type LostFoundErrorStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 500 | 502 | 503;
export class LostFoundError extends Error {
  readonly status: LostFoundErrorStatus;
  constructor(status: LostFoundErrorStatus, message: string) { super(message); this.name = 'LostFoundError'; this.status = status; }
}

const LOST_FOUND_COLUMNS = ['id','created_at','type','title','description','location','contact_info','user_name','image_url','status','is_deleted','user_id'] as const;
const ADMIN_COLUMNS = [...LOST_FOUND_COLUMNS, 'updated_at', 'image_key'] as const;
const MAX_BODY_BYTES = 4_300_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PUBLIC_IMAGE_PREFIX = '/api/public/v1/lost-found-images/';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const nullableText = (value: unknown, max: number) => text(value, max) || null;

export const normalizeLostFoundSearch = (value: unknown) => String(value || '').toLocaleLowerCase('vi-VN').trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim();
export const parseLostFoundQuery = (params: URLSearchParams): LostFoundQuery => {
  const rawType = String(params.get('type') || '').trim().toUpperCase();
  return { limit: Math.max(1, Math.min(Number(params.get('limit')) || 24, 50)), offset: Math.max(0, Number(params.get('offset')) || 0), type: rawType === 'FOUND' || rawType === 'LOST' ? rawType : null, search: normalizeLostFoundSearch(params.get('search')) };
};
const formatTimestamp = (value: string) => value.replace(/\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '.$1').replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');
const responseRow = (row: D1LostFoundRow) => ({ ...row, created_at: formatTimestamp(row.created_at), is_deleted: Boolean(row.is_deleted) });

export const handleLostFound = async (requestUrl: URL, env: LostFoundEnv) => {
  const query = parseLostFoundQuery(requestUrl.searchParams);
  const where = ['is_deleted = 0', "status IN ('approved', 'resolved')"];
  const bindings: Array<string | number> = [];
  if (query.type) { where.push('type = ?'); bindings.push(query.type); }
  if (query.search) { where.push('(title_search LIKE ? OR location_search LIKE ? OR description_search LIKE ?)'); const pattern = `%${query.search}%`; bindings.push(pattern, pattern, pattern); }
  const whereSql = where.join(' AND ');
  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM public_lost_found_items WHERE ${whereSql}`).bind(...bindings).first<{ total: number }>();
  const total = Number(countRow?.total || 0);
  const result = await env.DB.prepare(`SELECT ${LOST_FOUND_COLUMNS.join(', ')} FROM public_lost_found_items WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset).all<D1LostFoundRow>();
  const data = (result.results || []).map(responseRow);
  return { success: true, data, total, hasMore: total > query.offset + data.length };
};

const readJson = async (request: Request) => {
  const contentType = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new LostFoundError(415, 'Yêu cầu phải sử dụng Content-Type application/json.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new LostFoundError(413, 'Dữ liệu ảnh quá lớn.');
  try { const value = JSON.parse(raw) as unknown; if (!isRecord(value)) throw new Error(); return value; }
  catch { throw new LostFoundError(400, 'Dữ liệu tìm đồ không hợp lệ.'); }
};
const imageExtension = (contentType: string) => contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
const hasImageSignature = (bytes: Uint8Array, contentType: string) => {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (contentType === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  if (contentType === 'image/gif') { const sig = new TextDecoder().decode(bytes.slice(0, 6)); return sig === 'GIF87a' || sig === 'GIF89a'; }
  if (contentType === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
};
const decodeImage = (body: Record<string, unknown>) => {
  const contentType = text(body.contentType, 100).toLowerCase(); const base64 = String(body.base64 || '');
  if (!ALLOWED_IMAGE_TYPES.has(contentType) || !base64 || base64.length > 4_200_000) throw new LostFoundError(400, 'Dữ liệu ảnh không hợp lệ.');
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); } catch { throw new LostFoundError(400, 'Dữ liệu ảnh không hợp lệ.'); }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new LostFoundError(413, 'Ảnh tìm đồ quá lớn.');
  if (!hasImageSignature(bytes, contentType)) throw new LostFoundError(400, 'Nội dung tệp ảnh không hợp lệ.');
  return { bytes, contentType };
};
const requireBucket = (env: LostFoundEnv) => { if (!env.SUPPORT_ATTACHMENTS_BUCKET) throw new LostFoundError(503, 'Dịch vụ ảnh tìm đồ chưa sẵn sàng.'); return env.SUPPORT_ATTACHMENTS_BUCKET; };
const encodedKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
export const lostFoundImageUrl = (key: string) => `${PUBLIC_IMAGE_PREFIX}${encodedKey(key)}`;
const isSafeImageKey = (key: string) => key.startsWith('lost-found/') && key.length <= 512 && !key.includes('..') && /^[a-zA-Z0-9._/-]+$/.test(key);
const keyFromImageUrl = (value: unknown) => { const url = String(value || ''); if (!url.startsWith(PUBLIC_IMAGE_PREFIX)) return null; try { const key = url.slice(PUBLIC_IMAGE_PREFIX.length).split('/').map(decodeURIComponent).join('/'); return isSafeImageKey(key) ? key : null; } catch { return null; } };
const putImage = async (env: LostFoundEnv, input: { bytes: Uint8Array; contentType: string }) => {
  const key = `lost-found/${crypto.randomUUID()}.${imageExtension(input.contentType)}`;
  await requireBucket(env).put(key, input.bytes, { httpMetadata: { contentType: input.contentType, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { purpose: 'lost-found' } });
  return { key, url: lostFoundImageUrl(key) };
};
const deleteImage = async (env: LostFoundEnv, key: string | null | undefined) => { if (key && isSafeImageKey(key) && env.SUPPORT_ATTACHMENTS_BUCKET) await env.SUPPORT_ATTACHMENTS_BUCKET.delete(key); };

const projectionUpsert = (env: LostFoundEnv, id: number) => env.DB.prepare(`INSERT INTO public_lost_found_items (id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id,title_search,location_search,description_search)
  SELECT id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id,title_search,location_search,description_search FROM lost_found_items WHERE id=? AND is_deleted=0 AND status IN ('approved','resolved')
  ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,type=excluded.type,title=excluded.title,description=excluded.description,location=excluded.location,contact_info=excluded.contact_info,user_name=excluded.user_name,image_url=excluded.image_url,status=excluded.status,is_deleted=excluded.is_deleted,user_id=excluded.user_id,title_search=excluded.title_search,location_search=excluded.location_search,description_search=excluded.description_search`).bind(id);

const createLostFound = async (env: LostFoundEnv, payload: Record<string, unknown>, identity: BetterAuthIdentity | null) => {
  const title = text(payload.title, 200), description = text(payload.description, 2_000), location = text(payload.location, 300), contactInfo = text(payload.contact_info, 300), userName = text(payload.user_name || 'Ẩn danh', 200);
  if (!title || !location || !contactInfo) throw new LostFoundError(400, 'Thiếu thông tin bắt buộc.');
  let image: { key: string; url: string } | null = null;
  if (isRecord(payload.image) && payload.image.base64) image = await putImage(env, decodeImage(payload.image));
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`INSERT INTO lost_found_items (created_at,updated_at,type,title,description,location,contact_info,user_name,image_url,image_key,status,is_deleted,user_id,title_search,location_search,description_search) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',0,?,?,?,?)`)
      .bind(now, now, payload.type === 'FOUND' ? 'FOUND' : 'LOST', title, description || null, location, contactInfo, userName, image?.url || null, image?.key || null, identity?.userId || null, normalizeLostFoundSearch(title), normalizeLostFoundSearch(location), normalizeLostFoundSearch(description)).run();
    return { success: true, id: Number(result.meta?.last_row_id || 0) };
  } catch (error) { await deleteImage(env, image?.key); throw error; }
};
const verifyTurnstile = async (request: Request, env: LostFoundEnv, token: unknown) => {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) throw new LostFoundError(503, 'Hệ thống xác minh đang tạm thời không sẵn sàng.');
  if (typeof token !== 'string' || !token.trim()) throw new LostFoundError(400, 'Vui lòng xác minh bạn không phải robot.');
  const form = new FormData(); form.set('secret', secret); form.set('response', token.trim()); const ip = String(request.headers.get('CF-Connecting-IP') || '').trim(); if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(8_000) });
  const result = await response.json().catch(() => null) as { success?: boolean } | null;
  if (!response.ok || result?.success !== true) throw new LostFoundError(400, 'Xác minh bảo mật không thành công. Vui lòng thử lại.');
};
export const submitLostFound = async (request: Request, env: LostFoundEnv, body: Record<string, unknown>, identity: BetterAuthIdentity | null) => { await verifyTurnstile(request, env, body.turnstileToken); return createLostFound(env, isRecord(body.payload) ? body.payload : {}, identity); };

export const handleAdminLostFound = async (request: Request, url: URL, env: LostFoundEnv) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (request.method === 'GET') {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 24, 100)), offset = Math.max(0, Number(url.searchParams.get('offset')) || 0), type = String(url.searchParams.get('type') || '').toUpperCase(), id = Number(url.searchParams.get('id') || 0);
    const where = ['is_deleted = 0']; const bindings: Array<string | number> = [];
    if (type === 'FOUND' || type === 'LOST') { where.push('type = ?'); bindings.push(type); }
    if (Number.isSafeInteger(id) && id > 0) { where.push('id = ?'); bindings.push(id); }
    const whereSql = where.join(' AND ');
    const count = await env.DB.prepare(`SELECT COUNT(*) total FROM lost_found_items WHERE ${whereSql}`).bind(...bindings).first<{ total: number }>();
    const rows = await env.DB.prepare(`SELECT ${ADMIN_COLUMNS.join(', ')} FROM lost_found_items WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<D1LostFoundRow>();
    return { success: true, data: (rows.results || []).map(responseRow), total: Number(count?.total || 0), role: staff.role };
  }
  if (staff.role !== 'admin') throw new BetterAuthIdentityError(403, 'FORBIDDEN');
  if (request.method === 'POST') { const body = await readJson(request); if (body.operation !== 'upload-image') throw new LostFoundError(400, 'Thao tác tìm đồ không hợp lệ.'); const image = await putImage(env, decodeImage(body)); return { success: true, publicUrl: image.url }; }
  if (request.method !== 'PATCH') throw new LostFoundError(405, 'Phương thức không được hỗ trợ.');
  const body = await readJson(request), id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new LostFoundError(400, 'Dữ liệu tìm đồ không hợp lệ.');
  const existing = await env.DB.prepare('SELECT * FROM lost_found_items WHERE id = ?').bind(id).first<D1LostFoundRow>();
  if (!existing) throw new LostFoundError(404, 'Không tìm thấy dữ liệu tìm đồ.');
  const next: D1LostFoundRow = { ...existing, updated_at: new Date().toISOString() };
  for (const [field, max] of [['title',200],['description',2_000],['location',300],['contact_info',300],['user_name',200]] as const) if (typeof body[field] === 'string' || body[field] === null) (next as unknown as Record<string, unknown>)[field] = nullableText(body[field], max);
  if (!next.title || !next.location || !next.contact_info) throw new LostFoundError(400, 'Thiếu thông tin bắt buộc.');
  if (typeof body.status === 'string') { const status = body.status.trim().toLowerCase(); if (!['pending','approved','rejected','resolved'].includes(status)) throw new LostFoundError(400, 'Trạng thái báo cáo không hợp lệ.'); next.status = status as LostFoundStatus; }
  if (typeof body.is_deleted === 'boolean') next.is_deleted = body.is_deleted ? 1 : 0;
  if (typeof body.image_url === 'string' || body.image_url === null) { next.image_url = nullableText(body.image_url, 1_000); next.image_key = keyFromImageUrl(next.image_url); }
  const oldImageKey = existing.image_key;
  if (next.is_deleted !== 0) { next.image_url = null; next.image_key = null; }
  const imageKeyToDelete = oldImageKey && oldImageKey !== next.image_key ? oldImageKey : null;
  const removeProjection = next.is_deleted !== 0 || !['approved','resolved'].includes(next.status);
  const becameApproved = existing.status !== 'approved' && next.status === 'approved' && next.is_deleted === 0;
  await env.DB.batch([
    env.DB.prepare('UPDATE lost_found_items SET updated_at=?,title=?,description=?,location=?,contact_info=?,user_name=?,image_url=?,image_key=?,status=?,is_deleted=?,title_search=?,location_search=?,description_search=? WHERE id=?').bind(next.updated_at,next.title,next.description,next.location,next.contact_info,next.user_name,next.image_url,next.image_key,next.status,next.is_deleted,normalizeLostFoundSearch(next.title),normalizeLostFoundSearch(next.location),normalizeLostFoundSearch(next.description),id),
    removeProjection ? env.DB.prepare('DELETE FROM public_lost_found_items WHERE id=?').bind(id) : projectionUpsert(env,id),
    removeProjection ? env.DB.prepare('DELETE FROM lost_found_push_queue WHERE lost_found_item_id=? AND sent_at IS NULL').bind(id) : env.DB.prepare('SELECT 1'),
  ]);
  if (becameApproved) {
    await enqueueLostFoundPush(env, {
      id, title: next.title, type: next.type, userName: next.user_name, location: next.location,
    });
  }
  await deleteImage(env, imageKeyToDelete);
  return { success: true };
};

export const handleLostFoundImage = async (request: Request, key: string, env: LostFoundEnv) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new LostFoundError(405, 'Phương thức không được hỗ trợ.');
  if (!isSafeImageKey(key)) throw new LostFoundError(404, 'Không tìm thấy ảnh.');
  const object = await requireBucket(env).get(key); if (!object) throw new LostFoundError(404, 'Không tìm thấy ảnh.');
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('ETag', object.httpEtag); headers.set('Cache-Control', 'public, max-age=31536000, immutable'); headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};
export const lostFoundErrorStatus = (error: unknown) => error instanceof LostFoundError || error instanceof BetterAuthIdentityError ? error.status : 500;
