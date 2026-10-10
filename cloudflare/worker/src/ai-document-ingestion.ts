import {
  NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION,
  OCR_PAGE_MARKDOWN_PIPELINE_VERSION,
  serializeAiDocumentIndexIdentity,
  type AiDocumentIndexIdentity,
  type DerivedIndexSourceKind,
} from './ai-document-index-identity.ts';
import { assessDocumentPageText, normalizeDocumentText } from '../../../shared/ai-document-text-quality.ts';

/**
 * Local-only production contract for pre-search document ingestion.
 *
 * A Worker must receive already-derived page text from a compatible, trusted
 * ingestion executor. It must not attempt Poppler or OCR at query time.
 */
export const PRODUCTION_DERIVED_R2_PREFIX = 'ai-search/text';
export const DERIVED_PART_MAX_BYTES = 3_900_000;

export type NativePageClassification = 'NATIVE_GOOD' | 'OCR_REQUIRED';
export type DocumentIngestionState = 'UPLOADED' | 'EXTRACTING' | 'DERIVED_READY' | 'INDEXING' | 'COMPLETED' | 'FAILED';

export type NativeTextQuality = {
  classification: NativePageClassification;
  reasons: readonly string[];
  replacementCharacterCount: number;
  privateUseCharacterCount: number;
  visibleCharacterCount: number;
};

export type DerivedPage = {
  pageNumber: number;
  /** Text is native or OCR output selected for this individual page. */
  text: string;
  sourceKind: Exclude<DerivedIndexSourceKind, 'legacy'>;
  confidence?: number;
  uncertainTokens?: number;
  layout?: 'lines' | 'columns';
  /** DOCX units have no verified physical pagination. Never label them pages. */
  sourceFormat?: 'docx';
};

export type AuthoritativeDerivedMetadata = {
  documentId: string;
  category: string;
  visibility: 'public' | 'program' | 'admin';
  revision: string;
  active: boolean;
};

export type DerivedPart = {
  partNumber: number;
  pageStart: number;
  pageEnd: number;
  markdown: string;
};

export type PreparedDerivedArtifact = {
  /** Hash supplied by the executor and recomputed by the server before D1/R2 acceptance. */
  declaredSourceContentHash: string;
  markdown: string;
  declaredDerivedContentHash: string;
  sourceKind: Exclude<DerivedIndexSourceKind, 'legacy'>;
  extractionPipelineVersion: string;
};

const encoder = new TextEncoder();
const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Canonical, non-semantic cleanup. It never strips accents or repairs words. */
export const normalizeDerivedText = normalizeDocumentText;

/**
 * Conservative corruption detector. A page with damaged glyph mappings is
 * escalated; ordinary short/English pages are not rewritten or guessed.
 */
export const assessNativePageText = (value: string): NativeTextQuality => {
  return assessDocumentPageText(value);
};

export const planMixedPdfExtraction = (nativePages: readonly { pageNumber: number; text: string }[]) => nativePages
  .map((page) => ({ pageNumber: page.pageNumber, native: assessNativePageText(page.text) }))
  .sort((left, right) => left.pageNumber - right.pageNumber);

const assertPageNumbers = (pages: readonly DerivedPage[]) => {
  let previous = 0;
  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber <= previous) {
      throw new Error('Derived pages must have unique ascending positive page numbers.');
    }
    previous = page.pageNumber;
  }
};

export const renderDerivedPage = (page: DerivedPage) => {
  if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) throw new Error('Invalid page number.');
  const details = `\n<!-- extraction: ${page.sourceKind}${page.confidence === undefined ? '' : `; confidence: ${page.confidence.toFixed(1)}`}; uncertain_tokens: ${page.uncertainTokens || 0} -->\n## ${page.sourceFormat==='docx'?'Đoạn Word':'Trang'} ${page.pageNumber}\n`;
  // Code blocks preserve spatial column gaps; do not infer merged cells.
  const text = page.layout === 'columns' ? `\`\`\`text\n${page.text.normalize('NFC').trim().replace(/\r\n?/g, '\n')}\n\`\`\`` : normalizeDerivedText(page.text);
  return `<!-- ${page.sourceFormat==='docx'?'word_unit':'page'}: ${page.pageNumber} -->\n${details}\n${text}\n`;
};

/** Page order is explicit and canonical; no raw byte splitting is allowed. */
export const assemblePageAwareMarkdown = (pages: readonly DerivedPage[]) => {
  assertPageNumbers(pages);
  return pages.map(renderDerivedPage).join('\n');
};

/** Splits only at page boundaries so every part remains independently traceable. */
export const splitDerivedMarkdownByPage = (pages: readonly DerivedPage[], maxBytes = DERIVED_PART_MAX_BYTES): DerivedPart[] => {
  assertPageNumbers(pages);
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid derived part byte limit.');
  const parts: DerivedPart[] = [];
  let currentPages: DerivedPage[] = [];
  let currentBytes = 0;
  const flush = () => {
    if (!currentPages.length) return;
    parts.push({
      partNumber: parts.length + 1,
      pageStart: currentPages[0].pageNumber,
      pageEnd: currentPages[currentPages.length - 1].pageNumber,
      markdown: assemblePageAwareMarkdown(currentPages),
    });
    currentPages = [];
    currentBytes = 0;
  };
  for (const page of pages) {
    const pageBytes = encoder.encode(renderDerivedPage(page)).byteLength;
    if (pageBytes > maxBytes) throw new Error(`Page ${page.pageNumber} exceeds the derived part limit; split semantically before ingestion.`);
    if (currentPages.length && currentBytes + pageBytes > maxBytes) flush();
    currentPages.push(page);
    currentBytes += pageBytes;
  }
  flush();
  return parts;
};

const safeRevisionSegment = (value: string) => {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 96);
  if (!normalized || normalized.includes('..')) throw new Error('Invalid effective index revision.');
  return normalized;
};

export const buildEffectiveIndexRevision = async (identity: AiDocumentIndexIdentity) => {
  if (!UUID_PATTERN.test(identity.documentId)) throw new Error('Invalid document ID for derived key.');
  if (!SHA_256_PATTERN.test(identity.sourceContentHash) || !SHA_256_PATTERN.test(identity.derivedContentHash)) {
    throw new Error('Source and derived content hashes must be SHA-256 values.');
  }
  const identityHash = await sha256(serializeAiDocumentIndexIdentity(identity));
  return safeRevisionSegment(`v${identity.sourceVersion}-${identityHash.slice(0, 32)}`);
};

export const buildDerivedObjectKey = (documentId: string, effectiveIndexRevision: string, partNumber: number) => {
  if (!UUID_PATTERN.test(documentId)) throw new Error('Invalid document ID for derived key.');
  if (!Number.isInteger(partNumber) || partNumber < 1) throw new Error('Invalid derived part number.');
  return `${PRODUCTION_DERIVED_R2_PREFIX}/${documentId}/${safeRevisionSegment(effectiveIndexRevision)}/part-${String(partNumber).padStart(3, '0')}.md`;
};

/** R2 metadata comes from an authoritative D1 document record, never request form fields. */
export const buildServerDerivedMetadata = (metadata: AuthoritativeDerivedMetadata) => {
  if (!UUID_PATTERN.test(metadata.documentId)) throw new Error('Invalid document ID metadata.');
  if (!metadata.category.trim() || !metadata.revision.trim()) throw new Error('Derived metadata requires category and revision.');
  return {
    document_id: metadata.documentId,
    category: metadata.category.trim(),
    visibility: metadata.visibility,
    revision: metadata.revision.trim(),
    active: metadata.active ? 'true' : 'false',
} as const;
};

/**
 * The executor can be a controlled admin browser or a later async service.
 * This binds its output to the original bytes and rejects mismatched hashes;
 * authority to submit remains server-side admin authorization.
 */
export const verifyPreparedDerivedArtifact = async (
  artifact: PreparedDerivedArtifact,
  authoritativeSourceContentHash: string,
) => {
  if (!SHA_256_PATTERN.test(authoritativeSourceContentHash) || !SHA_256_PATTERN.test(artifact.declaredSourceContentHash)) {
    throw new Error('Invalid source content hash.');
  }
  if (artifact.declaredSourceContentHash.toLowerCase() !== authoritativeSourceContentHash.toLowerCase()) {
    throw new Error('Derived artifact source hash does not match the authoritative original.');
  }
  if (!artifact.extractionPipelineVersion.trim() || !SHA_256_PATTERN.test(artifact.declaredDerivedContentHash)) {
    throw new Error('Invalid derived artifact identity.');
  }
  // Page/layout serialization is already canonical. Collapsing spaces here
  // would erase table column gaps and invalidate the browser's exact hash.
  const markdown = artifact.markdown.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  const actualHash = await sha256(markdown);
  if (actualHash !== artifact.declaredDerivedContentHash.toLowerCase()) {
    throw new Error('Derived artifact hash does not match supplied content.');
  }
  return { markdown, derivedContentHash: actualHash };
};

/** Safe update payload for the additive Stage 4F D1 identity columns. */
export const buildDerivedIdentityPatch = (identity: AiDocumentIndexIdentity) => ({
  derived_source_kind: identity.derivedSourceKind,
  extraction_pipeline_version: identity.extractionPipelineVersion,
  derived_content_hash: identity.derivedContentHash.toLowerCase(),
});

export const toStorageIndexingStatus = (state: DocumentIngestionState) => ({
  UPLOADED: 'uploading',
  EXTRACTING: 'processing',
  DERIVED_READY: 'pending',
  INDEXING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const)[state];

export const buildIngestionRetryKey = async (identity: AiDocumentIndexIdentity) =>
  sha256(`ingestion:${serializeAiDocumentIndexIdentity(identity)}`);

export type DerivedRevisionRecord = {
  documentId: string;
  effectiveIndexRevision: string;
  active: boolean;
  indexingStatus: string;
  deletedAt?: string | null;
};

/** Ambiguous active revisions are rejected rather than silently making both searchable. */
export const selectSingleActiveDerivedRevision = (records: readonly DerivedRevisionRecord[]) => {
  const active = records.filter((record) => record.active && record.indexingStatus === 'completed' && !record.deletedAt);
  if (active.length > 1) throw new Error('More than one active derived revision exists for a document.');
  return active[0] || null;
};

export const isAuthorizedCurrentDerivedDocument = (record: DerivedRevisionRecord | null, allowedDocumentIds: ReadonlySet<string>) =>
  Boolean(record?.active && record.indexingStatus === 'completed' && !record.deletedAt && allowedDocumentIds.has(record.documentId));

export const NATIVE_DERIVED_TEXT_PIPELINE = NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION;
export const OCR_DERIVED_TEXT_PIPELINE = OCR_PAGE_MARKDOWN_PIPELINE_VERSION;

/** No client metadata/storage key is accepted. Admin-produced text is bound
 * to the original file hash and a supported, versioned page contract. */
export const parsePreparedPdfPages = async (raw: unknown, originalHash: string) => {
  if (typeof raw !== 'string' || encoder.encode(raw).length > 2_000_000) throw new Error('Invalid prepared PDF payload.');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid prepared PDF payload.');
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 40) throw new Error('Invalid prepared PDF page count.');
  const pages: DerivedPage[] = input.pages.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid prepared PDF page.');
    const p = entry as Record<string, unknown>;
    if (p.pageNumber !== index+1 || typeof p.text !== 'string' || !p.text.trim() || encoder.encode(p.text).length > 100_000
      || !['native_text','ocr'].includes(String(p.sourceKind)) || !['lines','columns',undefined].includes(p.layout as string | undefined)
      || (p.confidence !== undefined && (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 100))
      || (p.uncertainTokens !== undefined && (!Number.isSafeInteger(p.uncertainTokens) || Number(p.uncertainTokens) < 0 || Number(p.uncertainTokens)>100_000))) throw new Error('Invalid prepared PDF page.');
    return { pageNumber:index+1,text:p.text,sourceKind:p.sourceKind as DerivedPage['sourceKind'],
      ...(p.confidence !== undefined ? {confidence:p.confidence as number}:{}),
      ...(p.uncertainTokens !== undefined ? {uncertainTokens:p.uncertainTokens as number}:{}),
      ...(p.layout !== undefined ? {layout:p.layout as DerivedPage['layout']}:{}), };
  });
  const ocrUsed = pages.some((p)=>p.sourceKind==='ocr');
  const pipeline = ocrUsed ? OCR_DERIVED_TEXT_PIPELINE : NATIVE_DERIVED_TEXT_PIPELINE;
  if (input.pipelineVersion !== pipeline) throw new Error('Unsupported PDF extraction pipeline.');
  const markdown = assemblePageAwareMarkdown(pages).trim();
  if (encoder.encode(markdown).length > 1024*1024) throw new Error('Prepared PDF text limit exceeded.');
  const verified = await verifyPreparedDerivedArtifact({ declaredSourceContentHash:String(input.sourceContentHash || ''),
    declaredDerivedContentHash:String(input.derivedContentHash || ''),markdown,sourceKind:ocrUsed?'ocr':'native_text',extractionPipelineVersion:pipeline },originalHash);
  return {...verified,pages,ocrUsed,pipelineVersion:pipeline,uncertainTokens:pages.reduce((sum,p)=>sum+(p.uncertainTokens || 0),0)};
};

/** Unlike older multi-page parts, these objects contain exactly one page. */
export const buildDerivedPageObjectKey = (documentId:string,revision:string,pageNumber:number) =>
  buildDerivedObjectKey(documentId,revision,pageNumber).replace(/\/part-(\d+)\.md$/,'/page-$1.md');

export type DerivedStorageBucket = {
  put(key:string,body:string,options:{httpMetadata:{contentType:string};customMetadata:Record<string,string>}):Promise<unknown>;
  head(key:string):Promise<{size:number;customMetadata?:Record<string,string>} | null>;
  delete(keys:string[]):Promise<void>;
};
export const storeDerivedPdfPages = async (bucket: DerivedStorageBucket, document: {id:string;content_hash:string;version?:number;category:string;visibility:'public'|'program'|'admin'},
  prepared: Awaited<ReturnType<typeof parsePreparedPdfPages>>) => {
  const revision = await buildEffectiveIndexRevision({documentId:document.id,sourceVersion:document.version || 1,
    sourceContentHash:document.content_hash,indexSourceKind:'ocr_text',derivedSourceKind:prepared.ocrUsed?'ocr':'native_text',
    extractionPipelineVersion:prepared.pipelineVersion,derivedContentHash:prepared.derivedContentHash,indexingStatus:'completed'});
  const metadata = buildServerDerivedMetadata({documentId:document.id,category:document.category,visibility:document.visibility,revision,active:true});
  const keys: string[]=[];
  try {
    for (const page of prepared.pages) {
      const key = buildDerivedPageObjectKey(document.id,revision,page.pageNumber);
      const body = renderDerivedPage(page);
      await bucket.put(key,body,{httpMetadata:{contentType:'text/markdown;charset=utf-8'},customMetadata:metadata});
      keys.push(key);
      const head=await bucket.head(key);
      if (!head || head.size!==encoder.encode(body).length || head.customMetadata?.revision!==revision) throw new Error('Derived PDF storage verification failed.');
    }
  } catch (error) {
    // Newly allocated document/revision only; never a production corpus sweep.
    if (keys.length) await bucket.delete(keys);
    throw error;
  }
  return {revision,keys};
};

/** Readiness means every page of this server-selected revision, not a
 * provider-wide completed count or another document's ready item. */
export const isCompleteDerivedRevision = (document:{id:string;revision:string;pages:number;visibility:string},
  items:readonly {key:string;status?:string;metadata?:Record<string,unknown>}[]) => {
  if(!Number.isInteger(document.pages)||document.pages<1||document.pages>40)return false;
  const ready=new Set(items.filter((item)=>item.status==='completed'&&item.metadata?.document_id===document.id
    &&item.metadata?.revision===document.revision&&item.metadata?.visibility===document.visibility
    &&(item.metadata?.active===true||item.metadata?.active==='true')).map((item)=>item.key));
  return Array.from({length:document.pages},(_,i)=>buildDerivedPageObjectKey(document.id,document.revision,i+1)).every((key)=>ready.has(key));
};
