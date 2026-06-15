import { apiUrl } from './api';
import { supabase } from './supabase';

export const requireTurnstile = (token: string) => {
  if (!token) throw new Error('Vui long xac minh ban khong phai robot.');
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
  const { data: { session } } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } } as any;

  const response = await fetch(apiUrl('/auth?resource=protected-submit'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, payload, turnstileToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Xac minh bao mat khong thanh cong.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
};

export const verifyTurnstileOnly = (turnstileToken: string) => (
  protectedSubmit({ action: 'verify-only', turnstileToken })
);
