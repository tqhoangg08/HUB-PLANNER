type RuntimeEnv = { get(name: string): string | undefined }
type DenoRuntime = { env: RuntimeEnv }

export type CourseAuthorityOperation =
  | { writer: 'auth_edge'; operation: 'delete_user_course_requests'; userId: string }

export class CourseAuthorityClientError extends Error {
  readonly status: number
  constructor(status: number, code: string) { super(code); this.status = status }
}

const encoder = new TextEncoder()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const runtimeEnv = () => (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno?.env
const hex = (bytes: Uint8Array) => [...bytes].map((part) => part.toString(16).padStart(2, '0')).join('')

const authorityUrl = () => {
  const configured = runtimeEnv()?.get('COURSE_D1_INTERNAL_URL') || ''
  try {
    const url = new URL(configured)
    url.pathname = '/internal/courses/v1/authority'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch { return '' }
}
const sign = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

export const isCourseD1LifecycleEnabled = () => runtimeEnv()?.get('COURSE_D1_LIFECYCLE_ENABLED') === 'true'

export const callCourseAuthorityInternal = async <T = { success: true }>(operation: CourseAuthorityOperation): Promise<T> => {
  const url = authorityUrl()
  const secret = runtimeEnv()?.get('COURSE_D1_INTERNAL_SECRET') || ''
  const nonce = crypto.randomUUID()
  if (!url.startsWith('https://') || secret.length < 32 || !UUID.test(nonce)) {
    throw new CourseAuthorityClientError(503, 'COURSE_D1_AUTHORITY_CLIENT_UNAVAILABLE')
  }
  const timestamp = String(Math.floor(Date.now() / 1_000))
  const body = JSON.stringify(operation)
  const signature = await sign(secret, `${timestamp}.${nonce}.${body}`)
  let lastStatus = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json', 'Content-Type': 'application/json',
          'X-Hub-Course-Internal-Timestamp': timestamp,
          'X-Hub-Course-Internal-Nonce': nonce,
          'X-Hub-Course-Internal-Signature': signature,
        },
        body, redirect: 'manual', signal: AbortSignal.timeout(5_000),
      })
      lastStatus = response.status
      if (response.ok) return await response.json() as T
      if (response.status < 500) break
    } catch { lastStatus = 0 }
  }
  throw new CourseAuthorityClientError(lastStatus || 503, 'COURSE_D1_AUTHORITY_REQUEST_FAILED')
}
