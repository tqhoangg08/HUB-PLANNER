const PDF_AI_ENDPOINT = '/api/public/v1/pdf-ai';

type PdfAiResponse = {
  reply?: unknown;
  error?: unknown;
};

const safeErrorMessage = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 160)
    : '';

/**
 * Sends only the extracted PDF text and its single-use Turnstile token to the
 * same-origin Public Worker. This intentionally has no Supabase fallback.
 */
export const requestPdfAi = async (message: string, turnstileToken: string): Promise<string> => {
  if (!turnstileToken.trim()) {
    throw new Error('Vui lòng hoàn tất xác minh bảo mật trước khi phân tích PDF.');
  }

  const response = await fetch(PDF_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    body: JSON.stringify({ message, turnstileToken }),
  });

  let payload: PdfAiResponse | null = null;
  try {
    payload = await response.json() as PdfAiResponse;
  } catch {
    // The Worker has a fixed JSON error contract. Do not expose a raw body.
  }

  if (!response.ok) {
    const detail = safeErrorMessage(payload?.error);
    throw new Error(`API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
  }

  if (typeof payload?.reply !== 'string' || !payload.reply.trim()) {
    throw new Error('API Error: 502 - Phản hồi phân tích PDF không hợp lệ.');
  }

  return payload.reply;
};
