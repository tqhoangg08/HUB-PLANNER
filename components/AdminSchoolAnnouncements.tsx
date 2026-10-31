import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Filter, MoreHorizontal, Plus, RefreshCw, Search, Send, Star, X } from 'lucide-react';
import { Overlay } from './Overlay';
import { ANNOUNCEMENT_PUSH_LABELS, type AdminSchoolAnnouncement } from '../shared/schoolAnnouncements';
import { fetchAdminAnnouncement, fetchAdminAnnouncements, mutateAdminAnnouncement, type AnnouncementList } from '../utils/adminAnnouncementsApi';
import { vietnamCalendarDate } from '../utils/schoolAnnouncementRecency';
import './admin-school-announcements.css';

type Form = Pick<AdminSchoolAnnouncement,'title'|'link'|'department'|'date'|'is_hidden'|'is_highlighted'>;
const formOf = (row:AdminSchoolAnnouncement):Form => ({title:row.title,link:row.link,department:row.department,date:row.date,is_hidden:row.is_hidden,is_highlighted:row.is_highlighted});
const pending = (row:AdminSchoolAnnouncement) => ['queued','processing','retrying'].includes(row.push_state);
const formatDate = (date:string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : '—';
const PushState = ({row}:{row:AdminSchoolAnnouncement}) => <span className={`ann-push state-${row.push_state}`} title={`${row.push_sent_count} thành công · ${row.push_failed_count} lỗi · ${row.push_skipped_count} bỏ qua`}><i/>{ANNOUNCEMENT_PUSH_LABELS[row.push_state]}</span>;

export function AdminSchoolAnnouncements({isAdmin=true}:{isAdmin?:boolean}) {
  const initial = {search:'',department:'',visibility:'',startDate:'',endDate:'',push:'',highlighted:'',sort:'desc',page:1,limit:20};
  const [request,setRequest]=useState(initial), [search,setSearch]=useState(''), [advanced,setAdvanced]=useState(false);
  const [list,setList]=useState<AnnouncementList>({data:[],total:0,departments:[],role:'auditor'});
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[refresh,setRefresh]=useState(0);
  const [detail,setDetail]=useState<AdminSchoolAnnouncement|null>(null),[draft,setDraft]=useState<Form|null>(null);
  const [busy,setBusy]=useState(false), [selected,setSelected]=useState<Set<number>>(new Set());
  const [menu,setMenu]=useState<{row:AdminSchoolAnnouncement;x:number;y:number}|null>(null);
  const [wide,setWide]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(min-width:1400px)').matches);
  const dialog=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),lock=useRef(false),draftRef=useRef(draft),detailRef=useRef(detail);
  draftRef.current=draft;detailRef.current=detail;
  const canWrite=isAdmin&&list.role==='admin';
  const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(detail?formOf(detail):{title:'',link:'',department:'',date:vietnamCalendarDate(),is_hidden:false,is_highlighted:false});
  const change = (key:keyof typeof initial,value:string) => setRequest(old=>({...old,[key]:value,page:1}));
  useEffect(()=>{const timer=setTimeout(()=>setRequest(old=>old.search===search?old:{...old,search,page:1}),300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{setSelected(new Set());},[request]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;setLoading(true);setError('');
    const params=new URLSearchParams({limit:String(request.limit),offset:String((request.page-1)*request.limit)});
    for(const [key,value]of Object.entries(request))if(!['limit','page'].includes(key)&&value)params.set(key,String(value));
    fetchAdminAnnouncements(params,controller.signal).then(async result=>{
      if(!active)return;setList(result);
      const current=detailRef.current;
      const latest=result.data.find(row=>row.id===current?.id) || (current ? (await fetchAdminAnnouncement(current.id,controller.signal)).data : null);
      if(!active)return;
      const form=draftRef.current, selectedDetail=detailRef.current;
      if(current&&latest&&selectedDetail?.id===current.id&&JSON.stringify(form)===JSON.stringify(formOf(selectedDetail))){setDraft(formOf(latest));setDetail(latest);}
      const max=Math.max(1,Math.ceil(result.total/request.limit));if(request.page>max)setRequest(old=>({...old,page:max}));
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Không thể tải thông báo.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[request,refresh]);
  useEffect(()=>{
    if(!list.data.some(pending)&&!(detail&&pending(detail)))return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);},8000);
    return()=>clearInterval(timer);
  },[list.data,detail?.id,detail?.push_state]);
  useEffect(()=>{const media=window.matchMedia('(min-width:1400px)');const resize=()=>setWide(media.matches);media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
  useEffect(()=>{
    const panel=dialog.current;if(!draft||!wide||!panel)return;
    let frame=0;
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{panel.style.maxHeight=`${Math.max(220,window.innerHeight-panel.getBoundingClientRect().top-24)}px`;});};
    const observer=new ResizeObserver(resize),filters=panel.closest('.ann-admin')?.querySelector('.ann-admin-filters');
    if(filters)observer.observe(filters);resize();
    window.addEventListener('resize',resize);window.addEventListener('scroll',resize,true);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();panel.style.removeProperty('max-height');window.removeEventListener('resize',resize);window.removeEventListener('scroll',resize,true);};
  },[!!draft,wide]);
  const discard = () => !dirty || window.confirm('Bỏ các thay đổi chưa lưu?');
  const close = () => {if(busy||!discard())return;setDraft(null);setDetail(null);opener.current?.focus();};
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    if(!draft||wide)return;
    dialog.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key==='Tab'){
        const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')||[]).filter(node=>node.getClientRects().length);
        const first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[!!draft,wide]);
  useEffect(()=>{
    if(!menu)return;
    const dismiss=()=>setMenu(null);const key=(event:KeyboardEvent)=>{if(event.key==='Escape')dismiss();};
    document.addEventListener('click',dismiss);window.addEventListener('resize',dismiss);document.addEventListener('scroll',dismiss,true);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('click',dismiss);window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',dismiss,true);document.removeEventListener('keydown',key);};
  },[menu]);
  const open = (row:AdminSchoolAnnouncement,event:React.MouseEvent<HTMLElement>) => {
    if(!discard())return;opener.current=event.currentTarget;setDetail(row);setDraft(formOf(row));setMenu(null);setFeedback('');
  };
  const mutate = async (method:'POST'|'PATCH'|'DELETE',body:Record<string,unknown>,message:string) => {
    if(lock.current||!canWrite)return;lock.current=true;setBusy(true);setError('');setFeedback('');setMenu(null);
    try {
      const result=await mutateAdminAnnouncement(method,body);
      setFeedback(body.action==='push' ? result.deduplicated?'Thông báo đã có yêu cầu push; không gửi trùng.':result.signaled?'Đã đưa vào hàng đợi push.':'Đã lưu hàng đợi; hệ thống sẽ thử xử lý lại.' : message);
      if(body.action!=='push'||detailRef.current?.id===result.data?.id){setDetail(result.data);setDraft(result.data?formOf(result.data):null);}
      setRefresh(value=>value+1);return result;
    } catch(reason) {setError(reason instanceof Error?reason.message:'Không thể lưu thông báo.');}
    finally {lock.current=false;setBusy(false);}
  };
  const save = (event:React.FormEvent) => {
    event.preventDefault();if(!draft||(detail&&!dirty))return;
    const original=detail?formOf(detail):null;
    const fields=original?Object.fromEntries(Object.entries(draft).filter(([key,value])=>value!==original[key as keyof Form])):draft;
    void mutate(detail?'PATCH':'POST',{...fields,...(detail?{id:detail.id,expectedRevision:detail.admin_revision}:{})},'Đã lưu thông báo.');
  };
  const push = (row:AdminSchoolAnnouncement) => {
    if(row.is_hidden||row.push_state!=='none'||(detail?.id===row.id&&dirty)||busy||!canWrite)return;
    if(window.confirm(`Gửi push thông báo “${row.title}” đến các thiết bị đã đăng ký nhận tin từ trường?`))void mutate('POST',{action:'push',id:row.id},'');
  };
  const patch = (row:AdminSchoolAnnouncement,fields:Partial<Form>) => {if(!discard())return;void mutate('PATCH',{id:row.id,expectedRevision:row.admin_revision,...fields},'Đã cập nhật thông báo.');};
  const remove = (row:AdminSchoolAnnouncement) => {if(discard()&&window.confirm(`Xóa thông báo “${row.title}”?`))void mutate('DELETE',{id:row.id,expectedRevision:row.admin_revision},'Đã xóa thông báo.');};
  const bulk = async (action:'show'|'hide'|'delete') => {
    if(lock.current||!canWrite||!selected.size||!discard()||!window.confirm(`Áp dụng thao tác cho ${selected.size} thông báo đã chọn?`))return;
    lock.current=true;setBusy(true);setError('');let changed=0;
    try {for(const row of list.data.filter(item=>selected.has(item.id))){await mutateAdminAnnouncement(action==='delete'?'DELETE':'PATCH',{id:row.id,expectedRevision:row.admin_revision,...(action==='delete'?{}:{is_hidden:action==='hide'})});changed++;}setFeedback(`Đã cập nhật ${changed} thông báo.`);setDraft(null);setDetail(null);}
    catch(reason){setError(`${changed} thông báo đã cập nhật. ${reason instanceof Error?reason.message:'Thao tác bị gián đoạn.'}`);}
    finally{lock.current=false;setBusy(false);setSelected(new Set());setRefresh(value=>value+1);}
  };
  const checkbox = (row:AdminSchoolAnnouncement) => <input type="checkbox" aria-label={`Chọn thông báo ${row.id}`} checked={selected.has(row.id)} onChange={event=>setSelected(old=>{const next=new Set(old);event.target.checked?next.add(row.id):next.delete(row.id);return next;})}/>;
  const featured = (row:AdminSchoolAnnouncement) => row.is_highlighted?<Star size={14} className="ann-star" fill="currentColor" aria-label="Nổi bật"/>:null;
  const more = (row:AdminSchoolAnnouncement) => <button type="button" className="ann-icon" aria-label={`Thao tác thông báo ${row.id}`} aria-expanded={menu?.row.id===row.id} onClick={event=>{event.stopPropagation();const box=event.currentTarget.getBoundingClientRect();setMenu(menu?.row.id===row.id?null:{row,x:Math.max(8,Math.min(box.right-196,window.innerWidth-204)),y:Math.max(8,Math.min(box.bottom+4,window.innerHeight-252))});}}><MoreHorizontal size={18}/></button>;
  const visibility = (row:AdminSchoolAnnouncement) => <span className={`ann-pill ${row.is_hidden?'hidden-state':'visible-state'}`}>{row.is_hidden?'Đã ẩn':'Đang hiển thị'}</span>;
  const drawer = draft && <div ref={dialog} className="ann-admin-drawer" role={wide?'region':'dialog'} aria-modal={wide?undefined:true} aria-labelledby="ann-detail-title" tabIndex={-1}>
    <header><div><h2 id="ann-detail-title">{detail?'Chi tiết thông báo':'Thêm thông báo'}</h2><p>{detail?.source_kind==='crawler'?'Tự động từ website trường':'Thêm thủ công'}</p></div><button className="ann-icon" aria-label="Đóng chi tiết" onClick={close}><X size={19}/></button></header>
    <form onSubmit={save}>
      <div className="ann-drawer-body">{error&&<div className="ann-error" role="alert">{error}</div>}{feedback&&<p role="status" className="ann-feedback">{feedback}</p>}<label>Tiêu đề<textarea aria-label="Tiêu đề" required maxLength={500} rows={3} value={draft.title} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <label>URL nguồn<input required type="url" maxLength={2048} value={draft.link} readOnly={detail?.source_kind==='crawler'} title={detail?.source_kind==='crawler'?'URL định danh của crawler được giữ cố định':undefined} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,link:event.target.value})}/></label>
        <label>Đơn vị<input list="ann-units" maxLength={160} value={draft.department} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,department:event.target.value})}/><datalist id="ann-units">{list.departments.map(unit=><option key={unit} value={unit}/>)}</datalist></label>
        <div className="ann-form-grid"><label>Ngày đăng<input required={!detail||!!detail.date} type="date" value={draft.date} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,date:event.target.value})}/></label><label>Trạng thái<select value={String(draft.is_hidden)} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,is_hidden:event.target.value==='true'})}><option value="false">Đang hiển thị</option><option value="true">Đã ẩn</option></select></label></div>
        <label className="ann-highlight-control"><span><Star size={16}/>Nổi bật</span><input type="checkbox" role="switch" checked={draft.is_highlighted} disabled={!canWrite||busy} onChange={event=>setDraft({...draft,is_highlighted:event.target.checked})}/></label>
        {detail&&<section className="ann-push-panel" aria-label="Trạng thái gửi push"><div><strong>Push</strong><PushState row={detail}/><small>{detail.push_sent_count} thành công · {detail.push_failed_count} lỗi · {detail.push_skipped_count} bỏ qua</small>{detail.push_sent_at&&<small>{new Date(detail.push_sent_at).toLocaleString('vi-VN')}</small>}</div>{canWrite&&<button type="button" className="ann-btn" disabled={busy||dirty||detail.is_hidden||detail.push_state!=='none'} onClick={()=>push(detail)}><Send size={14}/>Gửi push</button>}</section>}
      </div><footer>{/^https?:\/\//.test(draft.link)&&<a className="ann-btn" href={draft.link} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Mở trang gốc</a>}<div><button type="button" className="ann-btn" onClick={close}>Đóng</button>{canWrite&&<button className="ann-btn primary" type="submit" disabled={busy}>{busy?'Đang lưu…':'Lưu thay đổi'}</button>}</div></footer>
    </form>
  </div>;
  return <section className="ann-admin">
    <div className="ann-admin-heading"><div><h1>Quản lý thông báo trường</h1><span>Tự động từ website trường</span></div><div><button className="ann-btn" disabled={loading||busy} onClick={()=>setRefresh(value=>value+1)} aria-label="Làm mới thông báo"><RefreshCw size={16}/><span>Làm mới</span></button>{canWrite&&<button className="ann-btn primary" onClick={event=>{if(discard()){opener.current=event.currentTarget;setDetail(null);setDraft({title:'',link:'',department:'',date:vietnamCalendarDate(),is_hidden:false,is_highlighted:false});}}}><Plus size={17}/>Thêm thông báo</button>}</div></div>
    {error&&!draft&&<div className="ann-error" role="alert">{error}<button onClick={()=>setRefresh(value=>value+1)}>Tải lại</button></div>}{feedback&&!draft&&<p role="status" className="ann-feedback">{feedback}</p>}
    <div className="ann-admin-filters" aria-label="Bộ lọc thông báo"><label className="ann-search"><Search size={17}/><input type="search" aria-label="Tìm thông báo" placeholder="Tìm tiêu đề, đơn vị hoặc liên kết…" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <select aria-label="Lọc đơn vị" value={request.department} onChange={event=>change('department',event.target.value)}><option value="">Tất cả đơn vị</option>{list.departments.map(unit=><option key={unit}>{unit}</option>)}</select>
      <select aria-label="Lọc trạng thái" value={request.visibility} onChange={event=>change('visibility',event.target.value)}><option value="">Tất cả trạng thái</option><option value="visible">Đang hiển thị</option><option value="hidden">Đã ẩn</option></select>
      <button className="ann-btn" aria-expanded={advanced} onClick={()=>setAdvanced(value=>!value)}><Filter size={16}/>Bộ lọc</button>
      {advanced&&<div className="ann-advanced"><label>Từ ngày<input type="date" value={request.startDate} onChange={event=>change('startDate',event.target.value)}/></label><label>Đến ngày<input type="date" value={request.endDate} onChange={event=>change('endDate',event.target.value)}/></label><label>Trạng thái push<select value={request.push} onChange={event=>change('push',event.target.value)}><option value="">Tất cả</option>{Object.entries(ANNOUNCEMENT_PUSH_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Sắp xếp<select value={request.sort} onChange={event=>change('sort',event.target.value)}><option value="desc">Mới nhất</option><option value="asc">Cũ nhất</option></select></label><label className="ann-checkbox"><input type="checkbox" checked={!!request.highlighted} onChange={event=>change('highlighted',event.target.checked?'true':'')}/>Chỉ nổi bật</label><button className="ann-btn" onClick={()=>{setSearch('');setRequest(initial);}}>Xóa bộ lọc</button></div>}
    </div>
    <div className={`ann-admin-workspace ${wide&&draft?'has-detail':''}`}><div className="ann-admin-table-panel" aria-busy={loading}>
      <div className="ann-table-scroll"><table aria-label="Danh sách quản lý thông báo"><thead><tr><th className="ann-check"><input type="checkbox" aria-label="Chọn tất cả trang" checked={!!list.data.length&&list.data.every(row=>selected.has(row.id))} onChange={event=>setSelected(event.target.checked?new Set(list.data.map(row=>row.id)):new Set())}/></th><th>Tiêu đề</th><th>Đơn vị</th><th>Ngày đăng</th><th>Trạng thái</th><th>Push</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{list.data.map(row=><tr key={row.id} className={detail?.id===row.id?'current':''}><td className="ann-check">{checkbox(row)}</td><td><div className="ann-row-title">{featured(row)}<button title={row.title} onClick={event=>open(row,event)}>{row.title}</button></div></td><td title={row.department}>{row.department}</td><td>{formatDate(row.date)}</td><td>{visibility(row)}</td><td><PushState row={row}/></td><td>{more(row)}</td></tr>)}</tbody></table></div>
      <div className="ann-mobile-rows">{list.data.map(row=><article key={row.id}>{checkbox(row)}<div><div className="ann-row-title">{featured(row)}<button onClick={event=>open(row,event)}>{row.title}</button></div><p>{row.department} · {formatDate(row.date)}</p><div className="ann-mobile-status">{visibility(row)}<PushState row={row}/></div></div>{more(row)}</article>)}</div>
      {!list.data.length&&<p className="ann-empty">{loading?'Đang tải thông báo…':error?'Không tải được dữ liệu.':'Không có thông báo phù hợp.'}</p>}
      <div className="ann-table-footer"><div>{selected.size?<><span>Đã chọn {selected.size}</span>{canWrite&&<><button className="ann-btn" disabled={busy} onClick={()=>void bulk('show')}>Hiện</button><button className="ann-btn" disabled={busy} onClick={()=>void bulk('hide')}>Ẩn</button><button className="ann-btn danger" disabled={busy} onClick={()=>void bulk('delete')}>Xóa</button></>}</>:<span>{list.total} thông báo</span>}</div><div><select aria-label="Số dòng mỗi trang" value={request.limit} onChange={event=>setRequest(old=>({...old,limit:Number(event.target.value),page:1}))}><option value={20}>20 / trang</option><option value={50}>50 / trang</option></select><button className="ann-icon" aria-label="Trang trước" disabled={request.page===1||loading} onClick={()=>setRequest(old=>({...old,page:old.page-1}))}><ChevronLeft size={17}/></button><span>{request.page} / {Math.max(1,Math.ceil(list.total/request.limit))}</span><button className="ann-icon" aria-label="Trang sau" disabled={request.page*request.limit>=list.total||loading} onClick={()=>setRequest(old=>({...old,page:old.page+1}))}><ChevronRight size={17}/></button></div></div>
    </div>{wide&&drawer}</div>
    {!wide&&drawer&&<Overlay className="ann-admin-drawer-overlay" onClick={event=>{if(event.target===event.currentTarget)close();}}>{drawer}</Overlay>}
    {menu&&createPortal(<div role="menu" aria-label="Thao tác thông báo" className="ann-admin-menu" style={{left:menu.x,top:menu.y}} onClick={event=>event.stopPropagation()}><button role="menuitem" onClick={event=>open(menu.row,event)}>Xem chi tiết</button><a role="menuitem" href={menu.row.link} target="_blank" rel="noreferrer">Mở trang gốc</a>{canWrite&&<><button role="menuitem" disabled={busy} onClick={()=>patch(menu.row,{is_highlighted:!menu.row.is_highlighted})}>{menu.row.is_highlighted?'Bỏ nổi bật':'Làm nổi bật'}</button><button role="menuitem" disabled={busy||menu.row.is_hidden||menu.row.push_state!=='none'} onClick={()=>push(menu.row)}>Gửi push</button><button role="menuitem" disabled={busy} onClick={()=>patch(menu.row,{is_hidden:!menu.row.is_hidden})}>{menu.row.is_hidden?'Hiện thông báo':'Ẩn thông báo'}</button><button role="menuitem" className="danger" disabled={busy} onClick={()=>remove(menu.row)}>Xóa thông báo</button></>}</div>,document.body)}
  </section>;
}
