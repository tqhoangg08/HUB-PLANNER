import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { twoPageTranscriptFixture } from './fixtures/transcript-two-page.ts';

// Exercise the real parseHubPdf orchestration with only PDF decoding and AI I/O stubbed.
const bundle = await build({ entryPoints: ['utils/pdfImport.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
    name: 'transcript-io', setup(build) {
        build.onResolve({ filter: /^pdfjs-dist$|pdf\.worker.*\?url$|\.\/pdfAiApi$/ }, args => ({ path: args.path, namespace: 'test-io' }));
        build.onLoad({ filter: /.*/, namespace: 'test-io' }, args => ({ contents: args.path === 'pdfjs-dist'
            ? 'export const GlobalWorkerOptions = {}; export const getDocument = () => ({ promise: Promise.resolve(globalThis.__transcriptPdf) });'
            : args.path === './pdfAiApi'
            ? 'export const requestPdfAi = async () => { globalThis.__transcriptAiCalls++; return JSON.stringify(globalThis.__transcriptAiResult); };'
            : 'export default "worker-stub";' }));
    },
}] });
const { parseHubPdf } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const run = async (rows = twoPageTranscriptFixture()) => {
    const storage = new Map();
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    globalThis.__transcriptAiCalls = 0;
    globalThis.__transcriptAiResult = { hoc_ky: [{ nam_bat_dau: 2031, nam_ket_thuc: 2032, hoc_ky_so: 1, mon_hoc: Array.from({ length: 11 }, (_, i) => ({ ten_mon: `Môn ${i}`, tin_chi: 3, diem_so: null })) }] };
    const pagesRead = [];
    globalThis.__transcriptPdf = { numPages: 2, destroy: async () => {}, getPage: async page => {
        pagesRead.push(page);
        return { getTextContent: async () => ({ items: rows.filter(r => r.pageNumber === page).flatMap(r => r.items.map(item => ({ str: item.text, width: item.width, transform: [1, 0, 0, 1, item.x, item.y] }))) }) };
    } };
    const result = await parseHubPdf(new File(['fixture'], 'PRIVATE-NAME-DO-NOT-LOG.pdf'), 'test-token');
    return { result, pagesRead, debug: storage.get('hub_last_transcript_import_debug'), aiCalls: globalThis.__transcriptAiCalls };
};

test('PDF import reads all pages directly with no AI request or quota consumption', async () => {
    const { result, pagesRead, debug, aiCalls } = await run();
    assert.deepEqual(pagesRead, [1, 2]);
    assert.equal(result.error, undefined);
    assert.equal(result.integrity.sourceReliable, true);
    assert.equal(result.semesters.length, 5);
    assert.equal(result.semesters.reduce((sum, s) => sum + s.subjects.length, 0), 42);
    assert.equal(aiCalls, 0);
    assert.equal(globalThis.localStorage.getItem('hub_planner_transcript_ai_rate_limit_v2'), null);
    assert.equal(JSON.parse(debug).stage, 'hub-layout-parser-success');
    assert.ok(!debug.includes('PRIVATE-NAME'));
});

test('incomplete native tables stay blocked and are never sent wholesale to AI', async () => {
    const rows = twoPageTranscriptFixture().filter(r => !r.text.includes('DEMO_3_7'));
    const { result, aiCalls, debug } = await run(rows);
    assert.ok(result.error);
    assert.equal(result.integrity.sourceReliable, false);
    assert.equal(aiCalls, 0);
    assert.equal(JSON.parse(debug).stage, 'hub-layout-parser-incomplete');
});

test('unsupported source layouts fail closed locally without spending AI quota', async () => {
    const rows = twoPageTranscriptFixture().filter(r => !r.text.includes('Học kỳ'));
    const { result, aiCalls } = await run(rows);
    assert.equal(aiCalls, 0);
    assert.equal(result.semesters.length, 0);
    assert.ok(result.error);
    assert.equal(result.integrity.sourceReliable, false);
});
