type RuntimeEnv = { get(name: string): string | undefined };
type DenoRuntime = { env: RuntimeEnv };

export interface ProfileAuthorityClientOptions {
  url?: string;
  secret?: string;
  fetcher?: typeof fetch;
  now?: number;
  nonce?: string;
}

export type ProfileAuthorityOperation =
  | { writer: 'auth_edge'; operation: 'ensure_student_profile'; userId: string; email: string }
  | { writer: 'auth_edge'; operation: 'delete_profile'; userId: string }
  | { writer: 'auth_edge'; operation: 'resolve_student_identity'; studentCode: string }
  | { writer: 'courses_edge'; operation: 'read_profile_map'; userIds: string[] };

export class ProfileAuthorityClientError extends Error {
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ProfileAuthorityClientError';
    this.status = status;
  }
}

const encoder = new TextEncoder();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const runtimeEnv = () =>
  (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno?.env;

const defaultAuthorityUrl = () => {
  const mirrorUrl = runtimeEnv()?.get('PROFILE_D1_SHADOW_MIRROR_URL') || '';
  try {
    const url = new URL(mirrorUrl);
    url.pathname = '/internal/profile/v1/authority';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return bytesToHex(new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
  ));
};

export const callProfileAuthorityInternal = async <T = { success: true }>(
  operation: ProfileAuthorityOperation,
  overrides: ProfileAuthorityClientOptions = {},
): Promise<T> => {
  const url = overrides.url || defaultAuthorityUrl();
  const secret = overrides.secret || runtimeEnv()?.get('PROFILE_D1_SHADOW_MIRROR_SECRET') || '';
  const nonce = overrides.nonce || crypto.randomUUID();
  if (!url.startsWith('https://') || secret.length < 32 || !UUID_PATTERN.test(nonce)) {
    throw new ProfileAuthorityClientError(503, 'PROFILE_D1_AUTHORITY_CLIENT_UNAVAILABLE');
  }
  const timestamp = String(Math.floor((overrides.now ?? Date.now()) / 1_000));
  const body = JSON.stringify(operation);
  const signature = await hmacHex(secret, `${timestamp}.${nonce}.${body}`);
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await (overrides.fetcher || fetch)(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Hub-Profile-Mirror-Timestamp': timestamp,
          'X-Hub-Profile-Mirror-Nonce': nonce,
          'X-Hub-Profile-Mirror-Signature': signature,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      lastStatus = response.status;
      if (response.ok) return await response.json() as T;
      if (response.status < 500) break;
    } catch {
      lastStatus = 0;
    }
  }
  console.error(JSON.stringify({
    event: 'profile_authority_internal_client_failed',
    writer: operation.writer,
    operation: operation.operation,
    status: lastStatus,
  }));
  throw new ProfileAuthorityClientError(lastStatus || 503, 'PROFILE_D1_AUTHORITY_REQUEST_FAILED');
};
