import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import {
  devBackendOrigin,
  isCloudflareApiPath,
  isScholarshipApiPath,
  proxyCloudflareApi,
  resolveDevBackendOrigin,
  rewriteDevSetCookie,
  selectDevApiRoute,
} from '../dev/devApiBridge.ts'

test('local modules win; Cloudflare-owned paths proxy; unknown APIs remain local 404', () => {
  assert.equal(selectDevApiRoute('/api/events', '/repo/api/events.js'), 'local')
  assert.equal(selectDevApiRoute('/api/auth/get-session', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/private/v1/me', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/user/v1/profile', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/admin/v1/events', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/events/378/view', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/unknown', null), 'not_found')
  assert.equal(selectDevApiRoute('/api/auth/get-session', '/repo/api/auth/get-session.ts'), 'local')
})

test('scholarship APIs are precisely classified as Cloudflare paths and dev routes', () => {
  assert.equal(isScholarshipApiPath('/api/public/v1/scholarships/campaigns'), true)
  assert.equal(isScholarshipApiPath('/api/public/v1/scholarships/synth-slug/recipients'), true)
  assert.equal(isScholarshipApiPath('/api/public/v1/scholarships/synth-slug/search'), true)
  assert.equal(isScholarshipApiPath('/api/me/scholarships'), true)
  assert.equal(isScholarshipApiPath('/api/admin/v1/scholarships/campaigns'), true)
  assert.equal(isScholarshipApiPath('/api/public/unrelated'), false)

  assert.equal(isCloudflareApiPath('/api/public/v1/scholarships/campaigns'), true)
  assert.equal(isCloudflareApiPath('/api/me/scholarships'), true)
  assert.equal(isCloudflareApiPath('/api/public/v1/other'), false)

  assert.equal(selectDevApiRoute('/api/public/v1/scholarships/campaigns', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/me/scholarships', null), 'cloudflare')
  assert.equal(selectDevApiRoute('/api/public/v1/other', null), 'not_found')
})

test('backend origin supports HTTPS and safe local loopback HTTP, rejecting external HTTP', () => {
  assert.equal(devBackendOrigin(undefined), 'https://hotrosinhvienhub.id.vn')
  assert.equal(devBackendOrigin('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
  assert.equal(devBackendOrigin('http://localhost:8787'), 'http://localhost:8787')
  assert.throws(() => devBackendOrigin('http://example.test'))
  assert.throws(() => devBackendOrigin('ftp://127.0.0.1:8787'))

  // Scholarship routes route to local dev backend by default, not undeployed production
  assert.equal(resolveDevBackendOrigin('/api/public/v1/scholarships/campaigns', {}), 'http://127.0.0.1:8787')
  assert.equal(resolveDevBackendOrigin('/api/me/scholarships', {}), 'http://127.0.0.1:8787')
  assert.throws(() => resolveDevBackendOrigin('/api/me/scholarships', { DEV_SCHOLARSHIP_BACKEND_ORIGIN: 'https://hotrosinhvienhub.id.vn' }))
  assert.equal(resolveDevBackendOrigin('/api/me/scholarships', { DEV_BACKEND_ORIGIN: 'https://hotrosinhvienhub.id.vn' }), 'http://127.0.0.1:8787')
  assert.equal(resolveDevBackendOrigin('/api/auth/get-session', {}), 'https://hotrosinhvienhub.id.vn')
  assert.equal(
    resolveDevBackendOrigin('/api/public/v1/scholarships/campaigns', { DEV_SCHOLARSHIP_BACKEND_ORIGIN: 'http://localhost:9999' }),
    'http://localhost:9999',
  )

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

test('Scholarship loopback proxy translates only matching local origins and retains cross-site guards', async () => {
  const seen: Headers[]=[]
  let backend='http://127.0.0.1:8795'
  const bridge=createServer((req,res)=>{ void proxyCloudflareApi(req,res,backend,async (_url,init)=>{
    seen.push(new Headers(init?.headers)); return Response.json({ok:true})
  }) })
  bridge.listen(0,'127.0.0.1'); await once(bridge,'listening')
  const address=bridge.address(); assert.ok(address && typeof address!=='string')
  const origin=`http://127.0.0.1:${address.port}`
  try {
    for (const source of [origin,'https://foreign.example','']) await fetch(origin+'/api/admin/v1/scholarships/campaigns/x',{
      method:'PATCH',headers:{...(source?{Origin:source}:{}),'Sec-Fetch-Site':'cross-site'},body:'{}'})
    assert.equal(seen[0].get('origin'),backend)
    assert.equal(seen[1].get('origin'),'https://foreign.example')
    assert.equal(seen[2].get('origin'),null)
    assert.ok(seen.every(headers=>headers.get('sec-fetch-site')==='cross-site'))
    backend='https://production.example'
    await fetch(origin+'/api/admin/v1/scholarships/campaigns/x',{method:'PATCH',headers:{Origin:origin},body:'{}'})
    assert.equal(seen[3].get('origin'),origin)
  } finally { bridge.close() }
})
