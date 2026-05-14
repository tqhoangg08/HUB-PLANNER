import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    Database,
    Eye,
    Filter,
    Globe,
    Loader2,
    Monitor,
    RefreshCw,
    Search,
    Smartphone,
    X,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { playClick } from '../utils/audio';

type JsonRecord = Record<string, unknown>;

type ActivityLogRow = {
    id: number;
    created_at: string;
    user_id?: string | null;
    user_email?: string | null;
    user_role?: string | null;
    action?: string | null;
    action_label?: string | null;
    target_table?: string | null;
    table_name?: string | null;
    target_id?: string | null;
    record_id?: string | null;
    page_path?: string | null;
    status?: 'success' | 'error' | 'warning' | string | null;
    metadata?: JsonRecord | null;
    old_data?: JsonRecord | null;
    new_data?: JsonRecord | null;
    details?: { old?: JsonRecord | null; new?: JsonRecord | null } | null;
    error_message?: string | null;
    ip_address?: string | null;
    device_info?: string | null;
};

type UserRoleRow = {
    id?: string | null;
    user_id?: string | null;
    role?: string | null;
};

type ProfileRoleRow = {
    id: string;
    email?: string | null;
};

interface ActivityLogModalProps {
    onClose?: () => void;
}

const PAGE_SIZE = 30;

const actionLabels: Record<string, string> = {
    login: 'Đăng nhập',
    logout: 'Đăng xuất',
    view_page: 'Vào trang',
    create_course_schedule: 'Tạo lịch học',
    update_course_schedule: 'Sửa lịch học',
    delete_course_schedule: 'Xóa lịch học',
    approve_course_request: 'Duyệt yêu cầu môn',
    reject_course_request: 'Từ chối yêu cầu môn',
    create_event: 'Tạo sự kiện',
    update_event: 'Sửa sự kiện',
    delete_event: 'Xóa sự kiện',
    send_notification: 'Gửi thông báo',
    update_profile: 'Cập nhật hồ sơ',
};

const tableLabels: Record<string, string> = {
    events: 'Sự kiện',
    lost_found_items: 'Tìm đồ',
    course_schedules: 'Lịch học',
    user_course_requests: 'Yêu cầu môn',
    course_reports: 'Báo cáo môn',
    school_announcements: 'Thông báo trường',
    ctv_requests: 'Đơn CTV',
    event_candidates: 'Gợi ý sự kiện',
    profiles: 'Hồ sơ',
};

const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const parseDevice = (ua?: string | null) => {
    if (!ua) return { os: 'Không rõ', browser: 'Không rõ', mobile: false };
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const os = ua.includes('Windows') ? 'Windows'
        : ua.includes('Mac') ? 'macOS'
            : ua.includes('Android') ? 'Android'
                : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
                    : ua.includes('Linux') ? 'Linux'
                        : 'Không rõ';
    const browser = ua.includes('Edg') ? 'Edge'
        : ua.includes('Chrome') ? 'Chrome'
            : ua.includes('Firefox') ? 'Firefox'
                : ua.includes('Safari') ? 'Safari'
                    : 'Browser';
    return { os, browser, mobile };
};

const getActionLabel = (action?: string | null) => {
    if (!action) return 'Không rõ';
    if (actionLabels[action]) return actionLabels[action];
    return action
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};

const getTargetTable = (log: ActivityLogRow) => log.target_table || log.table_name || '';
const getTargetId = (log: ActivityLogRow) => log.target_id || log.record_id || '';
const getOldData = (log: ActivityLogRow) => log.old_data || log.details?.old || null;
const getNewData = (log: ActivityLogRow) => log.new_data || log.details?.new || null;

const statusBadge = (status?: string | null) => {
    if (status === 'error') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const actionBadge = (action?: string | null) => {
    if (!action) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (action.includes('delete') || action.includes('reject')) return 'bg-red-50 text-red-700 border-red-200';
    if (action.includes('approve') || action.includes('create')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action.includes('login') || action.includes('view')) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
};

const summarizeMetadata = (metadata?: JsonRecord | null) => {
    if (!metadata) return '-';
    const entries = Object.entries(metadata).filter(([key]) => key !== 'source').slice(0, 3);
    if (entries.length === 0) return '-';
    return entries.map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ');
};

const filterOptions = (logs: ActivityLogRow[], accessor: (log: ActivityLogRow) => string | null | undefined) =>
    [...new Set(logs.map(accessor).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));

const normalizeRoleLabel = (role?: string | null) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'auditor') return normalized;
    return null;
};

export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ onClose }) => {
    const [logs, setLogs] = useState<ActivityLogRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [userFilter, setUserFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [tableFilter, setTableFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('30d');
    const [page, setPage] = useState(1);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('activity_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (fetchError) throw fetchError;

            const rawLogs = (data || []) as ActivityLogRow[];
            const [{ data: roleRows }, { data: profileRows }] = await Promise.all([
                supabase.from('user_roles').select('id,user_id,role'),
                supabase.from('profiles').select('id,email'),
            ]);

            const roleById = new Map<string, string>();
            (roleRows || []).forEach((row: UserRoleRow) => {
                const role = normalizeRoleLabel(row.role);
                if (!role) return;
                if (row.id) roleById.set(row.id, role);
                if (row.user_id) roleById.set(row.user_id, role);
            });

            const roleByEmail = new Map<string, string>();
            (profileRows || []).forEach((profile: ProfileRoleRow) => {
                const role = roleById.get(profile.id);
                if (profile.email && role) roleByEmail.set(profile.email, role);
            });

            setLogs(rawLogs.map(log => ({
                ...log,
                user_role: normalizeRoleLabel(log.user_role)
                    || (log.user_id ? roleById.get(log.user_id) : null)
                    || (log.user_email ? roleByEmail.get(log.user_email) : null)
                    || null,
            })));
        } catch (err) {
            console.error('Activity logs fetch error:', err);
            setError(err instanceof Error ? err.message : 'Không thể tải activity logs.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const cutoff = useMemo(() => {
        if (dateFilter === 'all') return null;
        const days = dateFilter === '7d' ? 7 : 30;
        return Date.now() - days * 24 * 60 * 60 * 1000;
    }, [dateFilter]);

    const filteredLogs = useMemo(() => {
        const term = search.trim().toLowerCase();
        return logs.filter(log => {
            const createdTime = new Date(log.created_at).getTime();
            if (cutoff && createdTime < cutoff) return false;
            if (userFilter !== 'all' && (log.user_email || '') !== userFilter) return false;
            if (actionFilter !== 'all' && (log.action || '') !== actionFilter) return false;
            if (tableFilter !== 'all' && getTargetTable(log) !== tableFilter) return false;
            if (statusFilter !== 'all' && (log.status || 'success') !== statusFilter) return false;
            if (!term) return true;
            const haystack = [
                log.user_email,
                log.user_role,
                log.action,
                getActionLabel(log.action),
                getTargetTable(log),
                getTargetId(log),
                log.page_path,
                log.status,
                log.error_message,
                JSON.stringify(log.metadata || {}),
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [logs, cutoff, userFilter, actionFilter, tableFilter, statusFilter, search]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
    const pageLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [search, userFilter, actionFilter, tableFilter, statusFilter, dateFilter]);

    const summary = useMemo(() => {
        const now = Date.now();
        const sevenDays = logs.filter(log => new Date(log.created_at).getTime() >= now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDays = logs.filter(log => new Date(log.created_at).getTime() >= now - 30 * 24 * 60 * 60 * 1000);
        const byUser = thirtyDays.reduce<Record<string, number>>((acc, log) => {
            const key = log.user_email || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const topUser = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
        return {
            sevenDays: sevenDays.length,
            thirtyDays: thirtyDays.length,
            errors: thirtyDays.filter(log => log.status === 'error').length,
            latest: logs[0]?.created_at ? formatTime(logs[0].created_at) : '-',
            topUser,
        };
    }, [logs]);

    const content = (
        <div className={onClose ? 'bg-white w-full max-w-7xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scaleIn border border-gray-200' : 'min-h-full bg-[#F8FAFC] p-4 sm:p-6'}>
            <div className={`${onClose ? 'bg-[#003375] p-4 text-white' : 'mb-5'} flex items-center justify-between gap-3`}>
                <div>
                    <h1 className={`${onClose ? 'text-lg text-white' : 'text-2xl text-slate-950'} font-black flex items-center gap-2`}>
                        <Activity size={22} className={onClose ? 'text-blue-100' : 'text-[#003375]'} />
                        Audit log hệ thống
                    </h1>
                    <p className={`${onClose ? 'text-blue-100' : 'text-slate-500'} mt-1 text-sm`}>
                        Theo dõi đăng nhập, điều hướng và thao tác nghiệp vụ của Admin/Auditor.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { playClick(); fetchLogs(); }}
                        className={`${onClose ? 'bg-white/10 text-white hover:bg-white/20' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'} rounded-lg px-3 py-2 text-sm font-bold transition-colors flex items-center gap-2`}
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        Tải lại
                    </button>
                    {onClose && (
                        <button onClick={() => { playClick(); onClose(); }} className="rounded-full p-2 text-white hover:bg-white/20">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            <div className={`${onClose ? 'flex-1 overflow-auto bg-[#F8FAFC] p-4' : ''}`}>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">7 ngày</p>
                        <p className="mt-1 text-2xl font-black text-slate-950">{summary.sevenDays}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">30 ngày</p>
                        <p className="mt-1 text-2xl font-black text-slate-950">{summary.thirtyDays}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Lỗi</p>
                        <p className="mt-1 text-2xl font-black text-red-700">{summary.errors}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Hoạt động gần nhất</p>
                        <p className="mt-2 text-sm font-bold text-slate-800">{summary.latest}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Admin/Auditor nổi bật</p>
                        <p className="mt-2 truncate text-sm font-bold text-[#003375]" title={summary.topUser?.[0]}>
                            {summary.topUser ? `${summary.topUser[0]} (${summary.topUser[1]})` : '-'}
                        </p>
                    </div>
                </div>

                <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
                        <Filter size={16} /> Bộ lọc
                    </div>
                    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                        <label className="relative md:col-span-2 xl:col-span-2">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="Tìm action, page, metadata..."
                                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#003375]"
                            />
                        </label>
                        <select value={userFilter} onChange={event => setUserFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả user</option>
                            {filterOptions(logs, log => log.user_email).map(email => <option key={email} value={email}>{email}</option>)}
                        </select>
                        <select value={actionFilter} onChange={event => setActionFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả action</option>
                            {filterOptions(logs, log => log.action).map(action => <option key={action} value={action}>{getActionLabel(action)}</option>)}
                        </select>
                        <select value={tableFilter} onChange={event => setTableFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả bảng</option>
                            {filterOptions(logs, getTargetTable).map(table => <option key={table} value={table}>{tableLabels[table] || table}</option>)}
                        </select>
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả trạng thái</option>
                            <option value="success">Thành công</option>
                            <option value="warning">Cảnh báo</option>
                            <option value="error">Lỗi</option>
                        </select>
                        <select value={dateFilter} onChange={event => setDateFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="7d">7 ngày</option>
                            <option value="30d">30 ngày</option>
                            <option value="all">Tất cả</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {loading ? (
                        <div className="flex h-72 flex-col items-center justify-center text-slate-500">
                            <Loader2 className="mb-3 animate-spin text-[#003375]" size={30} />
                            Đang tải audit log...
                        </div>
                    ) : error ? (
                        <div className="flex h-72 flex-col items-center justify-center text-red-700">
                            <AlertCircle className="mb-3" size={30} />
                            {error}
                        </div>
                    ) : (
                        <div className="overflow-auto">
                            <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="w-10 px-3 py-3"></th>
                                        <th className="px-3 py-3">Thời gian</th>
                                        <th className="px-3 py-3">Người thao tác</th>
                                        <th className="px-3 py-3">Role</th>
                                        <th className="px-3 py-3">Action</th>
                                        <th className="px-3 py-3">Target</th>
                                        <th className="px-3 py-3">Page</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Metadata</th>
                                        <th className="px-3 py-3">Thiết bị/IP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageLogs.map(log => {
                                        const device = parseDevice(log.device_info);
                                        const expanded = expandedId === log.id;
                                        const targetTable = getTargetTable(log);
                                        return (
                                            <React.Fragment key={log.id}>
                                                <tr className="hover:bg-blue-50/40">
                                                    <td className="px-3 py-3">
                                                        <button
                                                            onClick={() => { playClick(); setExpandedId(expanded ? null : log.id); }}
                                                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#003375]"
                                                            title="Xem chi tiết"
                                                        >
                                                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                        </button>
                                                    </td>
                                                    <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-600">
                                                        <Clock className="mr-1 inline" size={12} />
                                                        {formatTime(log.created_at)}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <p className="max-w-[180px] truncate font-bold text-[#003375]" title={log.user_email || '-'}>
                                                            {log.user_email || '-'}
                                                        </p>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                                                            {log.user_role || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className={`rounded border px-2 py-1 text-xs font-bold ${actionBadge(log.action)}`}>
                                                            {getActionLabel(log.action)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <p className="font-bold text-slate-800">{tableLabels[targetTable] || targetTable || '-'}</p>
                                                        <p className="text-xs text-slate-400">{getTargetId(log) ? `#${getTargetId(log)}` : '-'}</p>
                                                    </td>
                                                    <td className="max-w-[180px] truncate px-3 py-3 text-xs font-semibold text-slate-600" title={log.page_path || '-'}>
                                                        {log.page_path || '-'}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className={`rounded border px-2 py-1 text-xs font-bold ${statusBadge(log.status)}`}>
                                                            {log.status || 'success'}
                                                        </span>
                                                    </td>
                                                    <td className="max-w-[240px] truncate px-3 py-3 text-xs text-slate-600" title={summarizeMetadata(log.metadata)}>
                                                        {summarizeMetadata(log.metadata)}
                                                    </td>
                                                    <td className="px-3 py-3 text-xs text-slate-500">
                                                        <p className="flex items-center gap-1 font-semibold">
                                                            {device.mobile ? <Smartphone size={13} /> : <Monitor size={13} />}
                                                            {device.browser}/{device.os}
                                                        </p>
                                                        <p className="mt-1 flex items-center gap-1">
                                                            <Globe size={12} /> {log.ip_address || 'Không rõ IP'}
                                                        </p>
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr className="bg-slate-50">
                                                        <td colSpan={10} className="px-4 py-4">
                                                            <div className="grid gap-3 lg:grid-cols-3">
                                                                <DetailBlock title="Metadata" value={log.metadata || {}} />
                                                                <DetailBlock title="Old data" value={getOldData(log) || {}} />
                                                                <DetailBlock title="New data" value={getNewData(log) || {}} />
                                                            </div>
                                                            {log.error_message && (
                                                                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                                                                    {log.error_message}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {pageLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-4 py-16 text-center text-slate-400">
                                                <Database className="mx-auto mb-2 opacity-50" size={32} />
                                                Không có log phù hợp bộ lọc.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>Hiển thị {pageLogs.length} / {filteredLogs.length} log đã lọc. Dữ liệu tải tối đa 500 log mới nhất.</p>
                    <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">Trước</button>
                        <span className="font-bold text-slate-700">{page}/{totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">Sau</button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!onClose) return content;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 animate-fadeIn" onClick={onClose}>
            <div onClick={event => event.stopPropagation()} className="w-full">
                {content}
            </div>
        </div>,
        document.body
    );
};

const DetailBlock: React.FC<{ title: string; value: unknown }> = ({ title, value }) => (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-500">
            <Eye size={13} /> {title}
        </div>
        <pre className="max-h-72 overflow-auto p-3 text-xs leading-5 text-slate-700">
            {JSON.stringify(value, null, 2)}
        </pre>
    </div>
);
