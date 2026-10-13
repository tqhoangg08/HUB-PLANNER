import { assessDocumentPageText } from '../shared/ai-document-text-quality.ts';
import { recognizeDocumentPage } from './aiDocumentPageRecognition.ts';
import { assemblePageAwareMarkdown, type DerivedPage } from '../cloudflare/worker/src/ai-document-ingestion.ts';
import { OCR_PAGE_MARKDOWN_PIPELINE_VERSION, NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION } from '../cloudflare/worker/src/ai-document-index-identity.ts';
import {AI_DOCUMENT_MAX_SEGMENTS,AI_DOCUMENT_MAX_TEXT_BYTES,AI_DOCUMENT_OCR_BATCH_PAGES,AI_DOCUMENT_OCR_PAGE_TIMEOUT_MS,AI_DOCUMENT_OCR_INIT_TIMEOUT_MS} from '../shared/ai-document-limits.ts';

export const AI_DOCUMENT_OCR_MAX_PAGES = AI_DOCUMENT_MAX_SEGMENTS;
export const AI_DOCUMENT_OCR_MAX_TEXT_BYTES = AI_DOCUMENT_MAX_TEXT_BYTES;
const MAX_RENDER_DIMENSION = 3200;
export class AiDocumentOcrError extends Error {}
export const isPdfDocument = (file:Pick<File,'name'|'type'>) => file.type==='application/pdf'||/\.pdf$/i.test(file.name);
export type AiDocumentOcrResult = {
  text: string; pageCount: number; ocrUsed: boolean; engine: 'tesseract.js' | 'pdfjs';
  pages: DerivedPage[]; sourceContentHash: string; derivedContentHash: string;
  pipelineVersion: string; uncertainTokens: number;
};
export const hasUsablePdfText = (samples: string[]) => samples.length > 0
  && samples.every((text) => assessDocumentPageText(text).classification === 'NATIVE_GOOD');
export const assertPdfOcrPageLimit = (pageCount: number, requiresOcr: boolean) => {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new AiDocumentOcrError('PDF không có trang hợp lệ.');
  if (pageCount > AI_DOCUMENT_OCR_MAX_PAGES) throw new AiDocumentOcrError(`Bộ đọc PDF phân trang hỗ trợ tối đa ${AI_DOCUMENT_OCR_MAX_PAGES} trang (giới hạn một revision).`);
};
const assertActive = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError'); };
/** Handles slow asset initialization as well as recognition: late workers are
 * terminated, never attached to a cancelled/timed-out document revision. */
export const initializeOcrWorker = async <T extends {terminate():Promise<unknown>}>(create:()=>Promise<T>,signal?:AbortSignal,timeoutMs=AI_DOCUMENT_OCR_INIT_TIMEOUT_MS):Promise<T>=>{
  assertActive(signal);let finished=false,timer:ReturnType<typeof setTimeout>|undefined;
  let abort:()=>void=()=>{};
  const pending=create().then(async worker=>{if(finished||signal?.aborted){await worker.terminate();throw new DOMException('OCR cancelled','AbortError');}return worker;});
  try{return await Promise.race([pending,new Promise<never>((_,reject)=>{
    abort=()=>reject(new DOMException('OCR cancelled','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>reject(new AiDocumentOcrError('Không tải được bộ OCR trong thời gian cho phép. Chưa tải tài liệu.')),timeoutMs);
  })]);}finally{finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
};
const loadPdf = async (file: File) => {
  const [{ getDocument, GlobalWorkerOptions, OPS }, worker] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  return { pdf: await getDocument({ data: await file.arrayBuffer() }).promise, OPS };
};
// Image paint operates on a unit square transformed by the graphics CTM.
export const hasFullPageScan = (ops: { fnArray: number[]; argsArray: unknown[][] }, imageOps: number[], transformOp: number, saveOp: number, restoreOp: number, pageArea: number) => {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const op = ops.fnArray[i];
    if (op === saveOp) stack.push([...matrix]);
    else if (op === restoreOp) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (op === transformOp) {
      const [a, b, c, d, e, f] = ops.argsArray[i] as number[];
      const [m, n, o, p, q, r] = matrix;
      matrix = [m*a+o*b, n*a+p*b, m*c+o*d, n*c+p*d, m*e+o*f+q, n*e+p*f+r];
    } else if (imageOps.includes(op) && Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]) / pageArea > 0.5) return true;
  }
  return false;
};
export const inspectPdfTextLayer = async (file: File, signal?: AbortSignal) => {
  assertActive(signal);
  const { pdf, OPS } = await loadPdf(file);
  try {
    assertPdfOcrPageLimit(pdf.numPages, true);
    const pages: Array<{ pageNumber: number; text: string; requiresOcr: boolean }> = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      assertActive(signal);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '', lastX = 0, lastY: number | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const [,,,,x,y] = item.transform;
        if (lastY !== undefined && Math.abs(y-lastY) > Math.max(2, item.height*0.5)) text += '\n';
        else if (x-lastX > item.height*1.5) text += '    ';
        else if (text && !text.endsWith('\n')) text += ' ';
        text += item.str;
        if (item.hasEOL) text += '\n';
        lastX = x+item.width; lastY = y;
      }
      const viewport = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const scanned = hasFullPageScan(ops, [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject], OPS.transform, OPS.save, OPS.restore, viewport.width*viewport.height);
      pages.push({ pageNumber:n, text, requiresOcr:assessDocumentPageText(text, scanned).classification === 'OCR_REQUIRED' });
      page.cleanup();
    }
    assertPdfOcrPageLimit(pdf.numPages, pages.some((page) => page.requiresOcr));
    return { pageCount:pdf.numPages, sourceContentHash:await hash(await file.arrayBuffer()), hasUsableText:pages.every((page) => !page.requiresOcr), pages };
  } finally { await pdf.destroy(); }
};
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2,'0')).join('');
export const runPdfOcrInBrowser = async (file: File, onProgress: (current: number, total: number, percent: number) => void,
  signal?: AbortSignal, inspection?: Awaited<ReturnType<typeof inspectPdfTextLayer>>): Promise<AiDocumentOcrResult> => {
  const plan = inspection || await inspectPdfTextLayer(file, signal);
  assertActive(signal);
  const { pdf } = await loadPdf(file);
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined;
  const cancel = () => { void worker?.terminate().catch(() => {}); };
  try {
    assertPdfOcrPageLimit(pdf.numPages, true);
    if(plan.pageCount!==pdf.numPages||plan.pages.length!==pdf.numPages||plan.pages.some((p,i)=>p.pageNumber!==i+1)
      ||plan.sourceContentHash!==await hash(await file.arrayBuffer()))throw new AiDocumentOcrError('Kế hoạch phân trang không khớp PDF gốc.');
    const pages: DerivedPage[] = [];
    let ocrInBatch=0,textBytes=0;
    signal?.addEventListener('abort',cancel,{once:true});
    for (const planned of plan.pages) {
      assertActive(signal);
      if (!planned.requiresOcr) pages.push({ pageNumber:planned.pageNumber, text:planned.text, sourceKind:'native_text', layout:'columns' });
      else {
        // Sequential OCR, one canvas, worker recycled every eight OCR pages.
        // A stalled page cancels the worker and rejects the whole revision.
        if(!worker){const tesseract=await import('tesseract.js');worker=await initializeOcrWorker(()=>tesseract.createWorker('vie+eng'),signal);assertActive(signal);}
        const page = await pdf.getPage(planned.pageNumber);
        const original = page.getViewport({ scale:1 });
        const viewport = page.getViewport({ scale:Math.min(3, MAX_RENDER_DIMENSION/Math.max(original.width,original.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha:false });
        if (!context) throw new AiDocumentOcrError('Trình duyệt không hỗ trợ canvas OCR.');
        try {
          await page.render({ canvasContext:context, viewport }).promise;
          const recognizing = recognizeDocumentPage(worker!,canvas,canvas,(bounds,scale=1)=>{
            const crop=document.createElement('canvas');crop.width=Math.ceil(bounds.width*scale);crop.height=Math.ceil(bounds.height*scale);
            const ctx=crop.getContext('2d',{alpha:false});if(!ctx)throw new AiDocumentOcrError('Không thể đọc ô bảng.');
            ctx.drawImage(canvas,bounds.left,bounds.top,bounds.width,bounds.height,0,0,crop.width,crop.height);return crop;
          });
          let timer:ReturnType<typeof setTimeout>|undefined;
          const serialized=await Promise.race([recognizing,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
            cancel();reject(new AiDocumentOcrError(`Trang ${planned.pageNumber} vượt thời gian OCR; chưa tải tài liệu. Cần kiểm tra lại.`));
          },AI_DOCUMENT_OCR_PAGE_TIMEOUT_MS);})]).finally(()=>clearTimeout(timer));
          assertActive(signal);
          if (!serialized.text.trim()) throw new AiDocumentOcrError(`Không đọc được trang ${planned.pageNumber}. Cần kiểm tra bản gốc.`);
          pages.push({ pageNumber:planned.pageNumber, text:serialized.text, sourceKind:'ocr', layout:serialized.tableCells ? 'lines':'columns', confidence:serialized.confidence, uncertainTokens:serialized.uncertainTokens });
        } finally { canvas.width=1; canvas.height=1; page.cleanup(); }
        if(++ocrInBatch===AI_DOCUMENT_OCR_BATCH_PAGES){await worker.terminate();worker=undefined;ocrInBatch=0;}
      }
      textBytes+=new TextEncoder().encode(pages.at(-1)!.text).length;
      if(textBytes>AI_DOCUMENT_OCR_MAX_TEXT_BYTES)throw new AiDocumentOcrError('Văn bản phân trang vượt giới hạn 1 MB; chưa tải tài liệu.');
      await new Promise<void>(resolve=>setTimeout(resolve,0)); // yield for cancellation/UI between pages
      onProgress(planned.pageNumber, pdf.numPages, Math.round(planned.pageNumber/pdf.numPages*100));
    }
    const text = assemblePageAwareMarkdown(pages).trim();
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > AI_DOCUMENT_OCR_MAX_TEXT_BYTES) throw new AiDocumentOcrError('Văn bản phân trang vượt giới hạn 1 MB.');
    const ocrUsed = pages.some((p) => p.sourceKind === 'ocr');
    return { text, pages, pageCount:pdf.numPages, ocrUsed, engine:ocrUsed ? 'tesseract.js' : 'pdfjs',
      sourceContentHash:await hash(await file.arrayBuffer()), derivedContentHash:await hash(bytes.buffer),
      pipelineVersion:ocrUsed ? OCR_PAGE_MARKDOWN_PIPELINE_VERSION : NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION,
      uncertainTokens:pages.reduce((n,p) => n+(p.uncertainTokens || 0),0) };
  } catch (error) { assertActive(signal); throw error; }
  finally { signal?.removeEventListener('abort',cancel); await worker?.terminate().catch(() => {}); await pdf.destroy(); }
};
