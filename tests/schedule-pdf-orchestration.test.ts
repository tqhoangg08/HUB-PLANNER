import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';

// Stub decoding and AI transport only: exercise the production parser-first orchestration.
const bundled = await build({ entryPoints: ['utils/schedulePdfImport.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
  name: 'pdf-transport-fixture', setup(builder) {
    builder.onResolve({ filter: /^pdfjs-dist$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
    builder.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: 'worker', namespace: 'fixture' }));
    builder.onResolve({ filter: /pdfAiApi$/ }, () => ({ path: 'ai', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'worker' ? 'export default "fixture-worker";'
      : args.path === 'ai' ? 'export async function requestPdfAi() { const s=globalThis.__schedulePdfState; s.aiCalls++; return JSON.stringify(s.aiResult); }'
      : `export const GlobalWorkerOptions = {};
         export function getDocument() { const pages=globalThis.__schedulePdfState.pages; return {promise:Promise.resolve({numPages:pages.length,getPage:async n=>({getViewport:()=>pages[n-1],getTextContent:async()=>({items:pages[n-1].items.map(i=>({str:i.text,transform:[1,0,0,1,i.x,i.y],width:i.width,height:i.height}))})})})}; }`, loader: 'js' }));
  },
}] });
const { parseSchedulePdf } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const pages = JSON.parse(readFileSync('tests/fixtures/hub-schedule-11.layout.json', 'utf8'));

test('reliable HUB layout returns eleven courses without calling AI or consuming quota', async () => {
  const storage = new Map<string, string>();
  const oldStorage = globalThis.localStorage;
  (globalThis as any).localStorage = { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) };
  (globalThis as any).__schedulePdfState = { pages, aiCalls: 0 };
  try {
    const result = await parseSchedulePdf(new File(['fixture bytes'], 'anonymous.pdf'), 'test-token');
    assert.equal(result.parser, 'hub-layout');
    assert.equal(result.courses.length, 11);
    assert.equal((globalThis as any).__schedulePdfState.aiCalls, 0);
    assert.equal(storage.has('hub_planner_rate_limit'), false);
  } finally { (globalThis as any).localStorage = oldStorage; delete (globalThis as any).__schedulePdfState; }
});

test('unreliable direct parser invokes AI fallback once and keeps its extracted data', async () => {
  const storage = new Map<string, string>();
  const oldStorage = globalThis.localStorage;
  (globalThis as any).localStorage = { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) };
  const unreliable = structuredClone(pages);
  unreliable[0].items = unreliable[0].items.filter((i: any) => !i.text.includes('THỜI KHÓA'));
  const courses = [{ course_code: 'TEST101_261_D01', subject_name: 'Anonymous', credits: 2 }];
  (globalThis as any).__schedulePdfState = { pages: unreliable, aiCalls: 0, aiResult: { semester: 'HK1_2026_2027', courses } };
  try {
    const result = await parseSchedulePdf(new File(['fixture bytes'], 'anonymous.pdf'), 'test-token');
    assert.equal(result.parser, 'ai-fallback');
    assert.deepEqual(result.courses, courses);
    assert.equal((globalThis as any).__schedulePdfState.aiCalls, 1);
    assert.equal(JSON.parse(storage.get('hub_planner_rate_limit')!).count, 1);
  } finally { (globalThis as any).localStorage = oldStorage; delete (globalThis as any).__schedulePdfState; }
});
