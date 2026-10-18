import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Historical exporter before stamp removal. Compare real PDF text AND positions,
// so changing grades, filtering, pagination or signature placement fails this test.
const baselineRef = 'f24eb4714c5fec8b2c6ed2cbdbdd6996e5a7a789';
const notice = 'Bản xuất từ HUB Planner để tham khảo, không phải bảng điểm chứng thực của Nhà trường.';
const outputDir = resolve('.cache/transcript-pdf-tests');
mkdirSync(outputDir, { recursive: true });

async function loadExporter(source, name) {
  const outfile = resolve(outputDir, `${name}.mjs`);
  const bundled = await build({
    stdin: { contents: source, resolveDir: resolve('utils'), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    external: ['jspdf', 'jspdf-autotable'],
  });
  writeFileSync(outfile, bundled.outputFiles[0].contents);
  return (await import(pathToFileURL(outfile).href)).exportTranscriptToPdf;
}

function fixture() {
  return {
    studentName: 'Nguyễn Thị Ánh (dữ liệu kiểm thử)', studentCode: 'TEST000001',
    cohort: 'K50', programName: '', majorName: 'Tài chính - Ngân hàng',
    specializationName: 'Tài chính', totalCreditsRequired: 150,
    targetGPA: 3.6, hasOnboarded: true,
    semesters: ['Học kỳ 1 Năm học 2024-2025', 'Học kỳ 2 Năm học 2024-2025', 'Học kỳ 1 Năm học 2025-2026'].map((name, s) => ({
      id: `semester-${s}`, name, trainingScore: 85,
      subjects: Array.from({ length: 16 }, (_, i) => {
        const score = i === 0 ? 3 : i === 1 ? 9 : 8.5;
        return {
          id: `${s}-${i}`, name: `${['Kinh tế lượng', 'Giáo dục thể chất', 'Kế toán tài chính', 'Quản trị ngân hàng'][i % 4]} ${s + 1}.${i + 1}`,
          credits: i === 1 ? 2 : 3, isNonGPA: i === 1,
          scoreCC: score, scoreProcess: score, scoreMid: score,
          scoreFinal: i === 2 ? null : score,
        };
      }),
    })),
  };
}

async function inspectPdf(bytes) {
  // PDF.js transfers its buffer to a worker; keep the original for the artifact.
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: false });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(content.items.filter(item => item.str?.trim()).map(item => ({
        text: item.str, transform: item.transform, width: item.width, height: item.height,
      })));
    }
    return { pages, metadata: (await doc.getMetadata()).info };
  } finally {
    await doc.destroy();
  }
}

test('real full/year transcript PDFs remove only stamp artwork and retain academic content, Vietnamese glyphs and layout', async t => {
  const beforeSource = execFileSync('git', ['show', `${baselineRef}:utils/pdfExport.ts`], { encoding: 'utf8', maxBuffer: 2_000_000 });
  const before = await loadExporter(beforeSource, 'before');
  const after = await loadExporter(readFileSync('utils/pdfExport.ts', 'utf8'), 'after');
  const originals = { fetch: globalThis.fetch, FileReader: globalThis.FileReader, alert: globalThis.alert, save: jsPDF.API.save };
  const downloads = [], alerts = [], requests = [];
  globalThis.fetch = async url => {
    requests.push(String(url));
    assert.match(String(url), /^\/fonts\/times(?:bd|i)?\.ttf$/);
    return new Response(readFileSync(resolve('public', String(url).slice(1))), { headers: { 'Content-Type': 'font/ttf' } });
  };
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend();
      }).catch(error => this.onerror(error));
    }
  };
  globalThis.alert = message => alerts.push(message);
  jsPDF.API.save = function (name) {
    downloads.push({ name, bytes: this.output('arraybuffer') });
    return this;
  };
  try {
    for (const scope of ['full', 'year']) {
      await t.test(scope, async () => {
        const data = fixture();
        // Invalid semester is deliberately present; it must remain excluded.
        data.semesters.push({ id: 'invalid', name: 'Bản nháp', trainingScore: null, subjects: [{ ...data.semesters[0].subjects[0], name: 'KHÔNG XUẤT', scoreFinal: 10 }] });
        const snapshot = structuredClone(data);
        const options = scope === 'full' ? { scope } : {
          scope, academicYearLabel: 'Năm học 2024-2025', semesters: data.semesters.slice(0, 2),
        };
        const start = downloads.length;
        await before(data, options);
        await after(data, options);
        assert.equal(downloads.length, start + 2);
        const [oldPdf, newPdf] = downloads.slice(start);
        assert.equal(newPdf.name, oldPdf.name, 'download filename must not change');
        assert.ok(newPdf.name.endsWith(scope === 'full' ? '_Bang_Diem_Toan_Khoa.pdf' : '_Bang_Diem_2024_2025.pdf'));
        const oldText = Buffer.from(oldPdf.bytes).toString('latin1');
        const newText = Buffer.from(newPdf.bytes).toString('latin1');
        assert.match(oldText, /\/Subtype \/Image/, 'baseline contains actual stamp images');
        assert.doesNotMatch(newText, /\/Subtype \/Image/, 'no stamp image is embedded in the exported PDF');
        const oldDoc = await inspectPdf(oldPdf.bytes), newDoc = await inspectPdf(newPdf.bytes);
        assert.ok(newDoc.pages.length > 1, 'exercise multi-page pagination');
        assert.equal(newDoc.pages.length, oldDoc.pages.length);
        for (let p = 0; p < newDoc.pages.length; p++) {
          const notices = newDoc.pages[p].filter(item => item.text === notice);
          assert.equal(notices.length, 1, `reference-only notice appears on page ${p + 1}`);
          for (const item of newDoc.pages[p].filter(item => item.text !== notice)) {
            const footer = notices[0];
            const horizontalOverlap = item.transform[4] < footer.transform[4] + footer.width && footer.transform[4] < item.transform[4] + item.width;
            const verticalOverlap = item.transform[5] < footer.transform[5] + footer.height && footer.transform[5] < item.transform[5] + item.height;
            assert.ok(!(horizontalOverlap && verticalOverlap), `notice must not overlap existing text on page ${p + 1}`);
          }
          assert.deepEqual(newDoc.pages[p].filter(item => item.text !== notice), oldDoc.pages[p], 'every existing text item and coordinate must remain unchanged');
        }
        const text = newDoc.pages.flat().map(item => item.text).join('\n');
        for (const expected of ['HUB PLANNER', 'Nguyễn Thị Ánh', 'Kinh tế lượng', 'NGƯỜI SÁNG LẬP', 'HỆ THỐNG HỖ TRỢ SINH VIÊN', 'Trần Quốc Hoàng', 'Điểm trung bình (hệ 4): 3.20', 'Điểm trung bình (hệ 10): 8.10', 'Rớt', 'Đậu', '(*)']) {
          assert.ok(text.includes(expected), `PDF must preserve ${expected}`);
        }
        assert.doesNotMatch(text, /KHÔNG XUẤT|\uFFFD/);
        assert.ok(text.includes(scope === 'full' ? 'Số tín chỉ tích lũy: 117/150' : 'Số tín chỉ đạt trong năm: 78/84'));
        assert.equal(text.includes('Học kỳ 1 Năm học 2025-2026'), scope === 'full');
        assert.equal(newDoc.metadata.Creator, 'HUB Planner');
        assert.equal(newDoc.metadata.Author, 'HUB Planner');
        assert.deepEqual(data, snapshot, 'export must never mutate student data');
        writeFileSync(resolve(outputDir, `${scope}-before.pdf`), new Uint8Array(oldPdf.bytes));
        writeFileSync(resolve(outputDir, `${scope}-after.pdf`), new Uint8Array(newPdf.bytes));
      });
    }
    await t.test('empty data does not download a PDF', async () => {
      const start = downloads.length;
      await after({ ...fixture(), semesters: [] });
      assert.equal(downloads.length, start);
      assert.match(alerts.pop(), /Chưa có dữ liệu học kỳ/);
    });
    await t.test('font failures cancel export rather than produce broken Vietnamese', async () => {
      const start = downloads.length;
      globalThis.fetch = async () => new Response(null, { status: 404 });
      await after(fixture());
      assert.equal(downloads.length, start);
      assert.match(alerts.pop(), /Không thể nạp font chữ/);
    });
    assert.deepEqual(alerts, []);
    assert.ok(requests.length >= 12);
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.FileReader = originals.FileReader;
    globalThis.alert = originals.alert;
    if (originals.save === undefined) delete jsPDF.API.save;
    else jsPDF.API.save = originals.save;
  }
});
