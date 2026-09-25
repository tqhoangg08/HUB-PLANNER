import test from 'node:test';
import assert from 'node:assert/strict';
import { probe, summarize } from '../scripts/diagnose-gemini-advisor.mjs';

test('diagnostic redacts provider echoes of secrets and store paths', async () => {
  const key = 'private-test-credential';
  const store = 'fileSearchStores/private-store';
  const result = await probe({ key, path: 'models/test:generateContent', sensitive: [store],
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: `${key} ${store} high demand` } }), { status: 503 }),
  });
  assert.equal(result.diagnostic.status, 503);
  assert.equal(result.diagnostic.apiErrorStatusText, 'UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(JSON.stringify(result).includes(store), false);
  assert.equal(result.data, undefined);
});

test('deadline covers hanging response body and aborts request', async () => {
  let signal;
  const result = await probe({ key: 'test', path: 'test', timeoutMs: 10,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { json: () => new Promise(() => {}) };
    },
  });
  assert.equal(result.diagnostic.result, 'TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('summary distinguishes successful HTTP search from verified metadata citations', () => {
  const summary = summarize([
    { test: 'plain_generate', keySlot: 'file_search', ok: false },
    { test: 'plain_generate', keySlot: 'chat_1', ok: true },
    { test: 'filtered_file_search', ok: true, matchedCitationCount: 0 },
  ]);
  assert.equal(summary.baselineFailedWithoutDocuments, true);
  assert.equal(summary.anotherKeySucceeded, true);
  assert.equal(summary.groundedSearchSucceeded, false);
});
