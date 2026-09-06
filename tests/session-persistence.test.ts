import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchBetterAuthSession,
  POST_LOGIN_IDENTITY_MAX_WAIT_SECONDS,
  SessionIdentityUnavailableError,
} from '../utils/privateApi.ts';

test('official null alone confirms expiry; bridge 401 and network errors do not', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(null);
    assert.equal(await fetchBetterAuthSession(), null);
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.credentials, 'include');
      calls++;
      if (String(url) === '/api/auth/get-session') return Response.json({session: {}, user: {id: 'fixture', email: 'fixture@example.invalid'}});
      return new Response(null, {status: 401});
    };
    await assert.rejects(fetchBetterAuthSession());
    assert.equal(calls, 4);
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await assert.rejects(fetchBetterAuthSession());
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(fetchBetterAuthSession());
  } finally { globalThis.fetch = original; }
});

test('concurrent callers share one restore and subsequent restore is fresh', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      return Response.json(String(url) === '/api/auth/get-session'
        ? {session: {}, user: {id: 'fixture', email: 'fixture@example.invalid'}}
        : {userId: 'fixture', email: 'fixture@example.invalid', role: 'auditor'});
    };
    const [a,b] = await Promise.all([fetchBetterAuthSession(), fetchBetterAuthSession()]);
    assert.equal(a?.role, 'auditor');
    assert.equal(a,b);
    assert.equal(calls, 2);
    await fetchBetterAuthSession();
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});

test('a post-login role bridge 401 is retried finitely and never becomes an anonymous session', async () => {
  const original = globalThis.fetch;
  let identityCalls = 0;
  try {
    globalThis.fetch = async (url) => {
      if (String(url) === '/api/auth/get-session') {
        return Response.json({ session: {}, user: { id: 'fixture', email: 'fixture@example.invalid' } });
      }
      identityCalls++;
      return new Response(null, { status: 401 });
    };
    await assert.rejects(
      fetchBetterAuthSession(),
      (error: unknown) =>
        error instanceof SessionIdentityUnavailableError
        && error.session.user.id === 'fixture'
        && error.session.role === 'user',
    );
    assert.equal(identityCalls, 3);
    assert.equal(POST_LOGIN_IDENTITY_MAX_WAIT_SECONDS, 14);
  } finally { globalThis.fetch = original; }
});
