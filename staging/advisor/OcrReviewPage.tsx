import React,{useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {privateApiRequest} from '../../utils/privateApi';
type Page={pageNumber:number;text:string};
type Review={id:string;state:string;sequence:number;draftHash:string;sourceHash:string;baseRevision:string;newRevision:string|null;pages:Page[]};
type Loaded={document?:{id:string;title:string;sourceHash:string;baseRevision:string};pages?:Page[];baselinePages?:Page[];
  review?:Review;reviews?:{id:string;state:string;updated_at:string}[];history?:{action:string;changed_at:string;sequence:number}[];
  index?:{allPagesReady:boolean;completedPages:number;pages:number};promotionEnabled:boolean};
export function OcrReviewPage({documentId,onClose}:{documentId:string;onClose:()=>void}){
  const [loaded,setLoaded]=useState<Loaded>(),[pages,setPages]=useState<Page[]>([]),[baseline,setBaseline]=useState<Page[]>([]);
  const [page,setPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[ack,setAck]=useState(false);
  const [pdf,setPdf]=useState<PDFDocumentProxy>(),[rendered,setRendered]=useState(false),[zoom,setZoom]=useState(1);
  const canvas=useRef<HTMLCanvasElement>(null);
  const endpoint=`/api/staging/ocr-review?document=${encodeURIComponent(documentId)}`;
  const consume=(next:Loaded)=>{setLoaded(current=>({...current,...next}));if(next.review)setPages(next.review.pages);else if(next.pages)setPages(next.pages);
    if(next.baselinePages)setBaseline(next.baselinePages);else if(next.pages)setBaseline(next.pages);setDirty(false);setAck(false);};
  async function load(reviewId?:string){setBusy(true);setError('');try{
    const r=await privateApiRequest(`${endpoint}${reviewId?`&review=${encodeURIComponent(reviewId)}`:''}`),data=await r.json();
    if(!r.ok)throw Error(data.error||'Không tải được bản hiệu đính.');consume(data);
  }catch(e){setError(e instanceof Error?e.message:'Không tải được bản hiệu đính.');}finally{setBusy(false);}}
  useEffect(()=>{void load();let stopped=false,doc:PDFDocumentProxy|undefined;
    void (async()=>{try{
      const r=await privateApiRequest(`${endpoint}&file=original`);if(!r.ok||Number(r.headers.get('Content-Length'))>20*1024*1024)throw Error('Không mở được PDF gốc.');
      const [{getDocument,GlobalWorkerOptions},worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      GlobalWorkerOptions.workerSrc=worker.default;doc=await getDocument({data:await r.arrayBuffer()}).promise;
      if(stopped)await doc.destroy();else setPdf(doc);
    }catch{if(!stopped)setError('Không mở được PDF gốc. Không phê duyệt khi chưa đối chiếu PDF.');}})();
    return()=>{stopped=true;if(doc)void doc.destroy();};
  },[documentId]);
  useEffect(()=>{let cancelled=false;let task:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
    setRendered(false);
    if(pdf&&canvas.current)void(async()=>{try{
      const p=await pdf.getPage(page);if(cancelled||!canvas.current)return;
      const viewport=p.getViewport({scale:1.3*zoom}),c=canvas.current,context=c.getContext('2d');if(!context)return;
      c.width=viewport.width;c.height=viewport.height;task=p.render({canvasContext:context,viewport});await task.promise;
      if(!cancelled)setRendered(true);
    }catch{if(!cancelled)setError('Không render được trang PDF gốc.');}})();
    return()=>{cancelled=true;task?.cancel();};
  },[pdf,page,zoom]);
  async function action(action:'create'|'save'|'approve'|'index'|'promote'){
    const review=loaded?.review;setBusy(true);setError('');
    try{
      const payload=action==='create'?{action,sourceHash:loaded?.document?.sourceHash,baseRevision:loaded?.document?.baseRevision}:
        {action,reviewId:review?.id,sequence:review?.sequence,draftHash:review?.draftHash,
          ...(action==='save'?{pages}:{}),...(action==='approve'?{confirmation:'I_REVIEWED_THE_ORIGINAL_PDF'}:{}),
          ...(action==='promote'?{confirmation:'PROMOTE_THIS_STAGING_REVISION'}:{})};
      const r=await privateApiRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),next=await r.json();
      if(!r.ok)throw Error(next.error||'Thao tác chưa hoàn tất.');consume(next);
      if(next.review?.id)await load(next.review.id);
    }catch(e){setError(e instanceof Error?e.message:'Thao tác chưa hoàn tất.');}finally{setBusy(false);}
  }
  const review=loaded?.review,editable=review?.state==='draft';
  return <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4" aria-label="Hiệu đính OCR staging">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#003375]">Hiệu đính OCR — staging</h2><p>{loaded?.document?.title}</p></div><button className="border rounded px-3 py-2" onClick={()=>{if(!dirty||window.confirm('Bỏ thay đổi chưa lưu?'))onClose();}}>Về kho tài liệu</button></div>
    <p className="my-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">Đối chiếu PDF gốc từng trang. Không đoán chữ, số quyết định hoặc hiệu lực. Lưu nháp không đổi revision đang phục vụ. Phê duyệt nội dung và promote là hai bước riêng.</p>
    {error&&<p role="alert" className="text-red-700 my-2">{error}</p>}
    {!review&&<div className="flex flex-wrap gap-2 my-3"><button disabled={busy||!loaded?.document} onClick={()=>void action('create')} className="bg-blue-800 text-white rounded px-3 py-2">Tạo bản nháp riêng</button>
      <select aria-label="Bản hiệu đính đã lưu" defaultValue="" onChange={e=>{if(e.target.value)void load(e.target.value);}} className="border rounded p-2 max-w-full"><option value="">Mở bản nháp đã lưu</option>{loaded?.reviews?.map((r,i)=><option key={r.id} value={r.id}>Bản {i+1} · {r.state} · {r.updated_at}</option>)}</select></div>}
    <div className="flex flex-wrap items-center gap-3 my-3"><button disabled={busy||page===1} onClick={()=>{setPage(page-1);setAck(false);}} className="border rounded p-2">Trang trước</button>
      <label>Trang PDF <select aria-label="Trang PDF" value={page} onChange={e=>{setPage(Number(e.target.value));setAck(false);}} className="border rounded p-2">{pages.map(p=><option key={p.pageNumber}>{p.pageNumber}</option>)}</select> / {pages.length}</label>
      <button disabled={busy||page===pages.length} onClick={()=>{setPage(page+1);setAck(false);}} className="border rounded p-2">Trang sau</button>
      <label>Độ phóng đại <select aria-label="Độ phóng đại" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="border rounded p-2"><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      <span className="text-sm text-slate-600">{review?`Trạng thái: ${review.state} · lần lưu ${review.sequence}`:'OCR tự động — chưa được Admin hiệu đính'}</span></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0"><h3 className="font-semibold mb-2">PDF gốc · trang {page}</h3><div className="overflow-auto max-h-[75vh] border rounded bg-slate-100"><canvas ref={canvas} aria-label={`PDF gốc trang ${page}`} className={zoom===1?'w-full h-auto':''}/></div><p className="text-sm" aria-live="polite">{rendered?'Đã hiển thị trang PDF gốc':'Đang mở trang PDF gốc…'}</p></div>
      <div className="min-w-0"><label className="font-semibold">{editable?'Bản nháp hiệu đính':'Văn bản nguồn'} · trang {page}<textarea aria-label="Nội dung hiệu đính trang" value={pages[page-1]?.text||''} readOnly={!editable||busy} onChange={e=>{const text=e.target.value;setPages(current=>current.map(p=>p.pageNumber===page?{...p,text}:p));setDirty(true);setAck(false);}} className="block mt-2 w-full min-h-[480px] rounded border p-3 text-sm font-mono whitespace-pre-wrap"/></label>
        <details className="mt-3"><summary>OCR tự động của base revision — không thay đổi</summary><pre className="whitespace-pre-wrap break-words text-sm border p-3">{baseline[page-1]?.text}</pre></details>
        <p className="text-sm mt-2">{review&&pages[page-1]?.text!==baseline[page-1]?.text?'Trang có chỉnh sửa của Admin (chỉ có hiệu lực sau phê duyệt và promote staging).':'Trang giữ nguyên văn bản OCR tự động.'}</p><p className="text-xs text-slate-500">Trang hiệu đính phải nằm trong giới hạn nguồn hiện tại: 8.000 ký tự / 32.000 byte gồm metadata. Không tự tăng giới hạn retrieval.</p></div>
    </div>
    {editable&&<div className="border-t mt-4 pt-4 space-y-3"><button disabled={busy||!dirty} onClick={()=>void action('save')} className="bg-blue-800 text-white rounded p-2">Lưu bản nháp</button>
      <label className="flex gap-2"><input type="checkbox" checked={ack} disabled={dirty||!rendered} onChange={e=>setAck(e.target.checked)}/>Tôi là Admin, đã đối chiếu các trang sửa với PDF gốc và chịu trách nhiệm phê duyệt bản nội dung đã lưu này.</label>
      <button disabled={busy||dirty||!ack||!rendered} onClick={()=>{if(window.confirm('Phê duyệt nội dung đã lưu? Bản phê duyệt sẽ bất biến; chưa promote revision.'))void action('approve');}} className="border border-blue-800 text-blue-800 rounded p-2 disabled:opacity-40">Phê duyệt nội dung đã đối chiếu</button></div>}
    {review&&['approved','index_failed'].includes(review.state)&&<button disabled={busy} onClick={()=>void action('index')} className="mt-4 border rounded p-2">Lập chỉ mục toàn bộ trang staging</button>}
    {loaded?.index&&<p className="mt-3">AI Search thực tế: {loaded.index.completedPages}/{loaded.index.pages} trang completed. {loaded.index.allPagesReady?'Đủ trang; chưa tự promote.':'Chưa đủ trang; không được promote.'}</p>}
    {review&&<button disabled={busy||dirty} onClick={()=>void load(review.id)} className="border rounded p-2 mt-3">Kiểm tra trạng thái thật</button>}
    {review?.state==='indexed'&&<div className="mt-3"><p>Promote cần phê duyệt riêng của chủ dự án. Mặc định đang khóa.</p><button disabled={busy||!loaded?.promotionEnabled||!loaded?.index?.allPagesReady} onClick={()=>{if(window.confirm('Chỉ promote staging sau khi được phê duyệt riêng?'))void action('promote');}} className="border rounded p-2 disabled:opacity-40">Promote revision staging</button></div>}
    {!!loaded?.history?.length&&<details className="mt-4"><summary>Lịch sử thay đổi server-side</summary><ol>{loaded.history.map((h,i)=><li key={i} className="text-sm">{h.changed_at} · {h.action} · lần lưu {h.sequence}</li>)}</ol><p className="text-sm">Danh tính phiên Admin, hash nguồn và nội dung trước/sau được lưu riêng trên server; không ghi ra telemetry.</p></details>}
  </section>;
}
