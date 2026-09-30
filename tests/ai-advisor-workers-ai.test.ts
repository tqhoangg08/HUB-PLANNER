import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkersAiEvidenceGenerator,
  DEFAULT_WORKERS_AI_EVIDENCE_MODEL,
  MAX_WORKERS_AI_EVIDENCE_CHUNKS,
  MAX_WORKERS_AI_EVIDENCE_INPUT_CHARS,
  MAX_WORKERS_AI_SUPPORT_SPAN_CHARS,
  WORKERS_AI_EVIDENCE_TOOL,
  WORKERS_AI_EVIDENCE_SEED,
  type WorkersAiBinding,
  type WorkersAiEvidenceRunInput,
} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';

const request = {
  question: 'Câu hỏi công khai?',
  evidence: [
    { sourceId: 'S1', documentId: 'doc-1', snippet: 'Nguồn S1 được máy chủ cho phép.', score: 0.8 },
    { sourceId: 'S2', documentId: 'doc-2', snippet: 'Nguồn S2 được máy chủ cho phép.', score: 0.7 },
  ],
};

const toolCall = (argumentsValue: unknown, name = WORKERS_AI_EVIDENCE_TOOL) => ({
  choices: [{ message: { tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(argumentsValue) } }] } }],
});

const binding = (result: unknown, onRun?: (input: WorkersAiEvidenceRunInput) => void): WorkersAiBinding => ({
  async run(_model, input) { onRun?.(input); return result as { choices?: Array<{ message?: { tool_calls?: unknown } }> }; },
});

test('CASE3 formatting regression: two omitted spaces before plus list markers preserve exact support', async () => {
  // Sanitized structural fixture: no captured production evidence or tool output.
  const snippet = 'Có 3 mức.\n+ Mức A không tự động áp dụng.\n+ Mức B cần xét duyệt.';
  const quote = 'Có 3 mức.+ Mức A không tự động áp dụng.+ Mức B cần xét duyệt.';
  const input = { question: 'Có mấy mức?', evidence: [{ sourceId: 'S1', documentId: 'fixture', snippet, score: 0.5 }] };
  let calls = 0;
  const evaluate = async (text: string, source = 'S1', supported = true) => {
    const generator = createWorkersAiEvidenceGenerator({ AI: binding(toolCall({
      supported, answer: supported ? 'Có 3 mức.' : '', source_ids: supported ? [source] : [],
      support_spans: supported ? [{ source_id: source, quote: text }] : [],
    }), () => { calls++; }) });
    const before = calls;
    const result = await generator.generate(input);
    assert.equal(calls - before, 1);
    return result.supported;
  };
  assert.equal(await evaluate(quote), true);
  for (const invalid of [quote.replace('3', '4'), quote.replace('xét duyệt', 'tự duyệt'),
    quote.replace('không ', ''), 'Nội dung bịa đặt.', '', quote.replace('.+', ';+')]) {
    assert.equal(await evaluate(invalid), false);
  }
  assert.equal(await evaluate(quote, 'S9'), false);
  assert.equal(await evaluate('', 'S1', false), false);
});

test('Workers AI evidence adapter sends bounded authorized evidence and normalizes a supported function call', async () => {
  let input: WorkersAiEvidenceRunInput | undefined;
  const provider = createWorkersAiEvidenceGenerator({
    AI_ADVISOR_V2_GENERATOR_MODEL: DEFAULT_WORKERS_AI_EVIDENCE_MODEL,
    AI: binding(toolCall({ supported: true, answer: 'Được nguồn xác nhận.', source_ids: ['S2'], support_spans: [{ source_id: 'S2', quote: 'Nguồn S2 được máy chủ cho phép.' }] }), (value) => { input = value; }),
  });
  const result = await provider.generate(request);
  assert.deepEqual(result, { supported: true, answer: 'Được nguồn xác nhận.', sourceIds: ['S2'] });
  assert.ok(input);
  assert.equal(input.tool_choice, 'required');
  assert.equal(input.parallel_tool_calls, false);
  assert.equal(input.stream, false);
  assert.equal(input.max_completion_tokens, 300);
  assert.equal(input.temperature, 0);
  assert.equal(input.seed, WORKERS_AI_EVIDENCE_SEED);
  assert.equal(input.tools[0].function.name, WORKERS_AI_EVIDENCE_TOOL);
  const parameters = input.tools[0].function.parameters as { properties: { source_ids: { items: { enum: string[] } }; support_spans: { items: { properties: { quote: { maxLength: number } } } } }; required: string[] };
  assert.deepEqual(parameters.properties.source_ids.items.enum, ['S1', 'S2']);
  assert.equal(parameters.properties.support_spans.items.properties.quote.maxLength, MAX_WORKERS_AI_SUPPORT_SPAN_CHARS);
  assert.ok(parameters.required.includes('support_spans'));
  assert.match(input.messages[0].content, /Absence of information is not evidence/);
  assert.match(input.messages[0].content, /existence or yes-no questions/);
  assert.doesNotMatch(input.messages[1].content, /doc-1/);
});

test('Workers AI evidence adapter abstains for unsupported, malformed, missing, wrong, duplicate, or unknown citations', async () => {
  const cases = [
    toolCall({ supported: false, answer: 'ignored', source_ids: ['S1'] }),
    {},
    { choices: [{ message: { tool_calls: [] } }] },
    toolCall({ supported: true, answer: 'x', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] }, 'wrong_tool'),
    toolCall({ supported: 'true', answer: 'x', source_ids: ['S1'], support_spans: [] }),
    toolCall({ supported: true, answer: '', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] }),
    toolCall({ supported: true, answer: 'x', source_ids: [], support_spans: [] }),
    toolCall({ supported: true, answer: 'x', source_ids: ['S9'], support_spans: [{ source_id: 'S9', quote: 'Nguồn S1' }] }),
    toolCall({ supported: true, answer: 'x', source_ids: ['S1', 'S1'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] }),
  ];
  for (const [index, result] of cases.entries()) {
    const provider = createWorkersAiEvidenceGenerator({ AI: binding(result) });
    assert.deepEqual(await provider.generate(request), {
      supported: false, answer: '', sourceIds: [],
      ...(index >= 5 ? { rejectionReason: 'INVALID_GROUNDING' } : {}),
    });
  }
});

test('Workers AI evidence adapter bounds evidence to S1..S3 and does not send an unauthorized fourth item', async () => {
  let input: WorkersAiEvidenceRunInput | undefined;
  const provider = createWorkersAiEvidenceGenerator({
    AI: binding(toolCall({ supported: true, answer: 'ok', source_ids: ['S3'], support_spans: [{ source_id: 'S3', quote: 'sss' }] }), (value) => { input = value; }),
  });
  await provider.generate({
    question: 'q'.repeat(2_000),
    evidence: [
      ...request.evidence,
      { sourceId: 'S3', documentId: 'doc-3', snippet: 's'.repeat(5_000), score: null },
      { sourceId: 'S4', documentId: 'private-doc', snippet: 'MUST NOT SEND', score: null },
    ],
  });
  assert.ok(input);
  const parameters = input.tools[0].function.parameters as { properties: { source_ids: { items: { enum: string[] } } } };
  assert.equal(parameters.properties.source_ids.items.enum.length, MAX_WORKERS_AI_EVIDENCE_CHUNKS);
  assert.doesNotMatch(input.messages[1].content, /MUST NOT SEND|private-doc/);
  assert.ok(input.messages[1].content.length <= MAX_WORKERS_AI_EVIDENCE_INPUT_CHARS + 160);
});

test('Workers AI evidence sampling uses a stable seed with exactly one invocation and no retry', async () => {
  const inputs: WorkersAiEvidenceRunInput[] = [];
  const provider = createWorkersAiEvidenceGenerator({ AI: binding(toolCall({ supported: false, answer: '', source_ids: [], support_spans: [] }), (input) => inputs.push(input)) });
  for (let i = 0; i < 3; i += 1) {
    const before = inputs.length;
    assert.deepEqual(await provider.generate(request), { supported: false, answer: '', sourceIds: [] });
    assert.equal(inputs.length, before + 1);
  }
  assert.ok(inputs.every((input) => input.temperature === 0 && input.seed === 42 && input.tool_choice === 'required'));
  let failureCalls = 0;
  const failing = createWorkersAiEvidenceGenerator({ AI: { async run() { failureCalls += 1; throw new Error('safe test failure'); } } });
  await assert.rejects(() => failing.generate(request));
  assert.equal(failureCalls, 1);
});

test('Workers AI evidence adapter propagates provider failures and is unconfigured without the binding', async () => {
  const unavailable = createWorkersAiEvidenceGenerator({});
  assert.equal(unavailable.isConfigured({}), false);
  const failing: WorkersAiBinding = { async run() { throw new Error('provider unavailable'); } };
  await assert.rejects(() => createWorkersAiEvidenceGenerator({ AI: failing }).generate(request), /provider unavailable/);
});

test('Workers AI evidence adapter bounds output and turns a timeout into the runtime-safe provider failure', async () => {
  const oversized = 'x'.repeat(4_000);
  const clipped = await createWorkersAiEvidenceGenerator({
    AI: binding(toolCall({ supported: true, answer: oversized, source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] })),
  }).generate(request);
  assert.equal(clipped.answer.length, 1_800);
  const slow: WorkersAiBinding = { async run() { return await new Promise(() => undefined); } };
  await assert.rejects(
    () => createWorkersAiEvidenceGenerator({ AI: slow }, { timeoutMs: 1 }).generate(request),
    /WORKERS_AI_EVIDENCE_TIMEOUT/,
  );
});

test('Workers AI support spans fail closed for absent, unknown, malformed, empty, overlong, or uncited evidence', async () => {
  const valid = { supported: true, answer: 'Có căn cứ.', source_ids: ['S1'] };
  const cases = [
    { ...valid },
    { ...valid, support_spans: [] },
    { ...valid, support_spans: [{ source_id: 'S1', quote: '' }] },
    { ...valid, support_spans: [{ source_id: 'S1', quote: 'Không có trong nguồn.' }] },
    { ...valid, support_spans: [{ source_id: 'S9', quote: 'Nguồn S1' }] },
    { ...valid, support_spans: [{ source_id: 'S1', quote: 'x'.repeat(MAX_WORKERS_AI_SUPPORT_SPAN_CHARS + 1) }] },
    { ...valid, support_spans: [{ source_id: 'S1' }] },
    { ...valid, source_ids: ['S1', 'S2'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] },
    { ...valid, support_spans: [{ source_id: 'S2', quote: 'Nguồn S2' }] },
    { supported: false, answer: 'No', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'Nguồn S1' }] },
  ];
  for (const [index, value] of cases.entries()) {
    const provider = createWorkersAiEvidenceGenerator({ AI: binding(toolCall(value)) });
    assert.deepEqual(await provider.generate(request), {
      supported: false, answer: '', sourceIds: [],
      ...(index < cases.length - 1 ? { rejectionReason: 'INVALID_GROUNDING' } : {}),
    });
  }
});

test('Workers AI support span comparison normalizes NFC and whitespace against the supplied bounded evidence', async () => {
  const evidenceRequest = {
    question: 'Tiếng Việt?',
    evidence: [{ sourceId: 'S1', documentId: 'doc-1', snippet: 'Quy định về tiếng\n   Việt và điểm số.', score: 0.8 }],
  };
  const provider = createWorkersAiEvidenceGenerator({
    AI: binding(toolCall({
      supported: true, answer: 'Có.', source_ids: ['S1'],
      support_spans: [{ source_id: 'S1', quote: 'tiếng Việt'.normalize('NFD') }],
    })),
  });
  assert.deepEqual(await provider.generate(evidenceRequest), { supported: true, answer: 'Có.', sourceIds: ['S1'] });
  const whitespaceProvider = createWorkersAiEvidenceGenerator({
    AI: binding(toolCall({
      supported: true, answer: 'Có.', source_ids: ['S1'],
      support_spans: [{ source_id: 'S1', quote: 'tiếng Việt và điểm số.' }],
    })),
  });
  assert.equal((await whitespaceProvider.generate(evidenceRequest)).supported, true);
});

test('support-first instruction accepts directly grounded temporal facts despite paraphrased question wording', async () => {
  let calls = 0;
  let prompt = '';
  const evidenceRequest = {
    question: 'Cảnh báo học vụ được xem xét vào thời điểm nào?',
    evidence: [{
      sourceId: 'S1', documentId: 'public-regulation', score: 0.46,
      snippet: 'Điều 31. Trường tiến hành xử lý học vụ sau mỗi học kỳ của năm học. Cảnh báo học vụ thực hiện theo từng học kỳ.',
    }],
  };
  const provider = createWorkersAiEvidenceGenerator({ AI: {
    async run(_model, input) {
      calls++;
      prompt = input.messages[0].content;
      return toolCall({
        supported: true,
        answer: 'Cảnh báo học vụ được xem xét theo từng học kỳ, sau mỗi học kỳ của năm học.',
        source_ids: ['S1'],
        support_spans: [{ source_id: 'S1', quote: 'xử lý học vụ sau mỗi học kỳ của năm học' }],
      });
    },
  } });
  assert.deepEqual(await provider.generate(evidenceRequest), {
    supported: true,
    answer: 'Cảnh báo học vụ được xem xét theo từng học kỳ, sau mỗi học kỳ của năm học.',
    sourceIds: ['S1'],
  });
  assert.equal(calls, 1);
  assert.match(prompt, /First identify short exact evidence spans/);
  assert.match(prompt, /even if the question uses different wording/);
  assert.match(prompt, /conclusion must follow directly/);
  assert.match(prompt, /existence or yes-no questions, evidence must explicitly establish/);
});

test('multiple exact spans may jointly support an answer, while an unsupported existence claim abstains in one call', async () => {
  const evidenceRequest = {
    question: 'Khi nào trường xem xét cảnh báo học vụ?',
    evidence: [
      { sourceId: 'S1', documentId: 'public-handbook', score: 0.54, snippet: 'Cảnh báo học vụ được thực hiện sau khi có điểm thi của học kỳ.' },
      { sourceId: 'S2', documentId: 'public-regulation', score: 0.46, snippet: 'Trường tiến hành xử lý học vụ sau mỗi học kỳ của năm học.' },
    ],
  };
  let calls = 0;
  const supported = createWorkersAiEvidenceGenerator({ AI: {
    async run() {
      calls++;
      return toolCall({
        supported: true, answer: 'Sau mỗi học kỳ, khi đã có điểm thi.', source_ids: ['S1', 'S2'],
        support_spans: [
          { source_id: 'S1', quote: 'sau khi có điểm thi của học kỳ' },
          { source_id: 'S2', quote: 'sau mỗi học kỳ của năm học' },
        ],
      });
    },
  } });
  assert.equal((await supported.generate(evidenceRequest)).supported, true);
  assert.equal(calls, 1);
  const unsupported = createWorkersAiEvidenceGenerator({ AI: {
    async run() {
      calls++;
      return toolCall({ supported: false, answer: '', source_ids: [], support_spans: [] });
    },
  } });
  assert.deepEqual(await unsupported.generate({
    question: 'Có học bổng cho sinh viên trên sao Hỏa không?',
    evidence: evidenceRequest.evidence,
  }), { supported: false, answer: '', sourceIds: [] });
  assert.equal(calls, 2);
});

test('Workers AI support quotes do not escape the sent evidence and never appear in logs', async () => {
  let calls = 0;
  let sentInput: WorkersAiEvidenceRunInput | undefined;
  const logs: string[] = [];
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const originals = methods.map((method) => console[method]);
  for (const method of methods) console[method] = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
  try {
    const provider = createWorkersAiEvidenceGenerator({
      AI: {
        async run(_model, input) {
          calls++;
          sentInput = input;
          return toolCall({ supported: true, answer: 'Có.', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'PRIVATE_SENTINEL_AFTER_CLIP' }] });
        },
      },
    });
    const result = await provider.generate({
      question: 'QUESTION_SENTINEL',
      evidence: [{ sourceId: 'S1', documentId: 'USER_SENTINEL', snippet: `${'a'.repeat(1_600)}PRIVATE_SENTINEL_AFTER_CLIP`, score: 1 }],
    });
    assert.deepEqual(result, { supported: false, answer: '', sourceIds: [], rejectionReason: 'INVALID_GROUNDING' });
    assert.equal(calls, 1);
    assert.ok(sentInput);
    assert.doesNotMatch(sentInput.messages[1].content, /PRIVATE_SENTINEL_AFTER_CLIP|USER_SENTINEL/);
    assert.doesNotMatch(logs.join('\n'), /QUESTION_SENTINEL|PRIVATE_SENTINEL_AFTER_CLIP|USER_SENTINEL/);
  } finally {
    methods.forEach((method, index) => { console[method] = originals[index]; });
  }
});
