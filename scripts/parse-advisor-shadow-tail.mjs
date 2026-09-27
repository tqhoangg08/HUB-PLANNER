import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const MAX_JSON_VALUE_CHARS = 1_000_000;

const eventNames = new Set([
  'ai_advisor_v2_shadow_dispatch',
  'ai_advisor_v2_shadow_scheduled',
  'ai_advisor_v2_shadow_started',
  'ai_advisor_v2_shadow_skip',
  'ai_advisor_v2_shadow',
]);
const enums = {
  routing_class: new Set(['document', 'sensitive_guard', 'zero_ai', 'non_document']),
  skip_reason: new Set(['SENSITIVE_GUARD', 'ZERO_AI', 'NON_DOCUMENT_INTENT']),
  v2_path: new Set(['document']),
  outcome: new Set([
    'SUPPORTED_VALID_CITATIONS', 'INSUFFICIENT_EVIDENCE', 'NO_AUTHORIZED_DOCUMENTS',
    'QUOTA_ABSTENTION', 'RETRIEVAL_EMPTY', 'RETRIEVAL_ERROR', 'GENERATOR_ERROR',
    'INVALID_CITATIONS', 'V2_INTERNAL_ERROR',
  ]),
  citation_validation: new Set(['pass', 'fail', 'not_applicable']),
  safe_error_class: new Set(['none', 'identity', 'retrieval', 'generation', 'internal', 'scheduling']),
  retrieval_error_stage: new Set(['INSTANCE_RESOLUTION', 'SEARCH_INVOCATION', 'SEARCH_RESPONSE', 'RESPONSE_NORMALIZATION', 'POST_AUTHORIZATION']),
  retrieval_error_name: new Set(['Error', 'TypeError', 'TimeoutError', 'AbortError', 'AI_SEARCH_ERROR', 'UNKNOWN']),
  quota_mode: new Set(['NORMAL', 'ECONOMY', 'CONSERVATIVE', 'SURVIVAL']),
};
const booleans = [
  'zero_ai', 'document_path_eligible', 'search_attempted', 'generator_attempted',
  'generator_supported',
  'retrieval_timeout',
];
const counts = ['search_calls', 'generator_calls', 'retrieved_count', 'authorized_chunk_count', 'retrieval_provider_error_count'];

const safeShadowEvent = (value) => {
  if (!value || !eventNames.has(value.event) || value.mode !== 'shadow') return null;
  const event = { event: value.event, mode: 'shadow' };
  if (typeof value.shadow_trace_id === 'string' && /^[0-9a-f-]{36}$/i.test(value.shadow_trace_id)) {
    event.shadow_trace_id = value.shadow_trace_id;
  }
  for (const [key, allowed] of Object.entries(enums)) {
    if (allowed.has(value[key])) event[key] = value[key];
  }
  if (Number.isSafeInteger(value.retrieval_status) && value.retrieval_status >= 100 && value.retrieval_status <= 599) {
    event.retrieval_status = value.retrieval_status;
  } else if (value.retrieval_status === null) event.retrieval_status = null;
  for (const key of booleans) if (typeof value[key] === 'boolean') event[key] = value[key];
  for (const key of counts) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100) event[key] = value[key];
  }
  if (Number.isSafeInteger(value.duration_ms) && value.duration_ms >= 0 && value.duration_ms <= 30_000) {
    event.duration_ms = value.duration_ms;
  }
  return event;
};

const parseAdvisorShadowTailValue = (envelope) => {
  if (Array.isArray(envelope)) return envelope.flatMap(parseAdvisorShadowTailValue);
  const output = [];
  for (const log of Array.isArray(envelope?.logs) ? envelope.logs : []) {
    for (const message of Array.isArray(log?.message) ? log.message : [log?.message]) {
      let value = message;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { continue; }
      }
      const safe = safeShadowEvent(value);
      if (safe) output.push(safe);
    }
  }
  return output;
};

export const parseAdvisorShadowTailJsonValue = (completeValue) => {
  try { return parseAdvisorShadowTailValue(JSON.parse(completeValue)); }
  catch { return []; }
};

// Wrangler's --format json output is a sequence of JSON values, not NDJSON:
// a single envelope can occupy many lines. Frame complete values before parsing.
export const createAdvisorShadowTailStreamParser = () => {
  let value = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let oversized = false;
  let malformedValues = 0;

  const write = (chunk) => {
    const events = [];
    for (const char of chunk) {
      if (depth === 0) {
        if (char !== '{' && char !== '[') continue;
        value = char;
        depth = 1;
        quoted = false;
        escaped = false;
        oversized = false;
        continue;
      }
      if (!oversized) {
        value += char;
        if (value.length > MAX_JSON_VALUE_CHARS) {
          value = '';
          oversized = true;
        }
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;

      if (depth === 0) {
        if (oversized) malformedValues++;
        else {
          try { events.push(...parseAdvisorShadowTailValue(JSON.parse(value))); }
          catch { malformedValues++; }
        }
        value = '';
        oversized = false;
      }
    }
    return events;
  };

  return {
    write,
    finish: () => ({ incomplete: depth !== 0, malformedValues }),
  };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stdin.setEncoding('utf8');
  const parser = createAdvisorShadowTailStreamParser();
  for await (const chunk of process.stdin) {
    for (const event of parser.write(chunk)) process.stdout.write(`${JSON.stringify(event)}\n`);
  }
  const result = parser.finish();
  if (result.incomplete || result.malformedValues) {
    process.stderr.write(`shadow_tail_parse_status incomplete=${result.incomplete} malformed_values=${result.malformedValues}\n`);
  }
}
