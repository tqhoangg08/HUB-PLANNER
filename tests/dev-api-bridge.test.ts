import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import {
  devBackendOrigin,
  proxyCloudflareApi,
  rewriteDevSetCookie,
  selectDevApiRoute,
} from '../dev/devApiBridge.ts'

test('local modules win; Cloudflare-owned paths proxy; unknown APIs remain local 404', () => {
  assert.equal(selectDevApiRoute('/api/events', '/repo/api/events.js'), 'local')
  assert.equal(selectDevApiRoute('/api/auth/get-session', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/private/v1/me', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/admin/v1/events', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/events/378/view', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/unknown', null), 'not_found')
  assert.equal(selectDevApiRoute('/api/auth/get-session', '/repo/api/auth/get-session.ts'), 'local')
})

test('backend origin is HTTPS-only and cookie rewrite is scoped to dev bridge', () => {
  assert.equal(devBackendOrigin(undefined), 'https://hotrosinhvienhub.id.vn')
  assert.throws(() => devBackendOrigin('http://example.test'))
  assert.equal(
    rewriteDevSetCookie('hubplanner_auth.session_token=opaque; Domain=hotrosinhvienhub.id.vn; Path=/; Secure; HttpOnly; SameSite=Lax'),
    'hubplanner_auth.session_token=opaque; Path=/; HttpOnly; SameSite=Lax',
  )
  assert.equal(
    rewriteDevSetCookie('__Secure-hubplanner_auth.session_token=opaque; Domain=hotrosinhvienhub.id.vn; Path=/; Secure; HttpOnly; SameSite=Lax'),
    '__Secure-hubplanner_auth.session_token=opaque; Path=/; Secure; HttpOnly; SameSite=Lax',
  )
})

test('proxy preserves method, query, body, auth headers, status and Set-Cookie', async () => {
  const seen: Array<{ method: string; url: string; body: string; origin: string | null; cookie: string | null }> = []
  const upstream = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk.toString()
    seen.push({ method: req.method || '', url: req.url || '', body, origin: req.headers.origin || null, cookie: req.headers.cookie || null })
    res.statusCode = 207
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Set-Cookie', 'hubplanner_auth.session_token=opaque; Domain=example.test; Secure; HttpOnly; SameSite=Lax; Path=/')
    res.end(JSON.stringify({ ok: true }))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const address = upstream.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const bridge = createServer((req, res) => {
    void proxyCloudflareApi(req, res, origin).catch((error) => { res.statusCode = 500; res.end(String(error)) })
  })
  bridge.listen(0, '127.0.0.1')
  await once(bridge, 'listening')
  const bridgeAddress = bridge.address()
  assert.ok(bridgeAddress && typeof bridgeAddress !== 'string')
  try {
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      const result = await fetch(`http://127.0.0.1:${bridgeAddress.port}/api/private/v1/me?marker=1`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: 'session=opaque' },
        body: method === 'GET' ? undefined : JSON.stringify({ method }),
      })
      assert.equal(result.status, 207)
      assert.deepEqual(await result.json(), { ok: true })
      assert.match(result.headers.get('set-cookie') || '', /HttpOnly/)
      assert.doesNotMatch(result.headers.get('set-cookie') || '', /Domain=|Secure/i)
    }
    assert.deepEqual(seen.map((entry) => entry.method), ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
    assert.ok(seen.every((entry) => entry.url === '/api/private/v1/me?marker=1' && entry.cookie === 'session=opaque'))
    assert.equal(seen[2].body, '{"method":"PATCH"}')
  } finally {
    bridge.close()
    upstream.close()
  }
})

test('auth origin is converted only for auth routes, without changing cookie identity', async () => {
  const seen: string[] = []
  const fetchMock: typeof fetch = async (_url, init) => {
    seen.push(new Headers(init?.headers).get('origin') || '')
    return new Response('{}', { status: 200 })
  }
  const server = createServer((req, res) => {
    void proxyCloudflareApi(req, res, 'https://hotrosinhvienhub.id.vn', fetchMock)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const localOrigin = `http://127.0.0.1:${address.port}`
  try {
    for (const route of ['auth/get-session', 'private/v1/me']) {
      const response = await fetch(`${localOrigin}/api/${route}`, {
        headers: { Origin: localOrigin },
      })
      assert.equal(response.status, 200)
    }
    assert.deepEqual(seen, ['https://hotrosinhvienhub.id.vn', localOrigin])
  } finally { server.close() }
})
