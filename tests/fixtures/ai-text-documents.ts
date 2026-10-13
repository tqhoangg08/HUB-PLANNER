import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAdminAiTextDocuments} from '../../cloudflare/worker/src/ai-text-documents.ts';
import type {AiDocumentsEnv} from '../../cloudflare/worker/src/ai-documents.ts';
export const TEXT_ORIGIN='http://127.0.0.1:5197';
export const ADMIN='22222222-2222-4222-8222-222222222222';
export function textFixture(){
  const sql=new DatabaseSync(':memory:');
  for(const name of ['0032_ai_documents_chat_d1_r2_authority','0044_ai_document_ocr_ingestion','0045_ai_document_public_view_policy','0049_ai_document_derived_index_identity','0054_ai_document_search_ingestion_state','0055_ai_document_index_segment_count','0056_ai_text_document_revisions'])
    sql.exec(readFileSync(`cloudflare/migrations/${name}.sql`,'utf8'));
  const faults={sql:false,upload:false,r2:false,list:false};
  let listingHook:(()=>void)|null=null,uploads=0,lists=0;
  const prepare=(query:string)=>{let values:unknown[]=[];const s={bind(...v:unknown[]){values=v;return s;},async first(){return sql.prepare(query).get(...values)||null;},
    async all(){return {results:sql.prepare(query).all(...values)};},async run(){if(faults.sql&&query.includes('INSERT INTO ai_documents'))throw Error('fixture D1 write failed');return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return s;};
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const objects=new Map<string,{bytes:Uint8Array;metadata:Record<string,string>}>();
  const bucket={async put(key:string,body:string|ReadableStream,options:{customMetadata:Record<string,string>;onlyIf?:unknown}){
    if(faults.r2)throw Error('fixture R2 failed');if(objects.has(key)&&options.onlyIf)return null;
    const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{bytes,metadata:options.customMetadata});return {key};},
    async head(key:string){const o=objects.get(key);return o?{size:o.bytes.length,customMetadata:o.metadata}:null;},
    async get(key:string){const o=objects.get(key);return o?{size:o.bytes.length,customMetadata:o.metadata,body:new Blob([o.bytes]).stream(),text:async()=>new TextDecoder().decode(o.bytes),arrayBuffer:async()=>o.bytes.slice().buffer}:null;},
    async delete(key:string|string[]){for(const k of Array.isArray(key)?key:[key])objects.delete(k);}};
  const receipts=new Map<string,{key:string;status:string;metadata:Record<string,unknown>}>();
  const identity={userId:ADMIN,email:'synthetic@example.invalid',role:'admin'};
  const instance={search:async()=>({chunks:[]}),items:{async upload(key:string,_text:unknown,options?:{metadata?:Record<string,unknown>}){
    uploads++;if(faults.upload)throw Error('fixture provider failed');receipts.set(key,{key,status:'running',metadata:options?.metadata||{}});return {key};},
    async list(input?:{page?:number;per_page?:number;metadata_filter?:string}){
      lists++;if(faults.list)throw Error('fixture status failed');if(listingHook)listingHook();
      const filter=JSON.parse(input?.metadata_filter||'{}'),filtered=[...receipts.values()].filter(r=>r.metadata.document_id===filter.document_id&&r.metadata.revision===filter.revision);
      const page=input?.page||1,per=input?.per_page||50;
      return {result:filtered.slice((page-1)*per,page*per),result_info:{page,per_page:per,total_count:filtered.length}};}}};
  const env={DB:db,AI_DOCUMENTS_BUCKET:bucket,AUTH_SERVICE:{fetch:async()=>Response.json(identity)},AI_ADVISOR_SEARCH:{get:()=>instance}} as unknown as AiDocumentsEnv;
  const call=(input?:Record<string,unknown>,id?:string,headers:Record<string,string>={})=>{
    const request=new Request(`${TEXT_ORIGIN}/api/admin/v1/ai-text-documents${id?`?id=${id}`:''}`,{method:input?'POST':'GET',headers:{Cookie:'fixture=opaque',Origin:TEXT_ORIGIN,'Content-Type':'application/json',...headers},...(input?{body:JSON.stringify(input)}:{})});
    return handleAdminAiTextDocuments(request,new URL(request.url),env);
  };
  const save=(text='Điều 3. Nội dung\n\n1. Quy định có nguồn.',extra:Record<string,unknown>={})=>call({action:'save',title:'Tài liệu kiểm thử',category:'training_regulation',academicYear:'2026-2027',programCode:'all',visibility:'public',text,...extra});
  const ready=async(id:string)=>{await call({action:'index',revisionId:id});let row;
    do{row=sql.prepare('SELECT state FROM ai_text_revisions WHERE id=?').get(id);if(['indexing','failed'].includes(String(row?.state)))await call({action:'index_batch',revisionId:id});}while(sql.prepare('SELECT state FROM ai_text_revisions WHERE id=?').get(id)?.state==='indexing');
    for(const receipt of receipts.values())receipt.status='completed';return call({action:'check',revisionId:id});};
  return {sql,env,identity,objects,receipts,faults,call,save,ready,get uploads(){return uploads;},get lists(){return lists;},set listingHook(h:(()=>void)|null){listingHook=h;}};
}
