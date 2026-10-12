/** Local-only comparison. No network provider calls, credentials or production data. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import * as current from '../cloudflare/worker/src/ai-advisor.ts';
import { groundGeminiReply } from '../cloudflare/worker/src/gemini-file-search.ts';

const base = process.argv[2] || '059f73364d257fdf15b8878b8160e7c94bfc5a75';
if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Pass an explicit base commit SHA');
const root = process.cwd();
const temporary = mkdtempSync(path.join(os.tmpdir(), 'hub-advisor-benchmark-'));
const bundlePath = path.join(temporary, 'baseline.mjs');
const require = createRequire(import.meta.url);
const show = (file) => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' });
const silence = console.warn;
try {
  await build({
    entryPoints: ['cloudflare/worker/src/ai-advisor.ts'], bundle: true, platform: 'node', format: 'esm', outfile: bundlePath,
    plugins: [{ name: 'committed-baseline', setup(bundler) {
      bundler.onResolve({ filter: /^[^./]/ }, (args) => args.path.startsWith('node:')
        ? { path: args.path, external: true } : { path: pathToFileURL(require.resolve(args.path)).href, external: true });
      bundler.onLoad({ filter: /\.(?:ts|tsx)$/ }, (args) => ({
        contents: show(path.relative(root, args.path).replaceAll('\\', '/')), loader: args.path.endsWith('tsx') ? 'tsx' : 'ts',
      }));
    } }],
  });
  const baseline = await import(pathToFileURL(bundlePath).href);
  const results = [];
  console.warn = () => {};
  for (const [name, implementation] of [['before', baseline], ['after', current]]) {
    const sql = new DatabaseSync(':memory:');
    for (const migration of ['0032_ai_documents_chat_d1_r2_authority', '0043_ai_chat_conversations', '0044_ai_document_ocr_ingestion', '0045_ai_document_public_view_policy', '0049_ai_document_derived_index_identity']) sql.exec(readFileSync(`cloudflare/migrations/${migration}.sql`, 'utf8'));
    const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userId = '11111111-1111-4111-8111-111111111111';
    const passage = 'Đánh giá kết quả rèn luyện sinh viên. Điều 1: Bảng tiêu chí ĐRL (fixture).';
    sql.prepare(`INSERT INTO ai_documents (id,title,original_file_name,storage_path,mime_type,file_size,content_hash,category,visibility,indexing_status,uploaded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(documentId, 'Quy chế ĐRL fixture', 'fixture.pdf', 'ai-documents/fixture/fixture.pdf', 'application/pdf', 100, 'a'.repeat(64), 'discipline', 'public', 'completed', userId, '2026-01-01', '2026-01-01');
    const DB = { prepare(query) {
      let bindings = [];
      const stmt = { bind(...values) { bindings = values; return stmt; },
        async all() { return { results: sql.prepare(query).all(...bindings) }; },
        async first() { return sql.prepare(query).get(...bindings) || null; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...bindings).changes) } }; },
      }; return stmt;
    } };
    let generalCalls = 0; let documentCalls = 0; const durations = [];
    const question = 'Bạn có bảng điẻm rèn luyện mới nhất không?';
    const env = { DB, AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: '7',
      AUTH_SERVICE: { async fetch() { return Response.json({ userId, role: 'user', email: 'fixture@example.test' }); } },
      GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'fixture', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/fixture',
      fileSearchAnswer: async () => { documentCalls++; const source = { documentId, fileName: 'fixture.pdf', title: 'fixture', pageNumber: 2, evidenceText: passage }; return groundGeminiReply(passage, question, [source]); },
      advisorProviders: { generalGeneration: { id: 'fixture', isConfigured: () => true, async generate() { generalCalls++; return { reply: 'Lịch luyện tập thứ Hai đến thứ Sáu (model stub).', lastStatus: 200 }; } } },
    };
    let reply;
    for (let n = 0; n < 30; n++) {
      const request = new Request('https://fixture.test/api/private/v1/ai-advisor', { method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const start = performance.now();
      reply = await implementation.handleAiAdvisor(request, new URL(request.url), env);
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    results.push({ phase: name, intent: implementation.classifyAdvisorIntents(question), executions: 30,
      general_calls_per_execution: generalCalls / 30, document_calls_per_execution: documentCalls / 30,
      p50_ms: Number(durations[15].toFixed(2)), p95_ms: Number(durations[28].toFixed(2)),
      unrelated_schedule_exposed: reply.reply.includes('thứ Hai'), source_count: reply.documentSources?.length || 0,
    });
    sql.close();
  }
  console.log(JSON.stringify({ benchmark: 'local_mock_not_production_latency_or_quality', base_commit: base, results }, null, 2));
} finally {
  console.warn = silence;
  try { unlinkSync(bundlePath); } catch { /* build failed before artifact existed */ }
  rmdirSync(temporary);
}
