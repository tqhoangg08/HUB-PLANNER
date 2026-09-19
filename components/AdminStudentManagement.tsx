import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import { showAlert, showConfirm } from '../utils/appNotifications';
import {
  createAdminStudent,
  deleteAdminStudent,
  fetchAdminStudents,
  updateAdminStudent,
  type AdminStudent,
  type AdminStudentCreateInput,
  type AdminStudentFilters,
  type AdminStudentPage,
} from '../utils/adminStudentsApi';

const pageKey = (filters: AdminStudentFilters, limit: number, cursor: string | null) => JSON.stringify({ filters, limit, cursor });
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có dữ liệu';

export const AdminStudentManagement = ({ isAdmin, onExport }: { isAdmin: boolean; onExport: () => void }) => {
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [major, setMajor] = useState('');
  const [status, setStatus] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState<AdminStudentPage | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminStudent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AdminStudentCreateInput>({ studentCode: '', fullName: '' });
  const [mutationBusy, setMutationBusy] = useState(false);
  const cache = useRef(new Map<string, AdminStudentPage>());
  const createIdempotencyKey = useRef<string | null>(null);
  const deleteIdempotencyKeys = useRef(new Map<string, string>());

  const filters = useMemo<AdminStudentFilters>(() => ({
    q: search.trim(), className: className.trim(), major: major.trim(), status, start, end,
  }), [search, className, major, status, start, end]);
  const queryReady = !filters.q || filters.q.length >= 2;

  const load = async (nextCursor: string | null, force = false) => {
    if (!queryReady) { setPage(null); return; }
    const key = pageKey(filters, limit, nextCursor);
    if (!force && cache.current.has(key)) { setPage(cache.current.get(key)!); setCursor(nextCursor); return; }
    setLoading(true); setError('');
    try {
      const result = await fetchAdminStudents(filters, limit, nextCursor);
      cache.current.set(key, result);
      setPage(result); setCursor(nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách sinh viên.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCursorStack([null]); setPageNumber(1); void load(null);
    }, filters.q ? 400 : 0);
    return () => window.clearTimeout(timer);
  // Cache is intentionally memory-only; never persist PII in browser storage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, limit, queryReady]);

  const refresh = () => { cache.current.clear(); void load(cursor, true); };
  const nextPage = () => {
    if (!page?.next_cursor) return;
    const next = page.next_cursor;
    setCursorStack(previous => [...previous, next]); setPageNumber(previous => previous + 1); void load(next);
  };
  const previousPage = () => {
    if (cursorStack.length <= 1) return;
    const nextStack = cursorStack.slice(0, -1); const previousCursor = nextStack[nextStack.length - 1];
    setCursorStack(nextStack); setPageNumber(previous => Math.max(1, previous - 1)); void load(previousCursor);
  };
  const edit = async () => {
    if (!selected?.student_code) return;
    const result = await showConfirm({ title: 'Chỉnh sửa hồ sơ', message: 'Lưu thay đổi họ tên, lớp và chuyên ngành cho sinh viên này?', confirmText: 'Lưu thay đổi', cancelText: 'Hủy', variant: 'question' });
    if (!result) return;
    try {
      await updateAdminStudent(selected.student_code, { fullName: selected.full_name || '', className: selected.class_name || '', cohort: selected.cohort || '', programName: selected.program_name || '', majorName: selected.major_name || '', specializationName: selected.specialization_name || '' });
      setSelected(null); refresh();
    } catch (reason) { await showAlert({ title: 'Không thể lưu', message: reason instanceof Error ? reason.message : 'Vui lòng thử lại.', confirmText: 'Đóng', variant: 'error' }); }
  };
  const insertCurrentPage = (student: AdminStudent) => {
    cache.current.clear();
    setPage(previous => previous ? { ...previous, data: [student, ...previous.data.filter(item => item.student_code !== student.student_code)].slice(0, limit) } : previous);
  };
  const remove = async (student: AdminStudent) => {
    if (!student.student_code) return;
    const confirmed = await showConfirm({ title: 'Xóa tài khoản sinh viên?', message: 'Thao tác này cần quy trình xóa tài khoản có xác minh. Bạn có muốn tiếp tục kiểm tra quyền?', confirmText: 'Tiếp tục', cancelText: 'Hủy', variant: 'warning' });
    if (!confirmed) return;
    setMutationBusy(true);
    try {
      const key = deleteIdempotencyKeys.current.get(student.student_code) || crypto.randomUUID();
      deleteIdempotencyKeys.current.set(student.student_code, key);
      await deleteAdminStudent(student.student_code, key);
      cache.current.clear(); setPage(previous => previous ? { ...previous, data: previous.data.filter(item => item.student_code !== student.student_code) } : previous);
      deleteIdempotencyKeys.current.delete(student.student_code);
    }
    catch (reason) { await showAlert({ title: 'Không thể xóa', message: reason instanceof Error ? reason.message : 'Vui lòng thử lại.', confirmText: 'Đóng', variant: 'info' }); }
    finally { setMutationBusy(false); }
  };
  const add = () => { createIdempotencyKey.current = null; setCreateDraft({ studentCode: '', fullName: '' }); setCreateOpen(true); };
  const submitCreate = async () => {
    setMutationBusy(true);
    try {
      const key = createIdempotencyKey.current || crypto.randomUUID();
      createIdempotencyKey.current = key;
      const result = await createAdminStudent(createDraft, key);
      insertCurrentPage(result.student); setCreateOpen(false); createIdempotencyKey.current = null;
      await showAlert({ title: 'Đã tạo sinh viên', message: 'Đã gửi email để sinh viên tự đặt mật khẩu.', confirmText: 'Đã hiểu', variant: 'success' });
    } catch (reason) { await showAlert({ title: 'Không thể tạo', message: reason instanceof Error ? reason.message : 'Vui lòng thử lại.', confirmText: 'Đóng', variant: 'error' }); }
    finally { setMutationBusy(false); }
  };

  return <section className="w-full animate-fadeIn space-y-5" aria-labelledby="student-management-title">
    <header className="border-b border-slate-200 pb-4">
      <h1 id="student-management-title" className="text-[26px] font-black tracking-tight text-[#003375] sm:text-[28px]">Quản lý sinh viên</h1>
      <p className="mt-1 text-sm text-slate-500">Quản lý và tra cứu thông tin sinh viên</p>
    </header>

    <section aria-label="Bộ lọc sinh viên" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(245px,1.45fr)_minmax(150px,.8fr)_minmax(170px,.95fr)_minmax(160px,.85fr)_minmax(260px,1fr)]">
        <label className="grid gap-1.5"><span className="text-[12px] font-bold text-slate-700">Tìm kiếm</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="MSSV, họ tên, email..." className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"/></span></label>
        <label className="grid gap-1.5"><span className="text-[12px] font-bold text-slate-700">Lớp</span><input value={className} onChange={event => setClassName(event.target.value)} placeholder="Tất cả / Lọc lớp" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"/></label>
        <label className="grid gap-1.5"><span className="text-[12px] font-bold text-slate-700">Khoa / Ngành</span><input value={major} onChange={event => setMajor(event.target.value)} placeholder="Tất cả" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"/></label>
        <label className="grid gap-1.5"><span className="text-[12px] font-bold text-slate-700">Trạng thái</span><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"><option value="">Tất cả</option><option value="onboarded">Đã kích hoạt</option><option value="pending">Chưa hoàn tất</option></select></label>
        <fieldset className="grid gap-1.5"><legend className="text-[12px] font-bold text-slate-700">Khoảng thời gian</legend><div className="grid grid-cols-2 gap-2"><input value={start} onChange={event => setStart(event.target.value)} type="date" aria-label="Từ ngày" className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"/><input value={end} onChange={event => setEnd(event.target.value)} type="date" aria-label="Đến ngày" className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100"/></div></fieldset>
      </div>
    </section>

    <div className="flex flex-wrap items-center gap-2" aria-label="Thao tác quản lý sinh viên">
      <button type="button" onClick={add} disabled={!isAdmin || mutationBusy} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0052cc] px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#003d99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={17}/>Thêm sinh viên</button>
      <button type="button" onClick={onExport} disabled={!isAdmin} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc] disabled:cursor-not-allowed disabled:opacity-50"><Download size={17}/>Xuất Excel</button>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc] disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>Làm mới</button>
    </div>

    {search.trim().length === 1 && <p role="status" className="text-sm text-amber-700">Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm.</p>}

    <section aria-label="Danh sách sinh viên" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[1380px] w-full border-collapse text-left text-[13px]"><thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-600"><tr>{['MSSV','Họ tên','Giới tính','Ngày sinh','Lớp','Khóa','Khoa / Chuyên ngành','Số điện thoại','Email','Hoạt động gần nhất','Thao tác'].map((column, index) => <th key={column} scope="col" className={`whitespace-nowrap border-b border-slate-200 px-4 py-3 ${index < 10 ? 'border-r border-slate-200/80' : 'sticky right-0 z-10 bg-slate-50 text-center'}`}>{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-200/80">
        {loading && !page ? <tr><td colSpan={11} className="py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-[#0052cc]"/>Đang tải danh sách sinh viên…</td></tr> : error ? <tr><td colSpan={11} className="py-14 text-center text-red-700">{error}</td></tr> : !page?.data.length ? <tr><td colSpan={11} className="py-14 text-center text-slate-500"><Users className="mx-auto mb-2 text-slate-300"/>Không có sinh viên phù hợp.</td></tr> : page.data.map(student => <tr key={student.student_code || student.full_name} className="group hover:bg-blue-50/35"><td className="border-r border-slate-200/80 px-4 py-3.5 font-bold text-[#0052cc]"><button type="button" onClick={() => setSelected(student)} className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]">{student.student_code || '—'}</button></td><td className="border-r border-slate-200/80 px-4 py-3.5 font-semibold text-slate-800">{student.full_name || 'Chưa cập nhật'}</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-500">—</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-500">—</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-600">{student.class_name || '—'}</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-600">{student.cohort || '—'}</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-600">{student.specialization_name || student.major_name || '—'}</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-500">—</td><td className="border-r border-slate-200/80 px-4 py-3.5 text-slate-600">{student.email_masked || '—'}</td><td className="border-r border-slate-200/80 px-4 py-2.5"><span className={student.status === 'onboarded' ? 'inline-flex rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700' : 'inline-flex rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700'}>{student.status === 'onboarded' ? 'Đã kích hoạt' : 'Chưa hoàn tất'}</span><p className="mt-1 whitespace-nowrap text-[11px] text-slate-400">{formatDate(student.last_active_at)}</p></td><td className="sticky right-0 z-[1] bg-white px-3 py-2.5 text-center group-hover:bg-blue-50/35"><div className="flex justify-center gap-1"><button type="button" onClick={() => setSelected(student)} title="Xem hồ sơ sinh viên" aria-label={`Xem ${student.student_code || 'sinh viên'}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-[#003375] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]"><Eye size={15}/></button><button type="button" onClick={() => setSelected(student)} disabled={!isAdmin || mutationBusy} title="Sửa hồ sơ sinh viên" aria-label={`Sửa ${student.student_code || 'sinh viên'}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#0052cc] transition hover:border-blue-200 hover:bg-white disabled:opacity-40"><Pencil size={15}/></button><button type="button" onClick={() => void remove(student)} disabled={!isAdmin || mutationBusy} title="Xóa sinh viên" aria-label={`Xóa ${student.student_code || 'sinh viên'}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-red-600 transition hover:border-red-200 hover:bg-white disabled:opacity-40"><Trash2 size={15}/></button></div></td></tr>)}
      </tbody></table></div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-500">Trang {pageNumber} · Hiển thị {page?.data.length || 0} kết quả của trang hiện tại</span><div className="flex items-center gap-2"><select aria-label="Số kết quả mỗi trang" value={limit} onChange={event => setLimit(Number(event.target.value))} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value={10}>10 / trang</option><option value={20}>20 / trang</option><option value={50}>50 / trang</option></select><button type="button" onClick={previousPage} disabled={cursorStack.length <= 1 || loading} aria-label="Trang trước" title="Trang trước" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16}/></button><span aria-current="page" className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-[#0052cc] px-2 text-xs font-bold text-white">{pageNumber}</span><button type="button" onClick={nextPage} disabled={!page?.has_more || loading} aria-label="Trang sau" title="Trang sau" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16}/></button></div></footer>
    </section>
    {selected && <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSelected(null)}><section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-black text-[#003375]">Hồ sơ sinh viên</h2><p className="text-sm text-slate-500">Chỉ hiển thị dữ liệu cần thiết cho quản trị.</p></div><button onClick={() => setSelected(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">MSSV</p><p className="mt-1 text-sm font-semibold text-slate-700">{selected.student_code || '—'}</p></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Email</p><p className="mt-1 text-sm font-semibold text-slate-700">{selected.email_masked || '—'}</p></div>{[['full_name','Họ tên'],['class_name','Lớp'],['cohort','Khóa'],['major_name','Ngành'],['specialization_name','Chuyên ngành']].map(([key,label]) => <label key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase text-slate-400">{label}</span>{isAdmin ? <input value={String(selected[key as keyof AdminStudent] || '')} onChange={event => setSelected(previous => previous ? { ...previous, [key]: event.target.value } : previous)} className="mt-1 w-full border-b border-slate-300 bg-transparent py-1 text-sm font-semibold text-slate-700 outline-none focus:border-[#003375]"/> : <p className="mt-1 text-sm font-semibold text-slate-700">{String(selected[key as keyof AdminStudent] || '—')}</p>}</label>)}</div><div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Trạng thái: <strong>{selected.status === 'onboarded' ? 'Đã kích hoạt' : 'Chưa hoàn tất'}</strong></div>{isAdmin && <button onClick={() => void edit()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0052cc] px-4 text-sm font-bold text-white hover:bg-[#003d99]"><Pencil size={16}/>Lưu thay đổi hồ sơ</button>}</section></div>}
    {createOpen && <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"><section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-[#003375]">Thêm sinh viên</h2><p className="mt-1 text-sm text-slate-500">Hệ thống gửi email để sinh viên tự đặt mật khẩu; quản trị viên không nhập hoặc xem mật khẩu.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{([['studentCode','MSSV'],['fullName','Họ tên'],['className','Lớp'],['cohort','Khóa'],['majorName','Ngành'],['specializationName','Chuyên ngành']] as const).map(([key,label]) => <label key={key} className="grid gap-1 text-sm font-bold text-slate-600"><span>{label}</span><input value={createDraft[key] || ''} onChange={event => setCreateDraft(previous => ({ ...previous, [key]: event.target.value }))} className="h-10 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-[#003375]"/></label>)}</div><div className="mt-6 flex justify-end gap-2"><button disabled={mutationBusy} onClick={() => setCreateOpen(false)} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700">Hủy</button><button disabled={mutationBusy || createDraft.studentCode.trim().length < 3 || createDraft.fullName.trim().length < 2} onClick={() => void submitCreate()} className="h-10 rounded-lg bg-[#0052cc] px-4 text-sm font-bold text-white disabled:opacity-50">{mutationBusy ? 'Đang tạo…' : 'Tạo và gửi lời mời'}</button></div></section></div>}
  </section>;
};
