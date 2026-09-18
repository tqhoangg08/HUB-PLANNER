import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, Filter, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import { showAlert, showConfirm } from '../utils/appNotifications';
import {
  deleteAdminStudent,
  fetchAdminStudents,
  updateAdminStudent,
  type AdminStudent,
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
  const cache = useRef(new Map<string, AdminStudentPage>());

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
  const remove = async (student: AdminStudent) => {
    if (!student.student_code) return;
    const confirmed = await showConfirm({ title: 'Xóa tài khoản sinh viên?', message: 'Thao tác này cần quy trình xóa tài khoản có xác minh. Bạn có muốn tiếp tục kiểm tra quyền?', confirmText: 'Tiếp tục', cancelText: 'Hủy', variant: 'warning' });
    if (!confirmed) return;
    try { await deleteAdminStudent(student.student_code); refresh(); }
    catch (reason) { await showAlert({ title: 'Không thể xóa', message: reason instanceof Error ? reason.message : 'Vui lòng thử lại.', confirmText: 'Đóng', variant: 'info' }); }
  };
  const add = async () => showAlert({ title: 'Tạo sinh viên', message: 'Tài khoản sinh viên phải được tạo qua luồng đăng ký Better Auth để bảo toàn danh tính và mật khẩu.', confirmText: 'Đã hiểu', variant: 'info' });

  return <section className="w-full animate-fadeIn space-y-4">
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="text-2xl font-black text-[#003375] sm:text-[28px]">Quản lý sinh viên</h1><p className="mt-1 text-sm text-slate-500">Xem và quản lý thông tin sinh viên toàn trường</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={add} disabled={!isAdmin} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0052cc] px-3 text-sm font-bold text-white hover:bg-[#003d99] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16}/>Thêm sinh viên</button>
        <button type="button" onClick={onExport} disabled={!isAdmin} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16}/>Xuất Excel</button>
        <button type="button" onClick={refresh} disabled={loading} title="Làm mới" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button>
      </div>
    </header>
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(240px,1.8fr)_repeat(3,minmax(130px,1fr))_auto]">
      <label className="relative"><span className="sr-only">Tìm sinh viên</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="MSSV / họ tên / email" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#003375] focus:ring-2 focus:ring-blue-100"/></label>
      <input value={className} onChange={event => setClassName(event.target.value)} placeholder="Lọc lớp" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#003375]"/>
      <input value={major} onChange={event => setMajor(event.target.value)} placeholder="Khoa / ngành" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#003375]"/>
      <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#003375]"><option value="">Mọi trạng thái</option><option value="onboarded">Đã kích hoạt</option><option value="pending">Chưa hoàn tất</option></select>
      <div className="flex items-center gap-1 text-slate-500"><Filter size={16}/><input value={start} onChange={event => setStart(event.target.value)} type="date" aria-label="Từ ngày" className="h-10 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none"/><input value={end} onChange={event => setEnd(event.target.value)} type="date" aria-label="Đến ngày" className="h-10 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none"/></div>
    </div>
    {search.trim().length === 1 && <p className="text-sm text-amber-700">Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm.</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500"><tr>{['MSSV','Họ tên','Giới tính','Ngày sinh','Lớp','Khoa / Chuyên ngành','Số điện thoại','Email','Hoạt động gần nhất','Thao tác'].map(column => <th key={column} className="whitespace-nowrap border-b border-slate-200 px-4 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {loading && !page ? <tr><td colSpan={10} className="py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-[#0052cc]"/>Đang tải danh sách sinh viên…</td></tr> : error ? <tr><td colSpan={10} className="py-14 text-center text-red-700">{error}</td></tr> : !page?.data.length ? <tr><td colSpan={10} className="py-14 text-center text-slate-500"><Users className="mx-auto mb-2 text-slate-300"/>Không có sinh viên phù hợp.</td></tr> : page.data.map(student => <tr key={student.student_code || student.full_name} className="hover:bg-blue-50/40"><td className="px-4 py-3 font-bold text-[#0052cc]">{student.student_code || '—'}</td><td className="px-4 py-3 font-semibold text-slate-800">{student.full_name || 'Chưa cập nhật'}</td><td className="px-4 py-3 text-slate-500">—</td><td className="px-4 py-3 text-slate-500">—</td><td className="px-4 py-3 text-slate-600">{student.class_name || '—'}</td><td className="px-4 py-3 text-slate-600">{student.specialization_name || student.major_name || '—'}</td><td className="px-4 py-3 text-slate-500">—</td><td className="px-4 py-3 text-slate-600">{student.email_masked || '—'}</td><td className="px-4 py-3"><span className={student.status === 'onboarded' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700'}>{student.status === 'onboarded' ? 'Đã kích hoạt' : 'Chưa hoàn tất'}</span><p className="mt-1 text-xs text-slate-400">{formatDate(student.last_active_at)}</p></td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => setSelected(student)} title="Xem" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#003375]"><Eye size={16}/></button><button onClick={() => setSelected(student)} disabled={!isAdmin} title="Sửa" className="rounded-md p-2 text-slate-500 hover:bg-blue-50 hover:text-[#0052cc] disabled:opacity-40"><Pencil size={16}/></button><button onClick={() => void remove(student)} disabled={!isAdmin} title="Xóa" className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></div></td></tr>)}
      </tbody></table></div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-500">Trang {pageNumber} · {page?.data.length || 0} kết quả trong trang hiện tại</span><div className="flex items-center gap-2"><select value={limit} onChange={event => setLimit(Number(event.target.value))} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value={10}>10 / trang</option><option value={20}>20 / trang</option><option value={50}>50 / trang</option></select><button onClick={previousPage} disabled={cursorStack.length <= 1 || loading} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">Trước</button><button onClick={nextPage} disabled={!page?.has_more || loading} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">Sau</button></div></footer>
    </div>
    {selected && <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSelected(null)}><section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-black text-[#003375]">Hồ sơ sinh viên</h2><p className="text-sm text-slate-500">Chỉ hiển thị dữ liệu cần thiết cho quản trị.</p></div><button onClick={() => setSelected(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">MSSV</p><p className="mt-1 text-sm font-semibold text-slate-700">{selected.student_code || '—'}</p></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Email</p><p className="mt-1 text-sm font-semibold text-slate-700">{selected.email_masked || '—'}</p></div>{[['full_name','Họ tên'],['class_name','Lớp'],['cohort','Khóa'],['major_name','Ngành'],['specialization_name','Chuyên ngành']].map(([key,label]) => <label key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase text-slate-400">{label}</span>{isAdmin ? <input value={String(selected[key as keyof AdminStudent] || '')} onChange={event => setSelected(previous => previous ? { ...previous, [key]: event.target.value } : previous)} className="mt-1 w-full border-b border-slate-300 bg-transparent py-1 text-sm font-semibold text-slate-700 outline-none focus:border-[#003375]"/> : <p className="mt-1 text-sm font-semibold text-slate-700">{String(selected[key as keyof AdminStudent] || '—')}</p>}</label>)}</div><div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Trạng thái: <strong>{selected.status === 'onboarded' ? 'Đã kích hoạt' : 'Chưa hoàn tất'}</strong></div>{isAdmin && <button onClick={() => void edit()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0052cc] px-4 text-sm font-bold text-white hover:bg-[#003d99]"><Pencil size={16}/>Lưu thay đổi hồ sơ</button>}</section></div>}
  </section>;
};
