// Local PDF processing only. Outputs stay outside Git; stdout contains counts
// and booleans, never source text, names or provider credentials.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorker } from 'tesseract.js';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { recognizeDocumentPage } from '../utils/aiDocumentPageRecognition.ts';
import { hasFullPageScan } from '../utils/aiDocumentOcr.ts';
import { assessDocumentPageText } from '../shared/ai-document-text-quality.ts';
import { assemblePageAwareMarkdown } from '../cloudflare/worker/src/ai-document-ingestion.ts';
import { OCR_PAGE_MARKDOWN_PIPELINE_VERSION, NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION } from '../cloudflare/worker/src/ai-document-index-identity.ts';

const arg = (name) => process.argv[process.argv.indexOf(name)+1];
const insideRepo = (path) => { const r = relative(process.cwd(),path); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
async function main() {
  if (process.argv.includes('--help')) { console.log('Local only: --pdf <path> --output-dir <outside-repo path>. Max40pages/20MB. No provider/index/data mutation.'); return; }
  if (!process.argv.includes('--pdf') || !process.argv.includes('--output-dir')) throw Error('ARGUMENT_REQUIRED');
  const input = resolve(arg('--pdf')), output = resolve(arg('--output-dir'));
  if (insideRepo(input) || insideRepo(output)) throw Error('PDF_AND_ARTIFACTS_MUST_STAY_OUTSIDE_GIT');
  const source = await readFile(input);
  if (source.length > 20*1024*1024 || !source.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('INVALID_PDF');
  await mkdir(output,{recursive:true});
  const pdf = await getDocument({ data:new Uint8Array(source), useSystemFonts:true, verbosity:0 }).promise;
  let worker;
  const pages = [];
  try {
    if (pdf.numPages > 40) throw Error('PAGE_LIMIT');
    for (let n=1;n<=pdf.numPages;n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const native = content.items.map((item) => item.str || '').join(' ');
      const unit = page.getViewport({scale:1});
      const ops = await page.getOperatorList();
      const scan = hasFullPageScan(ops,[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject], OPS.transform,OPS.save,OPS.restore,unit.width*unit.height);
      const quality = assessDocumentPageText(native,scan);
      if (quality.classification === 'OCR_REQUIRED') {
        worker ||= await createWorker('vie+eng',1,{cachePath:output, errorHandler:()=>{}});
        const viewport = page.getViewport({scale:Math.min(3,3200/Math.max(unit.width,unit.height))});
        const canvas = createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        const serialized = await recognizeDocumentPage(worker,canvas,canvas.toBuffer('image/png'),(bounds,scale=1)=>{
          const crop=createCanvas(Math.ceil(bounds.width*scale),Math.ceil(bounds.height*scale));
          crop.getContext('2d').drawImage(canvas,bounds.left,bounds.top,bounds.width,bounds.height,0,0,crop.width,crop.height);
          return crop.toBuffer('image/png');
        });
        if (!serialized.text.trim()) throw Error('EMPTY_OCR_PAGE');
        pages.push({pageNumber:n, text:serialized.text,sourceKind:'ocr',layout:serialized.tableCells?'lines':'columns',confidence:serialized.confidence,uncertainTokens:serialized.uncertainTokens});
        // Raw OCR kept local for visual comparison only, never uploaded.
        await writeFile(resolve(output,`page-${n}-local-review.json`),JSON.stringify({text:serialized.text,confidence:serialized.confidence,tableCells:serialized.tableCells}));
      } else pages.push({pageNumber:n,text:native,sourceKind:'native_text'});
      console.log(JSON.stringify({phase:'page',page:n,sourceKind:pages.at(-1).sourceKind,nativeCharacters:native.length,
        reasons:quality.reasons,confidence:pages.at(-1).confidence,uncertainTokens:pages.at(-1).uncertainTokens || 0}));
      page.cleanup();
    }
    const markdown=assemblePageAwareMarkdown(pages).trim();
    if (Buffer.byteLength(markdown)>1024*1024) throw Error('TEXT_LIMIT');
    const sha=(v)=>createHash('sha256').update(v).digest('hex');
    const ocrUsed=pages.some((p)=>p.sourceKind==='ocr');
    const artifact={pages,markdown,sourceContentHash:sha(source),derivedContentHash:sha(markdown),
      pipelineVersion:ocrUsed?OCR_PAGE_MARKDOWN_PIPELINE_VERSION:NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION,ocrUsed};
    await writeFile(resolve(output,'prepared-artifact.json'),JSON.stringify(artifact));
    await writeFile(resolve(output,'derived.md'),markdown);
    const plain=pages.map((p)=>p.text).join('\n').normalize('NFC').replace(/\s+/g,' ');
    console.log(JSON.stringify({phase:'summary',pages:pages.length,ocrPages:pages.filter((p)=>p.sourceKind==='ocr').length,
      textBytes:Buffer.byteLength(markdown),uncertainTokens:pages.reduce((n,p)=>n+(p.uncertainTokens||0),0),
      scale100:/thang điểm 100/i.test(plain),fiveGroups:/năm|5/.test(plain)&&/25/.test(plain)&&/20/.test(plain)&&/15/.test(plain),
      miniGame:/mini game.*không được tính điểm rèn luyện/i.test(plain),outsideEvidence:/ngoài trường.*minh chứng.*xác nhận/i.test(plain)}));
  } finally {await worker?.terminate();await pdf.destroy();}
}
main().catch((error)=>{console.log(JSON.stringify({result:'LOCAL_PDF_PREPARATION_FAILED',errorClass:error.name,
  reason:/canvas|image|Image|argument|Expected|Invalid|length|size|stack/.test(error.message) ? error.message.replace(/[A-Z]:[\\/][^ ]+/gi,'[LOCAL_PATH]').slice(0,200) : 'PROCESSING_FAILED',
  frames:String(error.stack).split('\n').slice(1,4).map((line)=>line.replace(/\([^)]*\)/g,'[LOCATION]'))}));process.exitCode=1;});
