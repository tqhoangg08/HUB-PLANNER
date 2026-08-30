import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    Database,
    Filter,
    Globe,
    Loader2,
    Monitor,
    RefreshCw,
    Search,
    Smartphone,
    X,
} from 'lucide-react';
import { fetchAdminActivity } from '../utils/adminLegacyDataApi';
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

interface ActivityLogModalProps {
    onClose?: () => void;
}

const PAGE_SIZE = 30;
const sanitizeActivitySearch = (value: string) =>
    value.trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ');

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
    update_course_reports: 'Cập nhật báo cáo môn',
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
    admin_reports: 'Xử lý báo cáo',
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

const pageLabels: Record<string, string> = {
    '/dashboard': 'Tổng quan',
    '/schedule': 'Thời khóa biểu',
    '/events': 'Sự kiện ĐRL',
    '/lost-found': 'Tìm đồ thất lạc',
    '/reports': 'Xử lý báo cáo',
    '/admin/reports': 'Xử lý báo cáo',
    '/admin/activity': 'Theo dõi hoạt động',
    '/admin/event-candidates': 'Event candidate',
    '/handbook': 'Cẩm nang',
    '/profile': 'Hồ sơ',
};

const getPageLabel = (path?: string | null, metadata?: JsonRecord | null) => {
    const title = typeof metadata?.title === 'string' ? metadata.title.split('|')[0].trim() : '';
    if (title) return title;
    if (!path) return '-';
    return pageLabels[path] || path.replace(/^\/+/, '').replace(/[-/]/g, ' ') || '-';
};

const getAreaLabel = (log: ActivityLogRow) => {
    const table = getTargetTable(log);
    const tableLabel = tableLabels[table] || '';
    const pageLabel = getPageLabel(log.page_path, log.metadata);
    if (tableLabel && pageLabel !== '-') return `${pageLabel} · ${tableLabel}`;
    return tableLabel || pageLabel;
};

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

const formatReadableValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return 'trống';
    if (typeof value === 'boolean') return value ? 'Có' : 'Không';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(value);
};

const fieldLabels: Record<string, string> = {
    title: 'tiêu đề',
    name: 'tên',
    status: 'trạng thái',
    review_status: 'trạng thái duyệt',
    content: 'nội dung',
    description: 'mô tả',
    location: 'địa điểm',
    start_time: 'thời gian bắt đầu',
    end_time: 'thời gian kết thúc',
    page_path: 'trang',
    user_role: 'vai trò',
    target_table: 'chức năng',
};

const pickReadableName = (...records: Array<JsonRecord | null | undefined>) => {
    const keys = ['title', 'name', 'subject_name', 'event_name', 'source_name', 'full_name', 'email'];
    for (const record of records) {
        if (!record) continue;
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'string' && value.trim()) return value.trim();
        }
    }
    return null;
};

const getChangedItemLabel = (log: ActivityLogRow, oldData?: JsonRecord | null, newData?: JsonRecord | null) => {
    const table = getTargetTable(log);
    const tableLabel = tableLabels[table] || getAreaLabel(log);
    const name = pickReadableName(newData, oldData, log.metadata);
    if (name) return `${tableLabel}: ${name}`;
    const targetId = getTargetId(log);
    if (targetId) return `${tableLabel} mã ${targetId}`;
    return tableLabel;
};

const getActivityDetails = (log: ActivityLogRow) => {
    const action = getActionLabel(log.action).toLowerCase();
    const area = getAreaLabel(log);
    const oldData = getOldData(log);
    const newData = getNewData(log);
    const itemLabel = getChangedItemLabel(log, oldData, newData);

    const lines: string[] = [];
    if (log.action !== 'login' && log.action !== 'logout') {
        lines.push(`Mục được thao tác: ${itemLabel}.`);
    }

    if (log.action?.includes('create')) {
        lines.push(`Đã thêm mới tại ${area}.`);
    } else if (log.action?.includes('delete')) {
        lines.push(`Đã xóa mục này tại ${area}.`);
    } else if (log.action?.includes('approve')) {
        lines.push(`Đã duyệt mục này tại ${area}.`);
    } else if (log.action?.includes('reject')) {
        lines.push(`Đã từ chối mục này tại ${area}.`);
    } else if (log.action === 'login' || log.action === 'logout') {
        lines.push(`Đã ${action}.`);
    } else {
        lines.push(`Đã ${action} mục này tại ${area}.`);
    }

    if (oldData && newData) {
        const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
        const changes = keys
            .filter(key => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]))
            .slice(0, 6)
            .map(key => {
                const label = fieldLabels[key] || key.replace(/_/g, ' ');
                return `Thay đổi ${label} từ "${formatReadableValue(oldData[key])}" thành "${formatReadableValue(newData[key])}".`;
            });
        lines.push(...changes);
    } else if (newData && Object.keys(newData).length > 0) {
        const created = Object.entries(newData).slice(0, 6).map(([key, value]) => {
            const label = fieldLabels[key] || key.replace(/_/g, ' ');
            return `Đặt ${label}: "${formatReadableValue(value)}".`;
        });
        lines.push(...created);
    }

    if (log.error_message) lines.push(`Lỗi: ${log.error_message}`);
    return lines;
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
    const [totalLogs, setTotalLogs] = useState(0);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchAdminActivity((page - 1) * PAGE_SIZE, PAGE_SIZE);
            setTotalLogs(response.total || 0);
            const rawLogs = (response.data || []) as ActivityLogRow[];
            setLogs(rawLogs.map(log => ({
                ...log,
                // Historical logs keep the role captured at event time. Do not
                // infer privileges from legacy Profile/user_roles lookups.
                user_role: normalizeRoleLabel(log.user_role) || null,
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
    }, [page, search, userFilter, actionFilter, tableFilter, statusFilter, dateFilter]);

    const cutoff = useMemo(() => {
        if (dateFilter === 'all') return null;
        const days = dateFilter === '7d' ? 7 : 30;
        return Date.now() - days * 24 * 60 * 60 * 1000;
    }, [dateFilter]);

    const visibleLogs = logs;

    const filteredLogs = useMemo(() => {
        const term = search.trim().toLowerCase();
        return visibleLogs.filter(log => {
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
                getAreaLabel(log),
                getTargetTable(log),
                getTargetId(log),
                log.status,
                log.error_message,
                JSON.stringify(log.metadata || {}),
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [visibleLogs, cutoff, userFilter, actionFilter, tableFilter, statusFilter, search]);

    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    const pageLogs = filteredLogs;

    useEffect(() => {
        setPage(1);
    }, [search, userFilter, actionFilter, tableFilter, statusFilter, dateFilter]);

    const summary = useMemo(() => {
        const now = Date.now();
        const sevenDays = visibleLogs.filter(log => new Date(log.created_at).getTime() >= now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDays = visibleLogs.filter(log => new Date(log.created_at).getTime() >= now - 30 * 24 * 60 * 60 * 1000);
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
            latest: visibleLogs[0]?.created_at ? formatTime(visibleLogs[0].created_at) : '-',
            topUser,
        };
    }, [visibleLogs]);

    const content = (
        <div className={onClose ? 'bg-white w-full max-w-7xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scaleIn border border-gray-200' : 'w-full min-h-full bg-transparent'}>
            <div className={onClose ? 'contents' : 'min-h-full w-full pb-0 text-[#0D1B3E]'}>
            <div className={`${onClose ? 'bg-[#003375] p-4 text-white' : 'mb-2.5 border-b border-slate-200 pb-4 pt-1'} flex items-start justify-between gap-3`}>
                <div>
                    <h1 className={`${onClose ? 'text-lg text-white' : 'text-2xl leading-tight tracking-normal text-[#003375] sm:text-[28px]'} font-black flex items-center gap-2`}>
                        <Activity size={22} className={onClose ? 'text-blue-100' : 'text-[#003375]'} />
                        Nhật ký hoạt động
                    </h1>
                    <p className={`${onClose ? 'text-blue-100' : 'text-slate-500'} mt-1 text-sm leading-snug`}>
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
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
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
                    <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-3 lg:col-span-1">
                        <p className="text-xs font-bold uppercase text-slate-500">Hoạt động gần nhất</p>
                        <p className="mt-2 text-sm font-bold text-slate-800">{summary.latest}</p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-3 lg:col-span-1">
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
                                placeholder="Tìm người, hành động, khu vực..."
                                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#003375]"
                            />
                        </label>
                        <select value={userFilter} onChange={event => setUserFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả user</option>
                            {filterOptions(visibleLogs, log => log.user_email).map(email => <option key={email} value={email}>{email}</option>)}
                        </select>
                        <select value={actionFilter} onChange={event => setActionFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả action</option>
                            {filterOptions(visibleLogs, log => log.action).map(action => <option key={action} value={action}>{getActionLabel(action)}</option>)}
                        </select>
                        <select value={tableFilter} onChange={event => setTableFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#003375]">
                            <option value="all">Tất cả bảng</option>
                            {filterOptions(visibleLogs, getTargetTable).map(table => <option key={table} value={table}>{tableLabels[table] || table}</option>)}
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
                        <>
                        <div className="hidden">
                            {pageLogs.map(log => {
                                const device = parseDevice(log.device_info);
                                const expanded = expandedId === log.id;
                                return (
                                    <div key={log.id} className="rounded-[20px] border border-[#EEF2FF] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                                        <button
                                            type="button"
                                            onClick={() => { playClick(); setExpandedId(expanded ? null : log.id); }}
                                            className="flex w-full items-start justify-between gap-3 text-left"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#7B8AB0]">
                                                    <Clock size={12} /> {formatTime(log.created_at)}
                                                </span>
                                                <span className="mt-2 block truncate text-[13px] font-black text-[#0D1B3E]">{log.user_email || '-'}</span>
                                                <span className="mt-1 block text-[11px] font-bold text-[#7B8AB0]">{getAreaLabel(log)}</span>
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end gap-2">
                                                <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusBadge(log.status)}`}>
                                                    {log.status || 'success'}
                                                </span>
                                                {expanded ? <ChevronDown size={16} className="text-[#C0CBDF]" /> : <ChevronRight size={16} className="text-[#C0CBDF]" />}
                                            </span>
                                        </button>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <span className="rounded-full border border-[#E5EAF4] bg-[#F6F8FC] px-2.5 py-1 text-[10px] font-black text-[#0D1B3E]">{log.user_role || '-'}</span>
                                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${actionBadge(log.action)}`}>{getActionLabel(log.action)}</span>
                                            <span className="inline-flex items-center gap-1 rounded-full border border-[#E5EAF4] bg-[#F6F8FC] px-2.5 py-1 text-[10px] font-black text-[#7B8AB0]">
                                                {device.mobile ? <Smartphone size={12} /> : <Monitor size={12} />}
                                                {device.browser}/{device.os}
                                            </span>
                                        </div>
                                        {expanded && (
                                            <div className="mt-3 rounded-2xl bg-[#F8FAFD] p-3">
                                                <div className="text-[10px] font-black uppercase text-[#7B8AB0]">Hoạt động cụ thể</div>
                                                <div className="mt-2 space-y-1.5 text-[12px] font-semibold leading-5 text-[#0D1B3E]">
                                                    {getActivityDetails(log).map((line, index) => (
                                                        <p key={index}>{line}</p>
                                                    ))}
                                                </div>
                                                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#7B8AB0]">
                                                    <Globe size={12} /> {log.ip_address || 'Không rõ IP'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {pageLogs.length === 0 && (
                                <div className="rounded-[20px] border border-dashed border-[#DDE3F0] bg-white p-8 text-center text-[12px] font-bold text-[#7B8AB0]">
                                    <Database className="mx-auto mb-2 opacity-50" size={32} />
                                    Không có log phù hợp bộ lọc.
                                </div>
                            )}
                        </div>
                        <div className="overflow-auto">
                            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="w-10 px-3 py-3"></th>
                                        <th className="px-3 py-3">Thời gian</th>
                                        <th className="px-3 py-3">Người thao tác</th>
                                        <th className="px-3 py-3">Role</th>
                                        <th className="px-3 py-3">Action</th>
                                        <th className="px-3 py-3">Khu vực / chức năng</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Thiết bị/IP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageLogs.map(log => {
                                        const device = parseDevice(log.device_info);
                                        const expanded = expandedId === log.id;
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
                                                        <p className="font-bold text-slate-800">{getAreaLabel(log)}</p>
                                                        {getTargetId(log) && <p className="text-xs text-slate-400">Mã mục: {getTargetId(log)}</p>}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className={`rounded border px-2 py-1 text-xs font-bold ${statusBadge(log.status)}`}>
                                                            {log.status || 'success'}
                                                        </span>
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
                                                        <td colSpan={8} className="px-4 py-4">
                                                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                                                <p className="text-xs font-black uppercase text-slate-500">Hoạt động cụ thể</p>
                                                                <div className="mt-2 space-y-1.5 text-sm font-medium leading-6 text-slate-700">
                                                                    {getActivityDetails(log).map((line, index) => (
                                                                        <p key={index}>{line}</p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {pageLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                                                <Database className="mx-auto mb-2 opacity-50" size={32} />
                                                Không có log phù hợp bộ lọc.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </div>

                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>Hiển thị {pageLogs.length} / {totalLogs} log đã lọc.</p>
                    <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">Trước</button>
                        <span className="font-bold text-slate-700">{page}/{totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">Sau</button>
                    </div>
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
