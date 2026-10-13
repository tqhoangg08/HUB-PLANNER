import type { IncomingMessage, ServerResponse } from 'node:http'

export const DEFAULT_DEV_BACKEND_ORIGIN = 'https://hotrosinhvienhub.id.vn'
export const DEFAULT_DEV_SCHOLARSHIP_BACKEND_ORIGIN = 'http://127.0.0.1:8787'

export function isScholarshipApiPath(pathname: string): boolean {
  return /^\/api\/public\/v1\/scholarships(?:\/|$)/.test(pathname) ||
    /^\/api\/me\/scholarships(?:\/|$)/.test(pathname) ||
    /^\/api\/admin\/v1\/scholarships(?:\/|$)/.test(pathname)
}

export function isCloudflareApiPath(pathname: string): boolean {
  return /^\/api\/(?:auth|private|admin)(?:\/|$)/.test(pathname) ||
    /^\/api\/public\/v1\/scholarships(?:\/|$)/.test(pathname) ||
    /^\/api\/me\/scholarships(?:\/|$)/.test(pathname) ||
    /^\/api\/events\/[^/]+\/view$/.test(pathname)
}

export function selectDevApiRoute(pathname: string, localModule: string | null): 'local' | 'cloudflare' | 'not_found' {
  if (localModule) return 'local'
  return isCloudflareApiPath(pathname) ? 'cloudflare' : 'not_found'
}

export function isSafeDevLoopbackOrigin(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

export function devBackendOrigin(value: string | undefined): string {
  const url = new URL(value || DEFAULT_DEV_BACKEND_ORIGIN)
  const isLoopback = isSafeDevLoopbackOrigin(url)
  if ((url.protocol !== 'https:' && !isLoopback) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DEV_BACKEND_ORIGIN must be an HTTPS origin or local loopback HTTP origin')
  }
  return url.origin
}

export function devScholarshipBackendOrigin(value: string | undefined): string {
  const candidate = value || DEFAULT_DEV_SCHOLARSHIP_BACKEND_ORIGIN
  return devBackendOrigin(candidate)
}

export function resolveDevBackendOrigin(
  pathname: string,
  env: { DEV_BACKEND_ORIGIN?: string; DEV_SCHOLARSHIP_BACKEND_ORIGIN?: string } = process.env,
): string {
  if (isScholarshipApiPath(pathname)) {
    if (env.DEV_SCHOLARSHIP_BACKEND_ORIGIN) {
      return devScholarshipBackendOrigin(env.DEV_SCHOLARSHIP_BACKEND_ORIGIN)
    }
    if (env.DEV_BACKEND_ORIGIN) {
      try {
        const customUrl = new URL(env.DEV_BACKEND_ORIGIN)
        if (isSafeDevLoopbackOrigin(customUrl)) {
          return devBackendOrigin(env.DEV_BACKEND_ORIGIN)
        }
      } catch {
        // Fall back to default scholarship backend origin
      }
    }
    return devScholarshipBackendOrigin(undefined)
  }
  return devBackendOrigin(env.DEV_BACKEND_ORIGIN)
}

export function rewriteDevSetCookie(cookie: string): string {
  // The upstream response is served to localhost by Vite. Keep the cookie
  // host-only. Better Auth's __Secure- cookies must retain Secure; browsers
  // special-case localhost for this attribute. Never strip their prefix.
  const hostOnly = cookie.replace(/;\s*Domain=[^;]*/gi, '')
  if (/^\s*__(?:Secure|Host)-/i.test(hostOnly)) return hostOnly
  return hostOnly.replace(/;\s*Secure(?=;|$)/gi, '')
    .replace(/;\s*SameSite=None(?=;|$)/gi, '; SameSite=Lax')
}

const HOP_HEADERS = new Set([
  'connection', 'content-length', 'host', 'transfer-encoding', 'keep-alive',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade',
])

function requestHeaders(req: IncomingMessage, upstream: URL): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_HEADERS.has(name) || name.startsWith('x-forwarded-') || value === undefined) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }

  // Better Auth's production instance trusts only its production origin.
  // This is a localhost-only reverse proxy: the browser still authenticates
  // using real credentials, Turnstile and server-side session checks.
  if (upstream.pathname === '/api/auth' || upstream.pathname.startsWith('/api/auth/')) {
    const originalOrigin = headers.get('origin')
    const requestHost = req.headers.host || ''
    const isLocalOrigin = (() => {
      if (!originalOrigin) return false
      try {
        const origin = new URL(originalOrigin)
        return origin.protocol === 'http:' && origin.host === requestHost &&
          (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1')
      } catch { return false }
    })()
    if (isLocalOrigin) headers.set('origin', upstream.origin)
    const referer = headers.get('referer')
    if (referer && isLocalOrigin) {
      try {
        const source = new URL(referer)
        headers.set('referer', new URL(`${source.pathname}${source.search}`, upstream.origin).href)
      } catch { headers.delete('referer') }
    }
  }
  return headers
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function proxyCloudflareApi(
  req: IncomingMessage,
  res: ServerResponse,
  backendOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const localUrl = new URL(req.url || '/', 'http://localhost:3000')
  if (!isCloudflareApiPath(localUrl.pathname)) throw new Error('Not a Cloudflare-owned API path')
  const upstream = new URL(`${localUrl.pathname}${localUrl.search}`, backendOrigin)
  const method = req.method || 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
  const response = await fetchImpl(upstream, {
    method,
    headers: requestHeaders(req, upstream),
    body,
    redirect: 'manual',
  })

  res.statusCode = response.status
  for (const [name, value] of response.headers) {
    if (HOP_HEADERS.has(name) || name === 'set-cookie' || name === 'content-encoding') continue
    // fetch may decompress the payload; its upstream content length/encoding
    // cannot safely be reused on the bytes returned below.
    res.setHeader(name, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res.setHeader('Set-Cookie', cookies.map(rewriteDevSetCookie))
  const location = response.headers.get('location')
  if (location) {
    const target = new URL(location, upstream)
    if (target.origin === upstream.origin) {
      res.setHeader('Location', `${localUrl.protocol}//${req.headers.host || 'localhost:3000'}${target.pathname}${target.search}${target.hash}`)
    }
  }
  res.end(Buffer.from(await response.arrayBuffer()))
}
