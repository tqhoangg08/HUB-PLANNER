type RuntimeEnv = {
  get(name: string): string | undefined;
};

type DenoRuntime = {
  env: RuntimeEnv;
};

export interface ProfileShadowMirrorClientOptions {
  enabled?: boolean;
  url?: string;
  secret?: string;
  canaryUserId?: string;
  writePercent?: number | string;
  fetcher?: typeof fetch;
  now?: number;
  nonce?: string;
}

export type ProfileShadowMirrorClientResult =
  | { status: 'disabled' }
  | { status: 'mirrored' }
  | { status: 'failed' };

const encoder = new TextEncoder();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const runtimeEnv = () => {
  const runtime = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return runtime?.env;
};

const readRuntimeOptions = (): ProfileShadowMirrorClientOptions => {
  const env = runtimeEnv();
  return {
    enabled: env?.get('PROFILE_D1_SHADOW_WRITE_ENABLED') === 'true',
    url: env?.get('PROFILE_D1_SHADOW_MIRROR_URL') || '',
    secret: env?.get('PROFILE_D1_SHADOW_MIRROR_SECRET') || '',
    canaryUserId: env?.get('PROFILE_D1_SHADOW_CANARY_USER_ID') || '',
    writePercent: env?.get('PROFILE_D1_SHADOW_WRITE_PERCENT') || '',
  };
};

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
};

export const mirrorProfileShadowAfterSourceWrite = async (
  userId: string,
  writer: 'auth_edge' | 'courses_edge',
  overrides: ProfileShadowMirrorClientOptions = {},
): Promise<ProfileShadowMirrorClientResult> => {
  const options = { ...readRuntimeOptions(), ...overrides };
  if (!options.enabled) return { status: 'disabled' };
  console.log(JSON.stringify({ event: 'profile_shadow_source_write', writer }));
  const normalizedUserId = userId.toLowerCase();
  const normalizedCanaryUserId = String(options.canaryUserId || '').toLowerCase();
  const rawPercent = String(options.writePercent ?? '');
  const percent = rawPercent === '' ? null : Number(rawPercent);
  const validPercent = percent !== null && Number.isInteger(percent) && [0, 1, 5, 25, 100].includes(percent);
  if (percent !== null && !validPercent) return { status: 'disabled' };
  const explicitlyAllowlisted = UUID_PATTERN.test(normalizedCanaryUserId) &&
    normalizedUserId === normalizedCanaryUserId;
  if (!explicitlyAllowlisted && validPercent) {
    const bucket = Number.parseInt(normalizedUserId.replaceAll('-', '').slice(0, 8), 16) % 100;
    if (percent !== 100 && bucket >= percent) return { status: 'disabled' };
  } else if (!explicitlyAllowlisted && !validPercent) {
    return { status: 'disabled' };
  }
  if (
    !UUID_PATTERN.test(normalizedUserId) ||
    !options.url?.startsWith('https://') ||
    !options.secret ||
    options.secret.length < 32
  ) {
    console.error(JSON.stringify({ event: 'profile_shadow_mirror_client_misconfigured' }));
    return { status: 'failed' };
  }

  const timestamp = String(Math.floor((options.now ?? Date.now()) / 1_000));
  const nonce = options.nonce || crypto.randomUUID();
  if (!UUID_PATTERN.test(nonce)) {
    console.error(JSON.stringify({ event: 'profile_shadow_mirror_client_nonce_invalid' }));
    return { status: 'failed' };
  }
  const body = JSON.stringify({ userId: normalizedUserId, writer });
  const signature = await hmacHex(options.secret, `${timestamp}.${nonce}.${body}`);

  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (attempt > 1) console.log(JSON.stringify({ event: 'profile_shadow_mirror_retry', writer, attempt }));
      console.log(JSON.stringify({ event: 'profile_shadow_mirror_attempt', writer, attempt }));
      try {
        const response = await (options.fetcher || fetch)(options.url, {
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
        if (response.ok) {
          console.log(JSON.stringify({ event: 'profile_shadow_mirror_success', writer, attempt }));
          return { status: 'mirrored' };
        }
        console.error(JSON.stringify({ event: 'profile_shadow_mirror_client_failed', writer, attempt, status: response.status }));
        if (response.status < 500) return { status: 'failed' };
      } catch {
        console.error(JSON.stringify({ event: 'profile_shadow_mirror_client_failed', writer, attempt, status: 0 }));
      }
    }
    return { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
};
