/** Human-controlled PR88 staging only. Production entrypoint never imports this. */
import {requireBetterAuthSession, type BetterAuthIdentityEnv} from '../better-auth-identity.ts';
import {buildDerivedPageObjectKey, buildEffectiveIndexRevision, buildServerDerivedMetadata, isCompleteDerivedRevision} from '../ai-document-ingestion.ts';

export type ReviewEnv = BetterAuthIdentityEnv & {
  DB:D1Database; AI_DOCUMENTS_BUCKET:R2Bucket; STAGING_ORIGIN:string;
  /** Separate owner approval required to enable promotion; absent = disabled. */
  STAGING_OCR_PROMOTION_ENABLED?:string;
};
type Document = {id:string;title:string;content_hash:string;storage_path:string;version:number;
  ai_search_revision:string;ocr_page_count:number;category:string;visibility:'public'|'program'|'admin';
  derived_content_hash:string;extraction_pipeline_version:string;derived_source_kind:string;indexing_status:string};
export type ReviewPage = {pageNumber:number;text:string};
type Review = {id:string;document_id:string;source_hash:string;base_revision:string;base_version:number;
  baseline_json:string;pages_json:string;draft_hash:string;sequence:number;state:string;
  approved_by:string|null;approved_at:string|null;new_revision:string|null;derived_hash:string|null};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PIPELINE='admin-reviewed-page-markdown-v1';
const enc=new TextEncoder();
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
class ReviewError extends Error {status:number;constructor(code:string,status=409){super(code);this.status=status;}}
export const reviewSha = async (value:string|ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');

export function extractReviewPage(markdown:string,pageNumber:number):ReviewPage {
  if(!markdown.startsWith(`<!-- page: ${pageNumber} -->`))throw new ReviewError('PAGE_IDENTITY_MISMATCH');
  const match=markdown.match(/## Trang \d+\n\n([\s\S]*?)\n$/);
  if(!match)throw new ReviewError('PAGE_FORMAT_UNSUPPORTED');
  const text=match[1].replace(/^(`{3,})text\n([\s\S]*)\n\1$/,'$2');
  return {pageNumber,text};
}
export function validateReviewPages(input:unknown,count:number):ReviewPage[] {
  if(!Array.isArray(input)||input.length!==count||count<1||count>40)throw new ReviewError('PAGE_COUNT_MISMATCH',400);
  const pages=input.map((p:unknown,i)=>{
    if(!p||typeof p!=='object')throw new ReviewError('INVALID_PAGE',400);
    const value=p as Record<string,unknown>;
    if(Object.keys(value).some(k=>!['pageNumber','text'].includes(k))||value.pageNumber!==i+1||typeof value.text!=='string'
      ||!value.text.trim()||enc.encode(value.text).length>100_000||/[\u0000]/.test(value.text))throw new ReviewError('INVALID_PAGE',400);
    return {pageNumber:i+1,text:value.text.normalize('NFC').replace(/\r\n?/g,'\n')};
  });
  if(enc.encode(JSON.stringify(pages)).length>1_000_000)throw new ReviewError('TEXT_LIMIT',413);
  return pages;
}
export function reviewedBodies(review:Pick<Review,'id'|'source_hash'|'base_revision'|'baseline_json'|'pages_json'>) {
  const baseline=JSON.parse(review.baseline_json) as string[];
  const pages=validateReviewPages(JSON.parse(review.pages_json),baseline.length);
  return pages.map(p=>{
    if(p.text===extractReviewPage(baseline[p.pageNumber-1],p.pageNumber).text)return baseline[p.pageNumber-1];
    // Text is a literal source, not HTML or instructions. Page location is retained.
    const runs:string[]=Array.from(p.text.match(/`+/g)||[]);
    const fence='`'.repeat(runs.reduce<number>((max,s)=>Math.max(max,s.length+1),3));
    const markdown=`<!-- page: ${p.pageNumber} -->\n\n<!-- extraction: admin_reviewed; review_id: ${review.id}; source_hash: ${review.source_hash}; base_revision: ${review.base_revision} -->\n## Trang ${p.pageNumber}\n\n${fence}text\n${p.text}\n${fence}\n`;
    // Do not produce a corrected page the existing bounded runtime cannot hydrate.
    if(markdown.length>8000||enc.encode(markdown).length>32000)throw new ReviewError('REVIEWED_PAGE_RUNTIME_LIMIT',400);
    return markdown;
  });
}
async function body(request:Request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ReviewError('JSON_REQUIRED',415);
  const reader=request.body?.getReader();if(!reader)throw new ReviewError('BODY_REQUIRED',400);
  const parts:Uint8Array[]=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;
    if(bytes>1_100_000){await reader.cancel();throw new ReviewError('BODY_LIMIT',413);}parts.push(value);}
  const joined=new Uint8Array(bytes);let i=0;for(const p of parts){joined.set(p,i);i+=p.length;}
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(joined));}catch{throw new ReviewError('INVALID_JSON',400);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ReviewError('INVALID_JSON',400);
  return value as Record<string,unknown>;
}
function keys(input:Record<string,unknown>,allowed:string[]) {
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw new ReviewError('UNSUPPORTED_FIELDS',400);
}
async function document(env:ReviewEnv,id:string) {
  if(!UUID.test(id))throw new ReviewError('INVALID_DOCUMENT',400);
  const d=await env.DB.prepare("SELECT * FROM ai_documents WHERE id=? AND deleted_at IS NULL AND mime_type='application/pdf' AND ai_search_status='completed'").bind(id).first<Document>();
  if(!d||!d.ai_search_revision||d.ocr_page_count<1||d.ocr_page_count>40)throw new ReviewError('SOURCE_NOT_READY');
  return d;
}
async function original(env:ReviewEnv,d:Document) {
  const object=await env.AI_DOCUMENTS_BUCKET.get(d.storage_path);
  if(!object||object.size>20*1024*1024||await reviewSha(await object.arrayBuffer())!==d.content_hash)throw new ReviewError('SOURCE_HASH_MISMATCH');
}
async function verifyBasePages(env:ReviewEnv,d:Document,r:Review) {
  const baseline=JSON.parse(r.baseline_json) as string[];
  if(baseline.length!==d.ocr_page_count)throw new ReviewError('BASE_PAGE_COUNT_CHANGED');
  for(let n=1;n<=baseline.length;n++){
    const o=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(d.id,r.base_revision,n));
    if(!o||o.size>120_000||await reviewSha(await o.text())!==await reviewSha(baseline[n-1]))throw new ReviewError('BASE_PAGE_CHANGED');
  }
}
function safeReview(r:Review) {
  return {id:r.id,sourceHash:r.source_hash,baseRevision:r.base_revision,sequence:r.sequence,state:r.state,
    draftHash:r.draft_hash,newRevision:r.new_revision,pages:JSON.parse(r.pages_json),
    approved:r.approved_at!==null,approvedAt:r.approved_at};
}
async function readiness(instance:AiSearchInstance,r:Review,d:Document) {
  if(!r.new_revision)return {allPagesReady:false,completedPages:0,pages:d.ocr_page_count};
  const listing=await instance.items.list({per_page:50,metadata_filter:JSON.stringify({document_id:d.id,revision:r.new_revision})});
  const allPagesReady=isCompleteDerivedRevision({id:d.id,revision:r.new_revision,pages:d.ocr_page_count,visibility:d.visibility},listing.result);
  const canonical=new Set(Array.from({length:d.ocr_page_count},(_,i)=>buildDerivedPageObjectKey(d.id,r.new_revision!,i+1)));
  const completedPages=new Set(listing.result.filter(p=>p.status==='completed'&&canonical.has(p.key)
    &&p.metadata?.document_id===d.id&&p.metadata?.revision===r.new_revision&&p.metadata?.visibility===d.visibility
    &&(p.metadata?.active===true||p.metadata?.active==='true')).map(p=>p.key)).size;
  return {allPagesReady,completedPages,pages:d.ocr_page_count};
}

export async function handleStagingOcrReview(request:Request,env:ReviewEnv,instance:AiSearchInstance):Promise<Response> {
  try {
    // Defense in depth: no production hostname can use even accidentally imported handler.
    const url=new URL(request.url);
    if(url.origin!==env.STAGING_ORIGIN||!/^https:\/\/hub-advisor-pr88-app-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.origin))throw new ReviewError('STAGING_ONLY',403);
    const identity=await requireBetterAuthSession(request,env);
    if(identity.role!=='admin')throw new ReviewError('ADMIN_REQUIRED',403);
    if(request.method!=='GET'&&request.method!=='POST')throw new ReviewError('METHOD_NOT_ALLOWED',405);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)throw new ReviewError('SAME_ORIGIN_REQUIRED',403);
    const d=await document(env,url.searchParams.get('document')||'');
    if(request.method==='GET'&&url.searchParams.get('file')==='original') {
      const pdf=await env.AI_DOCUMENTS_BUCKET.get(d.storage_path);if(!pdf)throw new ReviewError('SOURCE_MISSING');
      return new Response(pdf.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline','Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"frame-ancestors 'self'",'Referrer-Policy':'no-referrer'}});
    }
    if(request.method==='GET'&&!url.searchParams.has('review')) {
      const pages:ReviewPage[]=[];
      for(let n=1;n<=d.ocr_page_count;n++){
        const o=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(d.id,d.ai_search_revision,n));
        if(!o||o.size>120_000)throw new ReviewError('BASE_PAGE_MISSING');
        pages.push(extractReviewPage(await o.text(),n));
      }
      const {results}=await env.DB.prepare('SELECT id,state,updated_at FROM staging_ocr_reviews WHERE document_id=? ORDER BY updated_at DESC LIMIT 20').bind(d.id).all();
      return json({document:{id:d.id,title:d.title,sourceHash:d.content_hash,baseRevision:d.ai_search_revision},pages,reviews:results,promotionEnabled:env.STAGING_OCR_PROMOTION_ENABLED==='true'});
    }
    const input=request.method==='POST'?await body(request):{};
    const action=request.method==='GET'?'read':input.action;
    if(action==='create') {
      keys(input,['action','sourceHash','baseRevision']);
      if(input.sourceHash!==d.content_hash||input.baseRevision!==d.ai_search_revision)throw new ReviewError('STALE_SOURCE');
      await original(env,d);
      const baseline:string[]=[];
      for(let n=1;n<=d.ocr_page_count;n++){
        const o=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(d.id,d.ai_search_revision,n));
        if(!o||o.size>120_000)throw new ReviewError('BASE_PAGE_MISSING');baseline.push(await o.text());
      }
      const pages=validateReviewPages(baseline.map((md,i)=>extractReviewPage(md,i+1)),d.ocr_page_count),pagesJson=JSON.stringify(pages);
      if(enc.encode(JSON.stringify(baseline)).length>1_000_000)throw new ReviewError('BASE_TEXT_LIMIT',413);
      const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO staging_ocr_reviews(id,document_id,source_hash,base_revision,base_version,baseline_json,pages_json,draft_hash,created_by,updated_by,updated_at)
        SELECT ?,id,content_hash,ai_search_revision,version,?,?,?,?,?,? FROM ai_documents WHERE id=? AND content_hash=? AND ai_search_revision=? AND version=? AND deleted_at IS NULL`)
        .bind(id,JSON.stringify(baseline),pagesJson,await reviewSha(pagesJson),identity.userId,identity.userId,new Date().toISOString(),d.id,d.content_hash,d.ai_search_revision,d.version).run();
      const r=await env.DB.prepare('SELECT * FROM staging_ocr_reviews WHERE id=?').bind(id).first<Review>();
      if(!r)throw new ReviewError('STALE_SOURCE');return json({review:safeReview(r)},201);
    }
    const id=String(url.searchParams.get('review')||input.reviewId||'');if(!UUID.test(id))throw new ReviewError('INVALID_REVIEW',400);
    const r=await env.DB.prepare('SELECT * FROM staging_ocr_reviews WHERE id=? AND document_id=?').bind(id,d.id).first<Review>();
    if(!r)throw new ReviewError('REVIEW_NOT_FOUND',404);
    if(action==='read') {
      const history=await env.DB.prepare('SELECT action,changed_at,sequence,before_hash,after_hash FROM staging_ocr_review_history WHERE review_id=? ORDER BY change_id DESC LIMIT 100').bind(id).all();
      return json({review:safeReview(r),baselinePages:(JSON.parse(r.baseline_json) as string[]).map((md,i)=>extractReviewPage(md,i+1)),history:history.results,
        ...(r.new_revision?{index:await readiness(instance,r,d)}:{}),promotionEnabled:env.STAGING_OCR_PROMOTION_ENABLED==='true'});
    }
    // Only exact source/base identity. Any concurrent upload/revoke/delete requires a fresh review.
    if(d.content_hash!==r.source_hash||d.ai_search_revision!==r.base_revision||d.version!==r.base_version)throw new ReviewError('STALE_SOURCE');
    if(input.sequence!==r.sequence||input.draftHash!==r.draft_hash)throw new ReviewError('STALE_DRAFT');
    const stamp=new Date().toISOString();
    if(action==='save') {
      keys(input,['action','reviewId','sequence','draftHash','pages']);
      if(r.state!=='draft')throw new ReviewError('APPROVED_SNAPSHOT_IMMUTABLE');
      const pages=JSON.stringify(validateReviewPages(input.pages,d.ocr_page_count));
      const result=await env.DB.prepare(`UPDATE staging_ocr_reviews SET pages_json=?,draft_hash=?,sequence=sequence+1,updated_by=?,updated_at=?
        WHERE id=? AND state='draft' AND sequence=? AND draft_hash=? AND EXISTS(SELECT 1 FROM ai_documents WHERE id=? AND content_hash=? AND ai_search_revision=? AND version=? AND deleted_at IS NULL)`)
        .bind(pages,await reviewSha(pages),identity.userId,stamp,id,r.sequence,r.draft_hash,d.id,r.source_hash,r.base_revision,r.base_version).run();
      if(!result.meta.changes)throw new ReviewError('STALE_DRAFT');
    } else if(action==='approve') {
      keys(input,['action','reviewId','sequence','draftHash','confirmation']);
      if(r.state!=='draft'||input.confirmation!=='I_REVIEWED_THE_ORIGINAL_PDF')throw new ReviewError('EXPLICIT_ADMIN_REVIEW_REQUIRED',400);
      await original(env,d);
      await verifyBasePages(env,d,r);
      const derivedHash=await reviewSha(reviewedBodies(r).join('\n'));
      const revision=await buildEffectiveIndexRevision({documentId:d.id,sourceVersion:d.version+1,sourceContentHash:d.content_hash,indexSourceKind:'ocr_text',derivedSourceKind:'ocr',
        extractionPipelineVersion:`${PIPELINE}:${r.id}`,derivedContentHash:derivedHash,indexingStatus:'completed'});
      const result=await env.DB.prepare(`UPDATE staging_ocr_reviews SET state='approved',approved_by=?,approved_at=?,new_revision=?,derived_hash=?,updated_by=?,updated_at=?
        WHERE id=? AND state='draft' AND sequence=? AND draft_hash=? AND EXISTS(SELECT 1 FROM ai_documents WHERE id=? AND content_hash=? AND ai_search_revision=? AND version=? AND deleted_at IS NULL)`)
        .bind(identity.userId,stamp,revision,derivedHash,identity.userId,stamp,id,r.sequence,r.draft_hash,d.id,r.source_hash,r.base_revision,r.base_version).run();
      if(!result.meta.changes)throw new ReviewError('STALE_DRAFT');
    } else if(action==='index') {
      keys(input,['action','reviewId','sequence','draftHash']);
      if(!['approved','index_failed'].includes(r.state)||!r.new_revision||!r.approved_by)throw new ReviewError('APPROVAL_REQUIRED');
      await original(env,d);
      await verifyBasePages(env,d,r);
      const claim=await env.DB.prepare("UPDATE staging_ocr_reviews SET state='indexing',updated_by=?,updated_at=? WHERE id=? AND state=?").bind(identity.userId,stamp,id,r.state).run();
      if(!claim.meta.changes)throw new ReviewError('INDEX_ALREADY_RUNNING');
      try {
        const bodies=reviewedBodies(r);if(await reviewSha(bodies.join('\n'))!==r.derived_hash)throw new ReviewError('SNAPSHOT_HASH_MISMATCH');
        const metadata=buildServerDerivedMetadata({documentId:d.id,category:d.category,visibility:d.visibility,revision:r.new_revision,active:true});
        for(let n=1;n<=bodies.length;n++){
          const key=buildDerivedPageObjectKey(d.id,r.new_revision,n),existing=await env.AI_DOCUMENTS_BUCKET.get(key);
          if(existing){if(existing.size>120_000||await reviewSha(await existing.text())!==await reviewSha(bodies[n-1]))throw new ReviewError('REVISION_KEY_CONFLICT');}
          else {const put=await env.AI_DOCUMENTS_BUCKET.put(key,bodies[n-1],{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'text/markdown;charset=utf-8'},customMetadata:metadata});
            if(!put)throw new ReviewError('REVISION_KEY_CONFLICT');}
          await instance.items.upload(key,bodies[n-1],{metadata});
        }
        await env.DB.prepare("UPDATE staging_ocr_reviews SET state='indexed',updated_by=?,updated_at=? WHERE id=? AND state='indexing'").bind(identity.userId,new Date().toISOString(),id).run();
      }catch{
        await env.DB.prepare("UPDATE staging_ocr_reviews SET state='index_failed',updated_by=?,updated_at=? WHERE id=? AND state='indexing'").bind(identity.userId,new Date().toISOString(),id).run();
        throw new ReviewError('INDEX_FAILED_OLD_REVISION_RETAINED',503);
      }
    } else if(action==='promote') {
      keys(input,['action','reviewId','sequence','draftHash','confirmation']);
      if(env.STAGING_OCR_PROMOTION_ENABLED!=='true')throw new ReviewError('SEPARATE_OWNER_PROMOTION_APPROVAL_REQUIRED',403);
      if(r.state!=='indexed'||input.confirmation!=='PROMOTE_THIS_STAGING_REVISION'||!r.new_revision)throw new ReviewError('INDEX_REQUIRED');
      await original(env,d);
      await verifyBasePages(env,d,r);
      const ready=await readiness(instance,r,d);if(!ready.allPagesReady)throw new ReviewError('INDEX_NOT_COMPLETE');
      const approvedBodies=reviewedBodies(r);
      for(let n=1;n<=approvedBodies.length;n++){
        const o=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(d.id,r.new_revision,n));
        if(!o||o.size>120_000||await reviewSha(await o.text())!==await reviewSha(approvedBodies[n-1]))throw new ReviewError('APPROVED_PAGE_CHANGED');
      }
      // Transactionally compare-and-swap the review and live pointer. The old R2/index objects are retained.
      const result=await env.DB.batch([
        env.DB.prepare(`UPDATE staging_ocr_reviews SET state='promoted',promoted_by=?,promoted_at=?,updated_by=?,updated_at=?
          WHERE id=? AND state='indexed' AND sequence=? AND draft_hash=? AND EXISTS(SELECT 1 FROM ai_documents WHERE id=? AND content_hash=? AND ai_search_revision=? AND version=? AND deleted_at IS NULL)`)
          .bind(identity.userId,stamp,identity.userId,stamp,id,r.sequence,r.draft_hash,d.id,r.source_hash,r.base_revision,r.base_version),
        env.DB.prepare(`UPDATE ai_documents SET ai_search_revision=?,version=version+1,derived_content_hash=?,extraction_pipeline_version=?,derived_source_kind='ocr',ai_search_status='completed',updated_at=?
          WHERE id=? AND content_hash=? AND ai_search_revision=? AND version=? AND deleted_at IS NULL
          AND EXISTS(SELECT 1 FROM staging_ocr_reviews WHERE id=? AND state='promoted' AND promoted_at=?)`)
          .bind(r.new_revision,r.derived_hash,`${PIPELINE}:${r.id}`,stamp,d.id,r.source_hash,r.base_revision,r.base_version,id,stamp),
      ]);
      if(!result[0].meta.changes||!result[1].meta.changes)throw new ReviewError('PROMOTION_COMPARE_AND_SWAP_FAILED');
    } else throw new ReviewError('UNKNOWN_ACTION',400);
    const updated=await env.DB.prepare('SELECT * FROM staging_ocr_reviews WHERE id=?').bind(id).first<Review>();
    if(!updated)throw new ReviewError('REVIEW_NOT_FOUND',404);
    return json({review:safeReview(updated),...(updated.new_revision?{index:await readiness(instance,updated,d)}:{}),liveRevisionChanged:action==='promote'});
  }catch(error){
    const status=error instanceof ReviewError?error.status:typeof(error as {status?:number})?.status==='number'?(error as {status:number}).status:503;
    return json({error:error instanceof ReviewError?error.message:'REVIEW_REQUEST_UNAVAILABLE'},status);
  }
}
