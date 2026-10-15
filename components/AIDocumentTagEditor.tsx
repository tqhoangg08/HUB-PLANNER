import React,{useEffect,useState} from 'react';
import {privateApiRequest} from '../utils/privateApi';
import {parseDocumentTags,MAX_DOCUMENT_TAG_LENGTH} from '../shared/ai-document-tags';

/** Independent metadata save: never uploads, indexes, edits or publishes content. */
export default function AIDocumentTagEditor({documentId,kind,tags=[],onSaved}:{documentId:string;kind:'file'|'text';tags?:string[];onSaved?:(tags:string[])=>void}){
  const [values,setValues]=useState(tags),[input,setInput]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const signature=JSON.stringify(tags);
  useEffect(()=>{setValues(JSON.parse(signature));setInput('');setSaved(false);setError('');},[documentId,signature]);
  const add=()=>{if(!input.trim())return values;try{const next=parseDocumentTags([...values,input]);setValues(next);setInput('');setSaved(false);setError('');return next;}catch(e){setError(e instanceof Error?e.message:'Tag không hợp lệ.');return null;}};
  const save=async()=>{const next=input.trim()?add():values;if(!next)return;setBusy(true);setError('');setSaved(false);try{
    const response=await privateApiRequest(`/api/admin/v1/${kind==='file'?'ai-documents':'ai-text-documents'}`,{method:'POST',body:JSON.stringify({action:'update_tags',...(kind==='file'?{id:documentId}:{documentId}),tags:next})});
    const result=await response.json();if(!response.ok)throw new Error(result.message||'Không lưu được tag.');
    setValues(result.tags);setSaved(true);onSaved?.(result.tags);
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được tag.');}finally{setBusy(false);}};
  return <fieldset disabled={busy} className="mt-3 min-w-0 space-y-2 text-xs" aria-label="Tag tìm kiếm tài liệu">
    <legend className="font-semibold text-slate-600">Tag tìm kiếm · chỉ metadata</legend>
    <div className="flex flex-wrap gap-1">{values.map(tag=><span key={tag} className="inline-flex max-w-full items-center gap-1 break-words rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-blue-900">{tag}<button type="button" aria-label={`Xóa tag ${tag}`} onClick={()=>{setValues(values.filter(t=>t!==tag));setSaved(false);}}>×</button></span>)}</div>
    <div className="flex flex-wrap gap-2"><input aria-label="Thêm tag tìm kiếm" value={input} maxLength={MAX_DOCUMENT_TAG_LENGTH} onChange={e=>{setInput(e.target.value);setSaved(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} placeholder="Ví dụ: học phí theo ngành" className="min-w-0 flex-1 rounded border p-2"/>
      <button type="button" onClick={add} className="rounded border px-2">Thêm tag</button><button type="button" onClick={()=>void save()} className="rounded border px-2 text-blue-800">{busy?'Đang lưu…':'Lưu tag'}</button></div>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{saved&&<p role="status" className="text-emerald-700">Đã lưu tag, không lập chỉ mục lại.</p>}
  </fieldset>;
}
