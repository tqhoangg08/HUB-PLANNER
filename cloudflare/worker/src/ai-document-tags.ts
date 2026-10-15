import {parseDocumentTags,normalizeDocumentKeyword} from '../../../shared/ai-document-tags.ts';

const missingTags=(error:unknown)=>/no such table: (?:main\.)?ai_document_tags\b/i.test(String(error));
const decode=(value:string)=>parseDocumentTags(JSON.parse(value));
/** Call only with the already authorized catalog/page. No source content or index access. */
export async function attachDocumentTags<T extends {id:string}>(db:D1Database,documents:readonly T[],kind:'file'|'text'='file'):Promise<Array<T&{tags:string[]}>>{
  const byId=new Map<string,string[]>();
  try{
    for(let start=0;start<documents.length;start+=80){
      const ids=documents.slice(start,start+80).map(d=>d.id);if(!ids.length)continue;
      const query=kind==='text'?`SELECT text_document_id AS id,tags_json FROM ai_document_tags WHERE text_document_id IN (${ids.map(()=>'?').join(',')})`
        :`SELECT a.id,t.tags_json FROM ai_document_tags t JOIN ai_documents a
          ON t.file_document_id=a.id OR t.text_document_id=(SELECT document_id FROM ai_text_revisions WHERE id=a.id)
          WHERE a.id IN (${ids.map(()=>'?').join(',')})`;
      const result=await db.prepare(query).bind(...ids).all<{id:string;tags_json:string}>();
      for(const row of result.results||[])byId.set(row.id,decode(row.tags_json));
    }
  }catch(error){
    // Additive migration may be intentionally pending. Never hide other DB failures.
    if(!missingTags(error))throw error;
  }
  return documents.map(d=>({...d,tags:byId.get(d.id)||[]}));
}
export async function saveDocumentTags(db:D1Database,id:string,kind:'file'|'text',value:unknown,actor:string){
  const tags=parseDocumentTags(value),column=kind==='file'?'file_document_id':'text_document_id';
  // Target checks occur again within the INSERT, not only in a prior lookup.
  const target=kind==='file'?"SELECT id FROM ai_documents WHERE id=? AND deleted_at IS NULL AND COALESCE(extraction_pipeline_version,'')<>'admin-text-structured-v1'"
    :'SELECT id FROM ai_text_documents WHERE id=?';
  const result=await db.prepare(`INSERT INTO ai_document_tags(${column},tags_json,updated_by,updated_at) SELECT id,?,?,? FROM (${target}) WHERE 1
      ON CONFLICT(${column}) WHERE ${column} IS NOT NULL DO UPDATE SET tags_json=excluded.tags_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(JSON.stringify(tags),actor,new Date().toISOString(),id).run();
  if(result.meta.changes!==1)throw new Error('TAG_DOCUMENT_NOT_FOUND');
  return tags;
}
/** Admin search only; bounded identities are still intersected with the list's predicates. */
export async function taggedDocumentIds(db:D1Database,query:string,kind:'file'|'text'){
  const key=normalizeDocumentKeyword(query);if(!key)return [];
  try{
    const rows=await db.prepare('SELECT file_document_id,text_document_id,tags_json FROM ai_document_tags LIMIT 5001')
      .all<{file_document_id:string|null;text_document_id:string|null;tags_json:string}>();
    if((rows.results||[]).length>5000)throw new Error('TAG_CATALOG_LIMIT');
    const matches=(rows.results||[]).filter(r=>decode(r.tags_json).some(t=>normalizeDocumentKeyword(t).includes(key)));
    const ids=new Set(matches.flatMap(r=>kind==='text'?(r.text_document_id?[r.text_document_id]:[]):r.file_document_id?[r.file_document_id]:[]));
    const roots=matches.flatMap(r=>r.text_document_id?[r.text_document_id]:[]);
    if(roots.length>80||ids.size>80)throw new Error('TAG_SEARCH_TOO_BROAD');
    if(kind==='file'&&roots.length){
      const result=await db.prepare(`SELECT id FROM ai_text_revisions WHERE document_id IN (${roots.map(()=>'?').join(',')}) LIMIT 81`).bind(...roots).all<{id:string}>();
      for(const revision of result.results||[])ids.add(revision.id);
    }
    if(ids.size>80)throw new Error('TAG_SEARCH_TOO_BROAD');
    return [...ids];
  }catch(error){if(missingTags(error))return [];throw error;}
}
