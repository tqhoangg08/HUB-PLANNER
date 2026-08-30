export class ProtectedSubmitError extends Error {
  status?: number;
  category: 'missing-token' | 'verification-failed' | 'security-service' | 'unknown';

  constructor(message: string, category: ProtectedSubmitError['category'], status?: number) {
    super(message);
    this.name = 'ProtectedSubmitError';
    this.category = category;
    this.status = status;
  }
}

const normalizeProtectedSubmitError = (status?: number, rawMessage = '') => {
  const lowerMessage = rawMessage.toLowerCase();
  if (!status) {
    return new ProtectedSubmitError('Vui lòng hoàn tất xác minh bảo mật rồi thử lại.', 'missing-token');
  }
  if (status >= 500) {
    return new ProtectedSubmitError('Hệ thống xác minh đang tạm thời gặp sự cố. Vui lòng thử lại sau ít phút.', 'security-service', status);
  }
  if (lowerMessage.includes('robot') || lowerMessage.includes('xac minh') || lowerMessage.includes('xác minh')) {
    return new ProtectedSubmitError('Xác minh bảo mật chưa thành công. Vui lòng xác minh lại rồi thử tiếp.', 'verification-failed', status);
  }
  return new ProtectedSubmitError('Không thể hoàn tất bước xác minh bảo mật. Vui lòng thử lại.', 'unknown', status);
};

export const requireTurnstile = (token: string) => {
  if (!token) throw normalizeProtectedSubmitError();
};

export const protectedSubmit = async <T = any>({
  action,
  payload,
  turnstileToken,
}: {
  action: string;
  payload?: Record<string, any>;
  turnstileToken: string;
}): Promise<T> => {
  requireTurnstile(turnstileToken);
  const response = await fetch('/api/submissions/v1/protected', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
    redirect: 'manual',
    body: JSON.stringify({ action, payload, turnstileToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeProtectedSubmitError(response.status, body.error || body.message || '');
  }
  return body as T;
};

export const verifyTurnstileOnly = (turnstileToken: string) => (
  protectedSubmit({ action: 'verify-only', turnstileToken })
);

export const submitCtvRegistration = async (payload: {
  full_name: string;
  student_batch: string;
  major: string;
  contact_info: string;
}) => {
  const response = await fetch('/api/submissions/v1/ctv-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    redirect: 'manual',
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as { id?: unknown; error?: unknown };
  if (!response.ok) {
    const safeMessage = response.status === 409 && typeof body.error === 'string'
      ? body.error
      : response.status === 400 && typeof body.error === 'string'
        ? body.error
        : 'Có lỗi xảy ra. Vui lòng thử lại sau.';
    throw new ProtectedSubmitError(safeMessage, 'unknown', response.status);
  }
  return body as { id?: number };
};
