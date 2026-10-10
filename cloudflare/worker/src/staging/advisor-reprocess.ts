/** Staging rehearsal ONLY; no production route imports this module. */
import {parsePreparedPdfPages,storeDerivedPdfPages,buildDerivedPageObjectKey,buildServerDerivedMetadata,isCompleteDerivedRevision,buildEffectiveIndexRevision} from '../ai-document-ingestion.ts';
import {requireBetterAuthSession,type BetterAuthIdentityEnv} from '../better-auth-identity.ts';
type RehearsalEnv=BetterAuthIdentityEnv&{DB:D1Database;AI_DOCUMENTS_BUCKET:R2Bucket};
const sha=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function rehearseStagingReprocess(request:Request,env:RehearsalEnv,instance:AiSearchInstance){
  const identity=await requireBetterAuthSession(request,env);if(identity.role!=='admin')return Response.json({error:'Forbidden'},{status:403});
  if(Number(request.headers.get('Content-Length')||0)>2_000_000)return Response.json({error:'Payload too large'},{status:413});
  // Even staging must not buffer an unbounded chunked request.
  const reader=request.body?.getReader();if(!reader)return Response.json({error:'Payload required'},{status:400});
  const parts:Uint8Array[]=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>2_000_000){await reader.cancel();return Response.json({error:'Payload too large'},{status:413});}parts.push(value);}
  const joined=new Uint8Array(bytes);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.byteLength;}
  const raw=new TextDecoder().decode(joined);
  const input=JSON.parse(raw),hash=String(input.sourceHash||'');if(!/^[a-f0-9]{64}$/.test(hash))throw Error('SOURCE_HASH_REQUIRED');
  const d=await env.DB.prepare("SELECT * FROM ai_documents WHERE content_hash=? AND deleted_at IS NULL AND visibility='public' AND ai_search_status='completed'").bind(hash).first<Record<string,unknown>>();
  if(!d)throw Error('STAGING_SOURCE_NOT_READY');
  const original=await env.AI_DOCUMENTS_BUCKET.get(String(d.storage_path));if(!original||await sha(await original.arrayBuffer())!==hash)throw Error('ORIGINAL_HASH_MISMATCH');
  const prepared=await parsePreparedPdfPages(JSON.stringify(input.prepared),hash),version=Number(d.version)+1;
  const revision=await buildEffectiveIndexRevision({documentId:String(d.id),sourceVersion:version,sourceContentHash:hash,indexSourceKind:'ocr_text',derivedSourceKind:prepared.ocrUsed?'ocr':'native_text',extractionPipelineVersion:prepared.pipelineVersion,derivedContentHash:prepared.derivedContentHash,indexingStatus:'completed'});
  // Never reuse an allocated revision: upload helper cleanup is for NEW keys only.
  for(const p of prepared.pages)if(await env.AI_DOCUMENTS_BUCKET.head(buildDerivedPageObjectKey(String(d.id),revision,p.pageNumber)))throw Error('REVISION_ALREADY_EXISTS');
  const oldDigests=[];
  for(let page=1;page<=Number(d.ocr_page_count);page++){
    const object=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(String(d.id),String(d.ai_search_revision),page));if(!object)throw Error('OLD_REVISION_MISSING');
    oldDigests.push(await sha(await object.arrayBuffer()));
  }
  const stored=await storeDerivedPdfPages(env.AI_DOCUMENTS_BUCKET,{id:String(d.id),content_hash:hash,version,category:String(d.category),visibility:'public'},prepared);
  for(const key of stored.keys){const object=await env.AI_DOCUMENTS_BUCKET.get(key);if(!object)throw Error('NEW_PAGE_MISSING');
    await instance.items.upload(key,await object.text(),{metadata:buildServerDerivedMetadata({documentId:String(d.id),category:String(d.category),visibility:'public',revision:stored.revision,active:true})});}
  // Rehearsal writes NO D1 pointer. Promotion is separate and only after every
  // actual provider item completes. Old revision stays live during indexing.
  const listing=await instance.items.list({per_page:50,metadata_filter:JSON.stringify({document_id:d.id,revision:stored.revision})});
  const ready=isCompleteDerivedRevision({id:String(d.id),revision:stored.revision,pages:prepared.pages.length,visibility:'public'},listing.result);
  for(let i=0;i<oldDigests.length;i++){
    const object=await env.AI_DOCUMENTS_BUCKET.get(buildDerivedPageObjectKey(String(d.id),String(d.ai_search_revision),i+1));
    if(!object||await sha(await object.arrayBuffer())!==oldDigests[i])throw Error('OLD_REVISION_CHANGED');
  }
  const now=await env.DB.prepare('SELECT ai_search_revision,version,storage_path,content_hash FROM ai_documents WHERE id=?').bind(d.id).first<Record<string,unknown>>();
  if(!now||['ai_search_revision','version','storage_path','content_hash'].some(k=>now[k]!==d[k]))throw Error('LIVE_POINTER_CHANGED');
  const retained=await env.AI_DOCUMENTS_BUCKET.get(String(d.storage_path));if(!retained||await sha(await retained.arrayBuffer())!==hash)throw Error('ORIGINAL_CHANGED');
  return Response.json({rehearsal:true,newRevision:stored.revision,allPagesReady:ready,pages:prepared.pages.length,originalPreserved:true,oldRevisionPreserved:true,d1PointerChanged:false});
}
