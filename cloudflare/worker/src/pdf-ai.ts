const MAX_BODY_BYTES = 280 * 1024;
const MAX_MESSAGE_BYTES = 250 * 1024;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const TURNSTILE_TIMEOUT_MS = 8_000;
const GROQ_TIMEOUT_MS = 25_000;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;
const MAX_RATE_BUCKETS = 2_048;
const DEFAULT_EXPECTED_HOSTNAME = 'hotrosinhvienhub.id.vn';
const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PDF_AI_SYSTEM_PROMPT = 'Bạn là một API xử lý dữ liệu OCR. Nhiệm vụ duy nhất là trích xuất thông tin từ văn bản được cung cấp và trả về JSON hợp lệ. Không trả lời thêm lời dẫn hoặc giải thích.';

export type PdfAiEnv = {
  TURNSTILE_SECRET_KEY?: string;
  PDF_AI_EXPECTED_HOSTNAME?: string;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
};

type PdfAiInput = {
  message: string;
  turnstileToken: string;
};

type TurnstileVerification = {
  success?: unknown;
  hostname?: unknown;
};

type GroqResponse = {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  error?: { code?: unknown };
};

type GroqKeySlot = {
  slot: 1 | 2 | 3 | 4 | 5;
  key: string;
};

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export class PdfAiError extends Error {
  public readonly status: number;
  public readonly allow?: string;

  constructor(status: number, message: string, allow?: string) {
    super(message);
    this.name = 'PdfAiError';
    this.status = status;
    this.allow = allow;
  }
}

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const parseInput = (value: unknown): PdfAiInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PdfAiError(400, 'Yêu cầu phân tích PDF không hợp lệ.');
  }
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, ['message', 'turnstileToken'])) {
    throw new PdfAiError(400, 'Yêu cầu phân tích PDF không hợp lệ.');
  }
  const message = typeof record.message === 'string' ? record.message : '';
  const turnstileToken = typeof record.turnstileToken === 'string' ? record.turnstileToken.trim() : '';
  if (!message.trim() || !turnstileToken || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    throw new PdfAiError(400, 'Yêu cầu phân tích PDF không hợp lệ.');
  }
  if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
    throw new PdfAiError(413, 'Nội dung PDF trích xuất quá lớn để phân tích.');
  }
  return { message, turnstileToken };
};

const requestText = async (request: Request) => {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PdfAiError(413, 'Yêu cầu phân tích PDF quá lớn.');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new PdfAiError(413, 'Yêu cầu phân tích PDF quá lớn.');
  }
  return raw;
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const getClientIp = (request: Request) => request.headers.get('cf-connecting-ip')?.trim() || undefined;

const isRateLimited = (request: Request) => {
  const key = getClientIp(request) || 'unknown';
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (!existing && rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [existingKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(existingKey);
      }
      if (rateBuckets.size >= MAX_RATE_BUCKETS) return true;
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_REQUESTS_PER_WINDOW;
};

const validateTurnstile = async (request: Request, token: string, env: PdfAiEnv) => {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    throw new PdfAiError(503, 'Dịch vụ phân tích PDF tạm thời chưa sẵn sàng.');
  }

  const form = new URLSearchParams({ secret, response: token });
  const remoteip = getClientIp(request);
  if (remoteip) form.set('remoteip', remoteip);

  let response: Response;
  try {
    response = await fetchWithTimeout(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }, TURNSTILE_TIMEOUT_MS);
  } catch {
    throw new PdfAiError(503, 'Không thể hoàn tất bước xác minh bảo mật. Vui lòng thử lại.');
  }

  let result: TurnstileVerification | null = null;
  try {
    result = await response.json() as TurnstileVerification;
  } catch {
    // Fall through to the fixed, safe rejection below.
  }
  const expectedHostname = env.PDF_AI_EXPECTED_HOSTNAME?.trim() || DEFAULT_EXPECTED_HOSTNAME;
  if (!response.ok || result?.success !== true || result.hostname !== expectedHostname) {
    throw new PdfAiError(403, 'Xác minh bảo mật không thành công. Vui lòng thử lại.');
  }
};

const groqKeys = (env: PdfAiEnv): GroqKeySlot[] => {
  const candidates: Array<[GroqKeySlot['slot'], string | undefined]> = [
    [1, env.GROQ_API_KEY],
    [2, env.GROQ_API_KEY_2],
    [3, env.GROQ_API_KEY_3],
    [4, env.GROQ_API_KEY_4],
    [5, env.GROQ_API_KEY_5],
  ];
  return candidates.flatMap(([slot, candidate]) => {
  const key = candidate?.trim();
    return key ? [{ slot, key }] : [];
  });
};

const chooseGroqKey = (keys: GroqKeySlot[]) =>
  keys[Math.min(keys.length - 1, Math.floor(Math.random() * keys.length))];

const requestGroq = async (message: string, key: string, model: string) => {
  let response: Response;
  try {
    response = await fetchWithTimeout(GROQ_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: PDF_AI_SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
        model,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 4096,
        temperature: 0.1,
      }),
    }, GROQ_TIMEOUT_MS);
  } catch {
    throw new PdfAiError(502, 'Dịch vụ phân tích PDF đang tạm thời không phản hồi.');
  }

  let payload: GroqResponse | null = null;
  try {
    payload = await response.json() as GroqResponse;
  } catch {
    // The client receives only the fixed error contract below.
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new PdfAiError(429, 'Hệ thống phân tích đang quá tải. Vui lòng thử lại sau.');
    }
    throw new PdfAiError(502, 'Dịch vụ phân tích PDF đang tạm thời không phản hồi.');
  }
  if (payload?.choices?.[0]?.finish_reason === 'length') {
    throw new PdfAiError(422, 'Kết quả phân tích quá dài. Vui lòng dùng PDF có ít nội dung hơn.');
  }
  const reply = payload?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new PdfAiError(502, 'Dịch vụ phân tích PDF trả về dữ liệu không hợp lệ.');
  }
  return reply;
};

/**
 * Anonymous, Turnstile-gated OCR fallback. It deliberately accepts neither a
 * browser identity nor a caller-controlled user id and never forwards cookies.
 */
export const handlePdfAi = async (request: Request, env: PdfAiEnv) => {
  if (request.method !== 'POST') {
    throw new PdfAiError(405, 'Chỉ hỗ trợ phương thức POST.', 'POST, OPTIONS');
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new PdfAiError(415, 'Content-Type phải là application/json.');
  }
  if (isRateLimited(request)) {
    throw new PdfAiError(429, 'Quá nhiều yêu cầu phân tích PDF. Vui lòng thử lại sau.');
  }

  let input: PdfAiInput;
  try {
    input = parseInput(JSON.parse(await requestText(request)));
  } catch (error) {
    if (error instanceof PdfAiError) throw error;
    throw new PdfAiError(400, 'Yêu cầu phân tích PDF không hợp lệ.');
  }

  // Siteverify is intentionally called once, immediately before the paid AI request.
  await validateTurnstile(request, input.turnstileToken, env);
  const keys = groqKeys(env);
  if (keys.length === 0) {
    throw new PdfAiError(503, 'Dịch vụ phân tích PDF tạm thời chưa sẵn sàng.');
  }

  let lastError: PdfAiError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selectedKey = chooseGroqKey(keys);
    try {
      return { reply: await requestGroq(input.message, selectedKey.key, env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b') };
    } catch (error) {
      if (!(error instanceof PdfAiError)) throw error;
      lastError = error;
      // Match the established /chat policy: retry any provider failure except
      // a completed-but-truncated response. No key material is logged.
      if (error.status === 422) break;
    }
  }
  throw lastError || new PdfAiError(502, 'Dịch vụ phân tích PDF đang tạm thời không phản hồi.');
};

export const pdfAiErrorStatus = (error: unknown) => error instanceof PdfAiError ? error.status : 500;

export const resetPdfAiRateLimitForTest = () => rateBuckets.clear();
