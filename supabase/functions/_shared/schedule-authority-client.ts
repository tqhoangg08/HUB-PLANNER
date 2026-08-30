type RuntimeEnv = { get(name: string): string | undefined }
type DenoRuntime = { env: RuntimeEnv }

export type ScheduleAuthorityOperation =
  | { writer: 'auth_edge'; operation: 'delete_user_schedules'; userId: string }
  | { writer: 'courses_edge'; operation: 'authorize_user_schedule_custom_data'; userId: string; scheduleId: string }
  | { writer: 'courses_edge'; operation: 'update_user_schedule_custom_data'; userId: string; scheduleId: string; customData: Record<string, unknown>; idempotencyKey: string }

export interface ScheduleAuthorityClientOptions {
  url?: string
  secret?: string
  fetcher?: typeof fetch
  now?: number
  nonce?: string
}

export class ScheduleAuthorityClientError extends Error {
  readonly status: number

  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

const encoder = new TextEncoder()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const runtimeEnv = () => (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno?.env

const defaultAuthorityUrl = () => {
  const configured = runtimeEnv()?.get('SCHEDULE_D1_INTERNAL_URL') || runtimeEnv()?.get('PROFILE_D1_SHADOW_MIRROR_URL') || ''
  try {
    const url = new URL(configured)
    url.pathname = '/internal/schedules/v1/authority'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

export const callScheduleAuthorityInternal = async <T = { success: true }>(
  operation: ScheduleAuthorityOperation,
  overrides: ScheduleAuthorityClientOptions = {},
): Promise<T> => {
  const url = overrides.url || defaultAuthorityUrl()
  // The existing internal Worker secret is already shared only by trusted
  // service producers. A dedicated schedule secret can supersede it later
  // without changing the authenticated request protocol.
  const secret = overrides.secret || runtimeEnv()?.get('SCHEDULE_D1_INTERNAL_SECRET') || runtimeEnv()?.get('PROFILE_D1_SHADOW_MIRROR_SECRET') || ''
  const nonce = overrides.nonce || crypto.randomUUID()
  if (!url.startsWith('https://') || secret.length < 32 || !UUID_PATTERN.test(nonce)) {
    throw new ScheduleAuthorityClientError(503, 'SCHEDULE_D1_AUTHORITY_CLIENT_UNAVAILABLE')
  }
  const timestamp = String(Math.floor((overrides.now ?? Date.now()) / 1_000))
  const body = JSON.stringify(operation)
  const signature = await hmacHex(secret, `${timestamp}.${nonce}.${body}`)
  let lastStatus = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await (overrides.fetcher || fetch)(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Hub-Schedule-Internal-Timestamp': timestamp,
          'X-Hub-Schedule-Internal-Nonce': nonce,
          'X-Hub-Schedule-Internal-Signature': signature,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      })
      lastStatus = response.status
      if (response.ok) return await response.json() as T
      if (response.status < 500) break
    } catch {
      lastStatus = 0
    }
  }
  console.error(JSON.stringify({
    event: 'schedule_authority_internal_client_failed',
    writer: operation.writer,
    operation: operation.operation,
    status: lastStatus,
  }))
  throw new ScheduleAuthorityClientError(lastStatus || 503, 'SCHEDULE_D1_AUTHORITY_REQUEST_FAILED')
}
