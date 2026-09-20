export const AI_DOCUMENT_OCR_MAX_PAGES = 40;
export const AI_DOCUMENT_OCR_MAX_TEXT_BYTES = 1024 * 1024;
const MAX_INSPECT_PAGES = 5;
const MIN_USABLE_TEXT_CHARS = 120;
const MAX_RENDER_DIMENSION = 2048;

export class AiDocumentOcrError extends Error {}

export type AiDocumentOcrResult = {
  text: string;
  pageCount: number;
  ocrUsed: true;
  engine: 'tesseract.js';
};

export const hasUsablePdfText = (samples: string[]) =>
  samples.join(' ').replace(/\s+/g, ' ').trim().length >= MIN_USABLE_TEXT_CHARS;

export const assertPdfOcrPageLimit = (pageCount: number, requiresOcr: boolean) => {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new AiDocumentOcrError('PDF không có trang hợp lệ.');
  }
  if (requiresOcr && pageCount > AI_DOCUMENT_OCR_MAX_PAGES) {
    throw new AiDocumentOcrError(`OCR trên thiết bị hỗ trợ tối đa ${AI_DOCUMENT_OCR_MAX_PAGES} trang.`);
  }
};

const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
};

const safeOcrText = (value: string) => {
  const text = value.replace(/\u0000/g, '').trim();
  if (!text || textByteLength(text) > AI_DOCUMENT_OCR_MAX_TEXT_BYTES) {
    throw new AiDocumentOcrError('Văn bản OCR rỗng hoặc vượt giới hạn 1 MB.');
  }
  return text;
};

export const inspectPdfTextLayer = async (file: File, signal?: AbortSignal) => {
  assertActive(signal);
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    assertPdfOcrPageLimit(pdf.numPages, false);
    const samples: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_INSPECT_PAGES); pageNumber += 1) {
      assertActive(signal);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      samples.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      page.cleanup();
    }
    const hasUsableText = hasUsablePdfText(samples);
    assertPdfOcrPageLimit(pdf.numPages, !hasUsableText);
    return { pageCount: pdf.numPages, hasUsableText };
  } finally {
    await pdf.destroy();
  }
};

export const runPdfOcrInBrowser = async (
  file: File,
  onProgress: (currentPage: number, pageCount: number, percent: number) => void,
  signal?: AbortSignal,
): Promise<AiDocumentOcrResult> => {
  assertActive(signal);
  const [{ getDocument, GlobalWorkerOptions }, workerModule, tesseract] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('tesseract.js'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  let worker: Awaited<ReturnType<typeof tesseract.createWorker>> | null = null;
  try {
    assertPdfOcrPageLimit(pdf.numPages, true);
    worker = await tesseract.createWorker('vie+eng');
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertActive(signal);
      const page = await pdf.getPage(pageNumber);
      const initial = page.getViewport({ scale: 1.5 });
      const scale = Math.min(1.5, MAX_RENDER_DIMENSION / Math.max(initial.width, initial.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new AiDocumentOcrError('Trình duyệt không hỗ trợ canvas OCR.');
      try {
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        assertActive(signal);
        pages.push(result.data.text);
        onProgress(pageNumber, pdf.numPages, Math.round((pageNumber / pdf.numPages) * 100));
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    }
    return { text: safeOcrText(pages.join('\n\n')), pageCount: pdf.numPages, ocrUsed: true, engine: 'tesseract.js' };
  } finally {
    await worker?.terminate();
    await pdf.destroy();
  }
};
