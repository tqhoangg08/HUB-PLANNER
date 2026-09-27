import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createAdvisorShadowTailStreamParser,
  parseAdvisorShadowTailJsonValue,
} from '../scripts/parse-advisor-shadow-tail.mjs';

const trace = '11111111-2222-4333-8444-555555555555';
const envelope = (logs, url = 'https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor') => JSON.stringify({
  outcome: 'ok',
  event: { request: { method: 'POST', url } },
  logs: logs.map((message) => ({ level: 'info', message: [message] })),
});

test('shadow tail parser recognizes only the four lifecycle names', () => {
  const names = [
    'ai_advisor_v2_shadow_dispatch', 'ai_advisor_v2_shadow_scheduled',
    'ai_advisor_v2_shadow_started', 'ai_advisor_v2_shadow',
  ];
  const events = parseAdvisorShadowTailJsonValue(envelope(names.map((event) => JSON.stringify({
    event, mode: 'shadow', shadow_trace_id: trace, routing_class: 'document',
    search_calls: 1, generator_calls: 1,
  }))));
  assert.deepEqual(events.map((event) => event.event), names);
  assert.ok(events.every((event) => event.shadow_trace_id === trace));
});

test('shadow tail parser recognizes skip and drops all content-bearing fields', () => {
  const events = parseAdvisorShadowTailJsonValue(envelope([
    JSON.stringify({
      event: 'ai_advisor_v2_shadow_skip', mode: 'shadow', shadow_trace_id: trace,
      routing_class: 'zero_ai', skip_reason: 'ZERO_AI', zero_ai: true,
      question: 'PRIVATE_QUESTION', answer: 'PRIVATE_ANSWER', evidence: 'PRIVATE_EVIDENCE',
      user_id: 'PRIVATE_USER', storage_path: 'PRIVATE_R2_PATH', token: 'PRIVATE_TOKEN',
    }),
    'PRIVATE_UNRELATED_LOG',
  ], 'https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor?secret=PRIVATE_QUERY'));
  assert.equal(events.length, 1);
  assert.equal(events[0].skip_reason, 'ZERO_AI');
  const printed = JSON.stringify(events);
  for (const secret of ['PRIVATE_QUESTION', 'PRIVATE_ANSWER', 'PRIVATE_EVIDENCE', 'PRIVATE_USER', 'PRIVATE_R2_PATH', 'PRIVATE_TOKEN', 'PRIVATE_QUERY']) {
    assert.ok(!printed.includes(secret));
  }
});

test('shadow tail parser accepts object console arguments and rejects unrelated or malformed envelopes', () => {
  const objectMessage = JSON.stringify({
    event: { request: { method: 'GET', url: 'https://hotrosinhvienhub.id.vn/' } },
    logs: [{ message: [{ event: 'ai_advisor_v2_shadow', mode: 'shadow', shadow_trace_id: trace, outcome: 'RETRIEVAL_EMPTY', search_calls: 1 }] }],
  });
  assert.deepEqual(parseAdvisorShadowTailJsonValue(objectMessage).map((event) => event.event), ['ai_advisor_v2_shadow']);
  assert.deepEqual(parseAdvisorShadowTailJsonValue('{broken'), []);
  assert.deepEqual(parseAdvisorShadowTailJsonValue(envelope(['not JSON'], 'https://hotrosinhvienhub.id.vn/other')), []);
});

test('shadow tail parser retains only bounded retrieval diagnostics', () => {
  const source = envelope([JSON.stringify({
    event: 'ai_advisor_v2_shadow', mode: 'shadow', shadow_trace_id: trace,
    safe_error_class: 'retrieval', retrieval_error_stage: 'SEARCH_INVOCATION',
    retrieval_error_name: 'TypeError', retrieval_status: 503,
    retrieval_provider_error_count: 1, retrieval_timeout: false,
    message: 'PRIVATE_PROVIDER_MESSAGE', stack: 'PRIVATE_STACK',
    question: 'PRIVATE_QUERY', evidence: 'PRIVATE_EVIDENCE', user_id: 'PRIVATE_USER',
  })]);
  const [parsed] = parseAdvisorShadowTailJsonValue(source);
  assert.equal(parsed.retrieval_error_stage, 'SEARCH_INVOCATION');
  assert.equal(parsed.retrieval_error_name, 'TypeError');
  assert.equal(parsed.retrieval_status, 503);
  assert.equal(parsed.retrieval_provider_error_count, 1);
  assert.equal(parsed.retrieval_timeout, false);
  for (const secret of ['PRIVATE_PROVIDER_MESSAGE', 'PRIVATE_STACK', 'PRIVATE_QUERY', 'PRIVATE_EVIDENCE', 'PRIVATE_USER']) {
    assert.equal(JSON.stringify(parsed).includes(secret), false);
  }
  const [invalid] = parseAdvisorShadowTailJsonValue(envelope([JSON.stringify({
    event: 'ai_advisor_v2_shadow', mode: 'shadow', retrieval_error_stage: 'PRIVATE_STAGE',
    retrieval_error_name: 'PRIVATE_NAME', retrieval_status: 999,
  })]));
  assert.equal('retrieval_error_stage' in invalid, false);
  assert.equal('retrieval_error_name' in invalid, false);
  assert.equal('retrieval_status' in invalid, false);
});

const parseChunks = (...chunks) => {
  const parser = createAdvisorShadowTailStreamParser();
  const events = chunks.flatMap((chunk) => parser.write(chunk));
  return { events, status: parser.finish() };
};

test('stream parser frames single-line, multiline, and whitespace-separated Wrangler objects', () => {
  const dispatch = envelope([JSON.stringify({ event: 'ai_advisor_v2_shadow_dispatch', mode: 'shadow', shadow_trace_id: trace })]);
  const scheduled = envelope([JSON.stringify({ event: 'ai_advisor_v2_shadow_scheduled', mode: 'shadow', shadow_trace_id: trace })]);
  const multiline = JSON.stringify(JSON.parse(dispatch), null, 2);
  const input = ` \n\t${dispatch}\r\n\n${multiline}\n \t${JSON.stringify(JSON.parse(scheduled), null, 2)}  `;
  const { events, status } = parseChunks(input.slice(0, 17), input.slice(17, 100), input.slice(100));
  assert.deepEqual(events.map((event) => event.event), [
    'ai_advisor_v2_shadow_dispatch',
    'ai_advisor_v2_shadow_dispatch',
    'ai_advisor_v2_shadow_scheduled',
  ]);
  assert.deepEqual(status, { incomplete: false, malformedValues: 0 });
});

test('stream parser respects braces, escaped quotes, and backslashes inside JSON strings', () => {
  const event = JSON.stringify({
    event: 'ai_advisor_v2_shadow_started', mode: 'shadow', shadow_trace_id: trace,
    question: 'PRIVATE { nested } \\" escaped \\ path',
  });
  const source = envelope([event]);
  const { events, status } = parseChunks(...Array.from(source));
  assert.deepEqual(events.map((item) => item.event), ['ai_advisor_v2_shadow_started']);
  assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  assert.deepEqual(status, { incomplete: false, malformedValues: 0 });
});

test('stream parser safely classifies malformed complete and incomplete trailing JSON', () => {
  const valid = envelope([JSON.stringify({ event: 'ai_advisor_v2_shadow', mode: 'shadow', outcome: 'RETRIEVAL_EMPTY' })]);
  const { events, status } = parseChunks('{"logs":[],"bad":}', valid, '{"logs":[');
  assert.deepEqual(events.map((item) => item.event), ['ai_advisor_v2_shadow']);
  assert.deepEqual(status, { incomplete: true, malformedValues: 1 });
});

test('stream parser handles all lifecycle events, skip, and object console messages', () => {
  const names = [
    'ai_advisor_v2_shadow_dispatch', 'ai_advisor_v2_shadow_scheduled',
    'ai_advisor_v2_shadow_started', 'ai_advisor_v2_shadow',
    'ai_advisor_v2_shadow_skip',
  ];
  const messages = names.map((event) => ({
    event, mode: 'shadow', shadow_trace_id: trace,
    ...(event.endsWith('skip') ? { routing_class: 'non_document', skip_reason: 'NON_DOCUMENT_INTENT' } : {}),
  }));
  const source = JSON.stringify({
    event: { request: { method: 'GET', url: 'https://example.invalid/' } },
    logs: [{ message: [...messages, 'unrelated console log'] }],
  }, null, 2);
  assert.deepEqual(parseChunks(source).events.map((item) => item.event), names);
});

test('sanitized retained-Wrangler-structure fixture parses through the CLI without leaking envelope data', () => {
  const fixture = readFileSync(new URL('./fixtures/ai-advisor-shadow-tail-sanitized.jsonseq', import.meta.url), 'utf8');
  const parser = createAdvisorShadowTailStreamParser();
  const events = parser.write(fixture);
  assert.deepEqual(events.map((item) => item.event), ['ai_advisor_v2_shadow_skip']);
  assert.equal(events[0].skip_reason, 'NON_DOCUMENT_INTENT');
  assert.deepEqual(parser.finish(), { incomplete: false, malformedValues: 0 });
  const printed = JSON.stringify(events);
  assert.equal(printed.includes('DO_NOT_EMIT'), false);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/parse-advisor-shadow-tail.mjs', import.meta.url))], {
    input: fixture, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').map((line) => JSON.parse(line).event), events.map((item) => item.event));
  assert.equal(result.stdout.includes('DO_NOT_EMIT'), false);
});
