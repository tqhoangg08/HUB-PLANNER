import {requireBetterAuthSession} from './better-auth-identity.ts';
import {AiDocumentsError,sha256AiDocumentBlob,type AiDocumentsEnv} from './ai-documents.ts';
import {AI_DOCUMENT_CATEGORY_VALUES} from '../../../shared/ai-document-categories.ts';
import {segmentDocumentText,renderTextSegment,TEXT_FIRST_PIPELINE,TextDocumentValidationError} from '../../../shared/ai-document-text.ts';
import {buildDerivedPageObjectKey,buildEffectiveIndexRevision,buildServerDerivedMetadata,isCompleteDerivedRevision,listDerivedRevisionReceipts} from './ai-document-ingestion.ts';
import {attachDocumentTags,saveDocumentTags,taggedDocumentIds} from './ai-document-tags.ts';
import {DocumentTagValidationError} from '../../../shared/ai-document-tags.ts';

type TextRoot={id:string;sequence:number;latest_revision_id:string|null;live_document_id:string|null};
type Revision={id:string;document_id:string;version:number;title:string;category:string;academic_year:string|null;program_code:string;
  visibility:'public'|'program'|'admin';storage_path:string;content_hash:string;file_size:number;segment_count:number;
  state:string;cursor:number;ai_search_revision:string|null;created_by:string;created_at:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const BATCH_SEGMENTS=8;
const safeRevision=(r:Revision)=>({id:r.id,documentId:r.document_id,version:r.version,title:r.title,category:r.category,
  academicYear:r.academic_year||'',programCode:r.program_code,visibility:r.visibility,state:r.state,cursor:r.cursor,segments:r.segment_count});
function storage(env:AiDocumentsEnv){
  if(!env.DB||!env.AI_DOCUMENTS_BUCKET)throw new AiDocumentsError(503,'Kho văn bản chưa sẵn sàng.');
  return {db:env.DB,bucket:env.AI_DOCUMENTS_BUCKET};
}
async function boundedJson(request:Request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new AiDocumentsError(415,'Yêu cầu JSON.');
  const reader=request.body?.getReader();if(!reader)throw new AiDocumentsError(400,'Thiếu nội dung.');
  const parts:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>2_100_000){await reader.cancel();throw new AiDocumentsError(413,'Nội dung quá lớn.');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  let input:unknown;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AiDocumentsError(400,'JSON không hợp lệ.');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AiDocumentsError(400,'JSON không hợp lệ.');
  return input as Record<string,unknown>;
}
function fields(input:Record<string,unknown>,allowed:string[]){
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw new AiDocumentsError(400,'Trường không được hỗ trợ.');
}
function identifier(value:unknown){
  if(typeof value!=='string'||!UUID.test(value))throw new AiDocumentsError(400,'Mã tài liệu không hợp lệ.');return value;
}
async function readRoot(env:AiDocumentsEnv,id:string){
  const root=await storage(env).db.prepare('SELECT * FROM ai_text_documents WHERE id=?').bind(id).first<TextRoot>();
  if(!root)throw new AiDocumentsError(404,'Không tìm thấy tài liệu văn bản.');return root;
}
async function readRevision(env:AiDocumentsEnv,id:string){
  const r=await storage(env).db.prepare('SELECT * FROM ai_text_revisions WHERE id=?').bind(id).first<Revision>();
  if(!r)throw new AiDocumentsError(404,'Không tìm thấy phiên bản.');return r;
}
async function source(env:AiDocumentsEnv,r:Revision){
  const object=await storage(env).bucket.get(r.storage_path);
  if(!object||object.size!==r.file_size||object.size>1048576)throw new AiDocumentsError(409,'Nguồn văn bản không khớp.');
  const bytes=await object.arrayBuffer();
  if(await sha256AiDocumentBlob(new Blob([bytes]))!==r.content_hash)throw new AiDocumentsError(409,'Hash nguồn văn bản không khớp.');
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
async function saveDraft(env:AiDocumentsEnv,input:Record<string,unknown>,actor:string){
  fields(input,['action','documentId','sequence','title','category','academicYear','programCode','visibility','text']);
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!title||title.length>240||typeof input.text!=='string')throw new AiDocumentsError(400,'Tên và nội dung tài liệu là bắt buộc.');
  if(!AI_DOCUMENT_CATEGORY_VALUES.includes(input.category as never)||!['public','program','admin'].includes(String(input.visibility)))throw new AiDocumentsError(400,'Danh mục hoặc phạm vi không hợp lệ.');
  const year=typeof input.academicYear==='string'?input.academicYear.trim():'';
  const program=typeof input.programCode==='string'?input.programCode.trim():'';
  if(year.length>40||!program||program.length>100||input.visibility==='program'&&program==='all')throw new AiDocumentsError(400,'Kiểm tra năm học và mã chương trình áp dụng.');
  let segments;try{segments=segmentDocumentText(input.text);}catch(e){if(e instanceof TextDocumentValidationError)throw new AiDocumentsError(400,e.message);throw e;}
  const {db,bucket}=storage(env),id=input.documentId?identifier(input.documentId):crypto.randomUUID();
  const existing=input.documentId?await readRoot(env,id):null;
  if(existing&&input.sequence!==existing.sequence)throw new AiDocumentsError(409,'Bản nháp đã thay đổi; hãy mở lại trước khi lưu.');
  const sequence=existing?.sequence||0,revision=crypto.randomUUID(),path=`ai-documents/text-first/${id}/${revision}/original.txt`;
  const blob=new Blob([input.text],{type:'text/plain;charset=utf-8'}),hash=await sha256AiDocumentBlob(blob),stamp=new Date().toISOString();
  const put=await bucket.put(path,blob.stream(),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:blob.type},customMetadata:{sha256:hash}});
  if(!put)throw new AiDocumentsError(409,'Không thể cấp vùng lưu bản nháp mới.');
  const head=await bucket.head(path);
  if(!head||head.size!==blob.size||head.customMetadata?.sha256!==hash)throw new AiDocumentsError(502,'Không thể xác nhận bản nháp trong R2.');
  // D1 batch is transactional. A concurrent edit cannot overwrite the head.
  const statements=[];
  if(!existing)statements.push(db.prepare('INSERT INTO ai_text_documents(id,created_by,created_at,updated_at) VALUES(?,?,?,?)').bind(id,actor,stamp,stamp));
  statements.push(db.prepare('UPDATE ai_text_documents SET sequence=sequence+1,latest_revision_id=?,updated_at=? WHERE id=? AND sequence=?').bind(revision,stamp,id,sequence));
  statements.push(db.prepare(`INSERT INTO ai_text_revisions(id,document_id,version,title,category,academic_year,program_code,visibility,storage_path,content_hash,file_size,segment_count,created_by,created_at)
    SELECT ?,id,sequence,?,?,?,?,?,?,?,?,?,?,? FROM ai_text_documents WHERE id=? AND latest_revision_id=? AND sequence=?`)
    .bind(revision,title,input.category,year||null,program,input.visibility,path,hash,blob.size,segments.length,actor,stamp,id,revision,sequence+1));
  const results=await db.batch(statements);
  if(!results[results.length-1].meta.changes)throw new AiDocumentsError(409,'Bản nháp đã thay đổi; hãy mở lại.');
  return {documentId:id,sequence:sequence+1,revision:safeRevision(await readRevision(env,revision))};
}
async function prepareRevision(env:AiDocumentsEnv,r:Revision){
  const text=await source(env,r),segments=segmentDocumentText(text);
  if(segments.length!==r.segment_count)throw new AiDocumentsError(409,'Số phân đoạn không khớp bản nháp.');
  const derivedHash=await sha256AiDocumentBlob(new Blob(segments.map(renderTextSegment)));
  const revision=await buildEffectiveIndexRevision({documentId:r.id,sourceVersion:r.version,sourceContentHash:r.content_hash,
    indexSourceKind:'ocr_text',derivedSourceKind:'native_text',extractionPipelineVersion:TEXT_FIRST_PIPELINE,derivedContentHash:derivedHash,indexingStatus:'completed'});
  return {segments,derivedHash,revision};
}
async function startIndex(env:AiDocumentsEnv,r:Revision){
  if(r.state!=='draft')return {revision:safeRevision(r)};
  const root=await readRoot(env,r.document_id);if(root.latest_revision_id!==r.id)throw new AiDocumentsError(409,'Chỉ lập chỉ mục bản nháp mới nhất.');
  const {db}=storage(env),prepared=await prepareRevision(env,r);
  const duplicate=await db.prepare('SELECT id FROM ai_documents WHERE content_hash=? AND deleted_at IS NULL AND id<>? LIMIT 1').bind(r.content_hash,r.id).first();
  if(duplicate)throw new AiDocumentsError(409,'Nội dung này đã có trong kho. Hãy thay đổi nội dung khi tạo revision mới; không tạo nguồn trùng.');
  const stamp=new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE ai_text_revisions SET state='indexing',ai_search_revision=? WHERE id=? AND state='draft'
      AND EXISTS(SELECT 1 FROM ai_text_documents WHERE id=? AND latest_revision_id=?)`).bind(prepared.revision,r.id,r.document_id,r.id),
    db.prepare(`INSERT INTO ai_documents(id,title,original_file_name,storage_path,mime_type,file_size,content_hash,category,academic_year,program_code,visibility,version,indexing_status,uploaded_by,created_at,updated_at,
      ocr_status,ocr_page_count,index_segment_count,index_source_kind,derived_source_kind,extraction_pipeline_version,derived_content_hash,ai_search_status,ai_search_revision)
      SELECT id,title,'source.txt',storage_path,'text/plain',file_size,content_hash,category,academic_year,program_code,visibility,version,'processing',created_by,created_at,?,
        'not_applicable',CASE WHEN segment_count<=40 THEN segment_count ELSE NULL END,segment_count,'ocr_text','native_text',?,?,'derived_ready',ai_search_revision
      FROM ai_text_revisions WHERE id=? AND state='indexing' AND cursor=0
      ON CONFLICT(id) DO NOTHING`).bind(stamp,TEXT_FIRST_PIPELINE,prepared.derivedHash,r.id),
  ]);
  return {revision:safeRevision(await readRevision(env,r.id))};
}
async function indexBatch(env:AiDocumentsEnv,r:Revision){
  if(!['indexing','failed'].includes(r.state))throw new AiDocumentsError(409,'Phiên bản chưa sẵn sàng để lập chỉ mục hoặc đang xử lý.');
  const {db,bucket}=storage(env),items=env.AI_ADVISOR_SEARCH?.get('hub-ai-text-production').items;
  if(!items?.upload)throw new AiDocumentsError(503,'AI Search upload chưa khả dụng. Bản nháp vẫn được giữ.');
  const prepared=await prepareRevision(env,r);
  if(prepared.revision!==r.ai_search_revision)throw new AiDocumentsError(409,'Revision lập chỉ mục không khớp nguồn.');
  const claim=await db.prepare("UPDATE ai_text_revisions SET state='working' WHERE id=? AND state=? AND cursor=?").bind(r.id,r.state,r.cursor).run();
  if(!claim.meta.changes)throw new AiDocumentsError(409,'Phiên bản đang được xử lý ở tab khác.');
  let cursor=r.cursor;
  try{
    const metadata=buildServerDerivedMetadata({documentId:r.id,category:r.category,visibility:r.visibility,revision:prepared.revision,active:true});
    for(const segment of prepared.segments.slice(cursor,cursor+BATCH_SEGMENTS)){
      const key=buildDerivedPageObjectKey(r.id,prepared.revision,segment.number),body=renderTextSegment(segment),hash=await sha256AiDocumentBlob(new Blob([body]));
      const existing=await bucket.get(key);
      if(existing){
        if(existing.size!==new TextEncoder().encode(body).length||existing.customMetadata?.revision!==prepared.revision
          ||existing.customMetadata?.document_id!==r.id||await sha256AiDocumentBlob(new Blob([await existing.arrayBuffer()]))!==hash)
          throw new AiDocumentsError(409,'Object revision đã tồn tại nhưng không khớp nguồn.');
      }else{
        const put=await bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'text/markdown;charset=utf-8'},customMetadata:{...metadata,sha256:hash}});
        if(!put)throw new AiDocumentsError(409,'Không thể ghi đè object revision.');
        const head=await bucket.head(key);if(!head||head.customMetadata?.sha256!==hash||head.size!==new TextEncoder().encode(body).length)throw new AiDocumentsError(502,'Không thể xác nhận phân đoạn R2.');
      }
      await items.upload(key,body,{metadata});cursor=segment.number;
    }
    await db.prepare("UPDATE ai_text_revisions SET cursor=?,state=? WHERE id=? AND state='working' AND cursor=?")
      .bind(cursor,cursor===r.segment_count?'awaiting_receipts':'indexing',r.id,r.cursor).run();
  }catch{
    await db.prepare("UPDATE ai_text_revisions SET cursor=?,state='failed' WHERE id=? AND state='working' AND cursor=?").bind(cursor,r.id,r.cursor).run();
    throw new AiDocumentsError(502,'Lập chỉ mục chưa thành công. Bản nháp và revision cũ được giữ; có thể tiếp tục các phân đoạn còn thiếu.');
  }
  return {revision:safeRevision(await readRevision(env,r.id))};
}
async function checkReceipts(env:AiDocumentsEnv,r:Revision){
  if(r.state!=='awaiting_receipts')return {revision:safeRevision(r)};
  const items=env.AI_ADVISOR_SEARCH?.get('hub-ai-text-production').items;
  if(!items||!r.ai_search_revision)return {revision:safeRevision(r),receiptStatus:'unavailable'};
  const expected={id:r.id,revision:r.ai_search_revision,pages:r.segment_count,visibility:r.visibility};
  let receipts;try{receipts=await listDerivedRevisionReceipts(items,expected);}catch{return {revision:safeRevision(r),receiptStatus:'unavailable'};}
  if(isCompleteDerivedRevision(expected,receipts))await storage(env).db.prepare("UPDATE ai_text_revisions SET state='ready' WHERE id=? AND state='awaiting_receipts' AND ai_search_revision=? AND cursor=segment_count").bind(r.id,r.ai_search_revision).run();
  return {revision:safeRevision(await readRevision(env,r.id))};
}
async function publish(env:AiDocumentsEnv,r:Revision,input:Record<string,unknown>,actor:string){
  if(input.confirmation!=='PUBLISH_REVIEWED_TEXT'||input.expectedLiveDocumentId===undefined)throw new AiDocumentsError(400,'Cần xác nhận công bố riêng sau khi xem trước.');
  const root=await readRoot(env,r.document_id);
  if(r.state!=='ready'||root.latest_revision_id!==r.id||input.expectedLiveDocumentId!==root.live_document_id)throw new AiDocumentsError(409,'Bản nháp hoặc nguồn đang phục vụ đã thay đổi.');
  // Recheck real provider receipts on explicit publication, not a client status.
  const items=env.AI_ADVISOR_SEARCH?.get('hub-ai-text-production').items;
  if(!items||!r.ai_search_revision)throw new AiDocumentsError(503,'Chưa xác minh được index.');
  const expected={id:r.id,revision:r.ai_search_revision,pages:r.segment_count,visibility:r.visibility};
  const receipts=await listDerivedRevisionReceipts(items,expected);
  if(!isCompleteDerivedRevision(expected,receipts))throw new AiDocumentsError(409,'AI Search chưa đủ receipts của revision này.');
  await source(env,r);
  const {db}=storage(env),stamp=new Date().toISOString();
  const livePredicate="EXISTS(SELECT 1 FROM ai_text_documents WHERE id=? AND latest_revision_id=? AND live_document_id IS ?)";
  const result=await db.batch([
    db.prepare(`UPDATE ai_text_revisions SET state='published',published_by=?,published_at=? WHERE id=? AND state='ready' AND ${livePredicate}`)
      .bind(actor,stamp,r.id,r.document_id,r.id,root.live_document_id),
    db.prepare(`UPDATE ai_documents SET indexing_status='pending',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM ai_text_revisions WHERE id=? AND state='published' AND published_at=?)`)
      .bind(stamp,root.live_document_id,r.id,stamp),
    db.prepare(`UPDATE ai_documents SET indexing_status='completed',ai_search_status='completed',updated_at=? WHERE id=? AND ai_search_revision=? AND deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM ai_text_revisions WHERE id=? AND state='published' AND published_at=?)`).bind(stamp,r.id,r.ai_search_revision,r.id,stamp),
    db.prepare(`UPDATE ai_text_documents SET live_document_id=?,updated_at=? WHERE id=? AND latest_revision_id=? AND live_document_id IS ?
      AND EXISTS(SELECT 1 FROM ai_text_revisions WHERE id=? AND state='published' AND published_at=?)`).bind(r.id,stamp,r.document_id,r.id,root.live_document_id,r.id,stamp),
  ]);
  if(!result[0].meta.changes||!result[2].meta.changes||!result[3].meta.changes)throw new AiDocumentsError(409,'Công bố bị chặn do trạng thái đồng thời; hãy kiểm tra lại.');
  return {revision:safeRevision(await readRevision(env,r.id)),liveDocumentId:r.id};
}

export async function handleAdminAiTextDocuments(request:Request,url:URL,env:AiDocumentsEnv){
  const identity=await requireBetterAuthSession(request,env);
  if(identity.role!=='admin')throw new AiDocumentsError(403,'Chỉ Admin được tạo và sửa văn bản AI.');
  const {db}=storage(env);
  if(request.method==='GET'){
    const id=url.searchParams.get('id');
    if(!id){
      const query=(url.searchParams.get('search')||'').slice(0,120),tagged=query?await taggedDocumentIds(db,query,'text'):[];
      const rows=await db.prepare(`SELECT d.id,d.sequence,d.live_document_id,r.title,r.state,r.version FROM ai_text_documents d
        JOIN ai_text_revisions r ON r.id=d.latest_revision_id ${query?`WHERE r.title LIKE ?${tagged.length?` OR d.id IN (${tagged.map(()=>'?').join(',')})`:''}`:''}
        ORDER BY d.updated_at DESC LIMIT 50`).bind(...(query?[`%${query.replace(/[%_]/g,'')}%`,...tagged]:[])).all<{id:string}>();
      return {documents:await attachDocumentTags(db,rows.results||[],'text')};
    }
    const root=await readRoot(env,identifier(id));if(!root.latest_revision_id)throw new AiDocumentsError(404,'Chưa có bản nháp.');
    const r=await readRevision(env,root.latest_revision_id),history=await db.prepare('SELECT id,version,state,created_at,published_at FROM ai_text_revisions WHERE document_id=? ORDER BY version DESC LIMIT 50').bind(root.id).all();
    return {documentId:root.id,sequence:root.sequence,liveDocumentId:root.live_document_id,tags:(await attachDocumentTags(db,[root],'text'))[0].tags,revision:safeRevision(r),text:await source(env,r),history:history.results};
  }
  if(request.method!=='POST')throw new AiDocumentsError(405,'Phương thức không hỗ trợ.');
  // Cookie-based editor writes require exact origin; no client role/approval bypass.
  if(request.headers.get('Origin')!==url.origin)throw new AiDocumentsError(403,'Yêu cầu cùng origin.');
  const input=await boundedJson(request);
  if(input.action==='update_tags'){
    fields(input,['action','documentId','tags']);const root=await readRoot(env,identifier(input.documentId));
    try{return {tags:await saveDocumentTags(db,root.id,'text',input.tags,identity.userId)};}
    catch(error){throw new AiDocumentsError(error instanceof DocumentTagValidationError?400:503,error instanceof DocumentTagValidationError?error.message:'Chưa lưu được tag; kiểm tra migration và mở lại tài liệu.');}
  }
  if(input.action==='save')return saveDraft(env,input,identity.userId);
  fields(input,input.action==='publish'?['action','revisionId','confirmation','expectedLiveDocumentId']:['action','revisionId']);
  const r=await readRevision(env,identifier(input.revisionId));
  if(input.action==='index')return startIndex(env,r);
  if(input.action==='index_batch')return indexBatch(env,r);
  if(input.action==='check')return checkReceipts(env,r);
  if(input.action==='publish')return publish(env,r,input,identity.userId);
  throw new AiDocumentsError(400,'Thao tác văn bản không hợp lệ.');
}
