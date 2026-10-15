import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {privateApiRequest} from '../utils/privateApi';
import {AI_DOCUMENT_CATEGORY_OPTIONS} from '../shared/ai-document-categories';
import {segmentDocumentText} from '../shared/ai-document-text';
import AIDocumentTagEditor from './AIDocumentTagEditor';

type Revision={id:string;documentId:string;version:number;title:string;category:string;academicYear:string;programCode:string;visibility:'public'|'program'|'admin';state:string;cursor:number;segments:number};
type TextItem={id:string;title:string;state:string;version:number;sequence:number;live_document_id:string|null;tags?:string[]};
const states:Record<string,string>={draft:'Bản nháp',indexing:'Đang lập chỉ mục',working:'Đang xử lý lô',awaiting_receipts:'Chờ AI Search xác nhận đầy đủ',ready:'Index đầy đủ · chưa công bố',failed:'Lỗi · bản cũ được giữ',published:'Đã công bố'};
const api=async(input?:Record<string,unknown>,id?:string,search?:string)=>{
  const response=await privateApiRequest(`/api/admin/v1/ai-text-documents${id?`?id=${encodeURIComponent(id)}`:search?`?search=${encodeURIComponent(search)}`:''}`,input?{method:'POST',body:JSON.stringify(input)}:{});
  return response.json();
};
/** No HTML, image fetches or external preview links. TSV stays literal/table aligned. */
export function DocumentTextPreview({text}:{text:string}){
  const blocks=text.split(/(^(?:[^\r\n]*\t[^\r\n]*(?:\r?\n|$))+)/m).filter(Boolean);
  return <div className="space-y-3 break-words text-sm [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_table]:w-full">
    {blocks.map((block,i)=>block.includes('\t')?<div key={i} className="overflow-x-auto"><table><tbody>{block.trimEnd().split(/\r?\n/).map((row,n)=><tr key={n}>{row.split('\t').map((cell,c)=><td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>
      :<ReactMarkdown key={i} remarkPlugins={[remarkGfm]} skipHtml components={{img:()=>null,a:({children})=><span>{children}</span>,table:({children})=><div className="overflow-x-auto"><table>{children}</table></div>}}>{block}</ReactMarkdown>)}
  </div>;
}
export default function AdminAITextDocuments(){
  const [items,setItems]=useState<TextItem[]>([]),[opened,setOpened]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [documentId,setDocumentId]=useState<string>(),[sequence,setSequence]=useState(0),[live,setLive]=useState<string|null>(null),[revision,setRevision]=useState<Revision|null>(null);
  const [title,setTitle]=useState(''),[category,setCategory]=useState('training_regulation'),[academicYear,setYear]=useState(''),[programCode,setProgram]=useState('all');
  const [visibility,setVisibility]=useState<'public'|'program'|'admin'>('admin'),[text,setText]=useState(''),[dirty,setDirty]=useState(true),[preview,setPreview]=useState(false);
  const [history,setHistory]=useState<Array<{id:string;version:number;state:string}>>([]),[publishConfirm,setPublishConfirm]=useState(false);
  const [search,setSearch]=useState(''),[tags,setTags]=useState<string[]>([]);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const load=async()=>{try{const result=await api(undefined,undefined,search);if(active.current)setItems(result.documents||[]);}catch{if(active.current)setError('Text-first chưa khả dụng. Luồng tải file cũ vẫn được giữ.');}};
  useEffect(()=>{const timer=setTimeout(()=>void load(),300);return()=>clearTimeout(timer);},[search]);
  const edit=async(id:string)=>{setBusy(true);setError('');try{
    const d=await api(undefined,id),r:Revision=d.revision;
    setDocumentId(d.documentId);setSequence(d.sequence);setLive(d.liveDocumentId);setRevision(r);setHistory(d.history||[]);
    setTags(d.tags||[]);
    setTitle(r.title);setCategory(r.category);setYear(r.academicYear);setProgram(r.programCode);setVisibility(r.visibility);setText(d.text);setDirty(false);setPreview(false);setPublishConfirm(false);setOpened(true);
  }catch(e){setError(e instanceof Error?e.message:'Không mở được bản nháp.');}finally{setBusy(false);}};
  const create=()=>{setDocumentId(undefined);setTags([]);setSequence(0);setLive(null);setRevision(null);setHistory([]);setTitle('');setText('');setCategory('training_regulation');setYear('');setProgram('all');setVisibility('admin');setDirty(true);setPreview(false);setPublishConfirm(false);setError('');setOpened(true);};
  const change=()=>{setDirty(true);setPublishConfirm(false);};
  let segments=0,validation='';try{if(text.trim())segments=segmentDocumentText(text).length;}catch(e){validation=e instanceof Error?e.message:'Nội dung không hợp lệ.';}
  const save=async()=>{
    const result=await api({action:'save',...(documentId?{documentId,sequence}:{}),title,category,academicYear,programCode,visibility,text});
    setDocumentId(result.documentId);setSequence(result.sequence);setRevision(result.revision);setDirty(false);
    setHistory(current=>[{id:result.revision.id,version:result.revision.version,state:result.revision.state},...current]);
    return result.revision as Revision;
  };
  const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();await load();}catch(e){setError(e instanceof Error?e.message:'Không thể xử lý văn bản.');}finally{setBusy(false);}};
  const index=()=>run(async()=>{
    let r=dirty||!revision?await save():revision;
    if(r.state==='draft'){r=(await api({action:'index',revisionId:r.id})).revision;setRevision(r);}
    // At most 16 batches of 8. Closing the editor stops between requests.
    for(let batch=0;batch<16&&active.current&&['indexing','failed'].includes(r.state);batch++){
      r=(await api({action:'index_batch',revisionId:r.id})).revision;setRevision(r);
    }
  });
  const check=()=>run(async()=>{if(revision)setRevision((await api({action:'check',revisionId:revision.id})).revision);});
  return <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4" aria-label="Tài liệu Text-first">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-[#003375]">Tài liệu văn bản</h2><p className="text-xs text-slate-500">Đặt tên, dán nội dung, xem trước và lập chỉ mục. Không cần Word/PDF.</p></div>
      <button onClick={create} disabled={busy} className="rounded-lg bg-[#0052CC] px-4 py-2 text-sm font-bold text-white">Tạo tài liệu</button></div>
    {error&&<p role="alert" className="my-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!opened&&<><input aria-label="Tìm văn bản theo tên hoặc tag" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm tên tài liệu hoặc tag" className="mt-3 w-full rounded border p-2 text-sm"/><ul className="mt-3 divide-y">{items.map(item=><li key={item.id} className="py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{item.title} · v{item.version} · {states[item.state]||item.state}</span><button onClick={()=>void edit(item.id)} disabled={busy} className="text-blue-700">Mở / chỉnh sửa</button></div><AIDocumentTagEditor documentId={item.id} kind="text" tags={item.tags} onSaved={()=>void load()}/></li>)}</ul></>}
    {opened&&<div className="mt-4 space-y-4">
      <p className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">Chỉ dán nội dung có quyền sử dụng. Bản nháp không được chatbot truy xuất. Văn bản được giữ nguyên; không suy ra trang hoặc tự xác nhận hiệu lực pháp lý.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Tên tài liệu *<input value={title} maxLength={240} onChange={e=>{setTitle(e.target.value);change();}} disabled={busy} className="mt-1 w-full rounded border p-2"/></label>
        <label className="text-sm">Danh mục<select value={category} onChange={e=>{setCategory(e.target.value);change();}} disabled={busy} className="mt-1 w-full rounded border p-2">{AI_DOCUMENT_CATEGORY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="text-sm">Năm học<input value={academicYear} maxLength={40} onChange={e=>{setYear(e.target.value);change();}} disabled={busy} className="mt-1 w-full rounded border p-2" placeholder="2026-2027"/></label>
        <label className="text-sm">Mã chương trình/ngành<input value={programCode} maxLength={100} onChange={e=>{setProgram(e.target.value);change();}} disabled={busy} className="mt-1 w-full rounded border p-2"/><small>“all” cho mọi chương trình.</small></label>
        <label className="text-sm">Phạm vi khi công bố<select value={visibility} onChange={e=>{setVisibility(e.target.value as Revision['visibility']);change();}} disabled={busy} className="mt-1 w-full rounded border p-2"><option value="admin">Chỉ Admin</option><option value="public">Công khai cho chatbot</option><option value="program">Theo chương trình (chưa phục vụ chatbot)</option></select></label>
      </div>
      {documentId?<AIDocumentTagEditor documentId={documentId} kind="text" tags={tags} onSaved={setTags}/>:<p className="text-xs text-slate-500">Lưu bản nháp lần đầu để thêm tag tìm kiếm. Tag được giữ qua các revision.</p>}
      <div className="flex gap-3 text-sm"><button onClick={()=>setPreview(false)} className={!preview?'font-bold text-blue-800':''}>Soạn thảo</button><button onClick={()=>setPreview(true)} className={preview?'font-bold text-blue-800':''}>Xem trước văn bản và bảng</button></div>
      {preview?<div className="max-h-[65vh] overflow-y-auto rounded border p-4"><DocumentTextPreview text={text}/></div>:<label className="block text-sm">Nội dung *<textarea aria-label="Nội dung tài liệu" value={text} onChange={e=>{setText(e.target.value);change();}} disabled={busy} rows={18} className="mt-1 w-full rounded border p-3 font-mono text-sm"/><small>Văn bản hoặc Markdown; bảng có thể dùng dấu | hoặc tab. Tối đa 1 MB, 128 phân đoạn; không tự cắt bảng.</small></label>}
      {validation&&<p role="alert" className="text-sm text-red-700">{validation}</p>}
      <p aria-live="polite" className="text-sm text-slate-600">{segments} phân đoạn dự kiến{revision?` · v${revision.version}: ${states[revision.state]||revision.state} · ${revision.cursor}/${revision.segments} đã gửi index`:''}{dirty?' · Có thay đổi chưa lưu':''}</p>
      <div className="flex flex-wrap gap-2"><button onClick={()=>void run(async()=>{await save();})} disabled={busy||!title.trim()||!text.trim()||!!validation} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Lưu bản nháp</button>
        <button onClick={()=>void index()} disabled={busy||!title.trim()||!text.trim()||!!validation||!dirty&&!!revision&&!['draft','indexing','failed'].includes(revision.state)} className="rounded bg-[#0052CC] px-3 py-2 text-sm text-white disabled:opacity-50">{busy?'Đang xử lý…':'Lưu và lập chỉ mục AI'}</button>
        {revision?.state==='awaiting_receipts'&&!dirty&&<button onClick={()=>void check()} disabled={busy} className="rounded border px-3 py-2 text-sm">Kiểm tra đủ index</button>}
        <button onClick={()=>{if(!busy)setOpened(false);}} disabled={busy} className="rounded border px-3 py-2 text-sm">Đóng</button>
      </div>
      {revision?.state==='ready'&&!dirty&&<div className="rounded border border-amber-200 p-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" checked={publishConfirm} onChange={e=>setPublishConfirm(e.target.checked)}/><span>Tôi đã xem trước nội dung/bảng, kiểm tra phạm vi và có quyền công bố revision này. {live?'Chỉ thay thế revision Text-first trước đó của chính tài liệu này.':'Không thay thế tài liệu đã có.'}</span></label><button disabled={busy||!publishConfirm} onClick={()=>void run(async()=>{const d=await api({action:'publish',revisionId:revision.id,expectedLiveDocumentId:live,confirmation:'PUBLISH_REVIEWED_TEXT'});setRevision(d.revision);setLive(d.liveDocumentId);setPublishConfirm(false);})} className="mt-3 rounded bg-blue-800 px-3 py-2 text-white disabled:opacity-50">Công bố revision đã kiểm tra</button></div>}
      {history.length>0&&<details className="text-xs text-slate-500"><summary>Lịch sử revision (giữ nguyên bản cũ)</summary><ul>{history.map(r=><li key={r.id}>v{r.version} · {states[r.state]||r.state}</li>)}</ul></details>}
    </div>}
  </section>;
}
