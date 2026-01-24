import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { X, Clock, Loader2, Activity, Database, ChevronDown, ChevronRight, Globe, Smartphone, Monitor } from 'lucide-react';
import { playClick } from '../utils/audio';

interface LogEntry {
    id: number;
    created_at: string;
    user_email: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name: string;
    record_id: string;
    ip_address: string | null;
    device_info: string | null;
    details: {
        old: any;
        new: any;
    } | null;
}

interface ActivityLogModalProps {
    onClose: () => void;
}

// --- Helper: Parse User Agent ---
const parseUserAgent = (ua: string | null) => {
    if (!ua) return { os: 'Unknown', browser: 'Unknown', type: 'desktop' };
    
    let os = 'Unknown OS';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    let browser = 'Browser';
    if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    return { os, browser, type: isMobile ? 'mobile' : 'desktop' };
};

// --- Helper: Format Action Badge ---
const formatAction = (action: string, isSoftDelete: boolean) => {
    if (isSoftDelete) return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-[10px] font-bold border border-orange-200 uppercase tracking-wider">Xóa mềm</span>;
    switch (action) {
        case 'INSERT': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold border border-green-200 uppercase tracking-wider">Tạo mới</span>;
        case 'UPDATE': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold border border-blue-200 uppercase tracking-wider">Cập nhật</span>;
        case 'DELETE': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold border border-red-200 uppercase tracking-wider">Xóa hẳn</span>;
        default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-[10px] font-bold border border-gray-200 uppercase tracking-wider">{action}</span>;
    }
};

const formatTarget = (table: string) => {
    if (table === 'events') return 'Sự kiện';
    if (table === 'lost_found_items') return 'Tìm đồ';
    return table;
};

const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('vi-VN', { 
        day: '2-digit', month: '2-digit', year: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
};

// --- Helper: Generate Readable Diff ---
const fieldMapping: Record<string, string> = {
    title: 'Tiêu đề',
    name: 'Tên',
    points: 'Điểm',
    score: 'Điểm',
    location: 'Địa điểm',
    deadline: 'Hạn chốt',
    status: 'Trạng thái',
    content: 'Nội dung',
    description: 'Mô tả',
    is_deleted: 'Đã xóa',
    is_manually_closed: 'Đóng đơn',
    image_url: 'Ảnh'
};

const generateDiff = (log: LogEntry) => {
    const oldData = log.details?.old || {};
    const newData = log.details?.new || {};
    const isSoftDelete = newData?.is_deleted === true && oldData?.is_deleted === false;

    // Case 1: Soft Delete
    if (isSoftDelete) {
        return { summary: <span className="text-red-600 font-medium italic">Đã chuyển vào thùng rác (Ẩn khỏi web)</span>, isSoftDelete: true };
    }

    // Case 2: Insert
    if (log.action === 'INSERT') {
        const name = newData.title || newData.name || newData.content?.substring(0, 30) || 'Mục mới';
        return { summary: <span className="text-green-700 font-medium">Đã tạo mới: "{name}"</span>, isSoftDelete: false };
    }

    // Case 3: Hard Delete
    if (log.action === 'DELETE') {
        const name = oldData.title || oldData.name || 'Mục đã xóa';
        return { summary: <span className="text-red-700 font-medium">Đã xóa vĩnh viễn: "{name}"</span>, isSoftDelete: false };
    }

    // Case 4: Update - Find differences
    const changes: string[] = [];
    const ignoreKeys = ['updated_at', 'created_at', 'id'];

    Object.keys(newData).forEach(key => {
        if (ignoreKeys.includes(key)) return;
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
            const label = fieldMapping[key] || key;
            let valOld = oldData[key];
            let valNew = newData[key];

            // Format boolean
            if (typeof valOld === 'boolean') valOld = valOld ? 'Có' : 'Không';
            if (typeof valNew === 'boolean') valNew = valNew ? 'Có' : 'Không';
            
            // Truncate long strings
            if (typeof valOld === 'string' && valOld.length > 20) valOld = valOld.substring(0, 20) + '...';
            if (typeof valNew === 'string' && valNew.length > 20) valNew = valNew.substring(0, 20) + '...';

            changes.push(`${label}: [${valOld}] ➝ [${valNew}]`);
        }
    });

    if (changes.length === 0) return { summary: <span className="text-gray-400 italic">Không có thay đổi nội dung</span>, isSoftDelete: false };

    return { 
        summary: (
            <ul className="list-disc list-inside text-sm text-gray-700">
                {changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
        ), 
        isSoftDelete: false 
    };
};

export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    useEffect(() => {
        const fetchLogs = async () => {
            if (!supabase) {
                // Demo Data
                setLogs([
                    { 
                        id: 1, created_at: new Date().toISOString(), user_email: 'admin@hub.edu.vn', action: 'UPDATE', table_name: 'events', record_id: '10', 
                        ip_address: '14.232.112.55', device_info: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        details: { old: { title: 'Workshop A', points: 3 }, new: { title: 'Workshop A (Updated)', points: 5 } } 
                    },
                    { 
                        id: 2, created_at: new Date(Date.now() - 3600000).toISOString(), user_email: 'ctv@hub.edu.vn', action: 'UPDATE', table_name: 'lost_found_items', record_id: '25',
                        ip_address: '113.161.77.21', device_info: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                        details: { old: { is_deleted: false }, new: { is_deleted: true } } 
                    }
                ]);
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                setLogs(data || []);
            } catch (err: any) {
                console.error("Log fetch error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, []);

    const toggleRow = (id: number) => {
        playClick();
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scaleIn relative border border-gray-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Activity size={20} className="text-yellow-300" />
                        Lịch sử Hoạt động (System Logs)
                    </h3>
                    <button onClick={() => { playClick(); onClose(); }} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-gray-50 p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                            <Loader2 className="animate-spin text-[#003375]" size={32} />
                            <p>Đang tải dữ liệu...</p>
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center text-red-600">
                            <p>Lỗi: {error}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-100 text-gray-500 font-semibold sticky top-0 shadow-sm z-10 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="p-3 w-10"></th>
                                    <th className="p-3 w-32">Thời gian</th>
                                    <th className="p-3 w-40">Người dùng</th>
                                    <th className="p-3 w-28 text-center">Hành động</th>
                                    <th className="p-3 w-32">Đối tượng</th>
                                    <th className="p-3">Chi tiết thay đổi</th>
                                    <th className="p-3 w-48 text-right">Thiết bị & IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {logs.map((log) => {
                                    const { summary, isSoftDelete } = generateDiff(log);
                                    const deviceInfo = parseUserAgent(log.device_info);
                                    const isExpanded = expandedRows.has(log.id);

                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr 
                                                className={`hover:bg-blue-50 transition-colors cursor-pointer group ${isExpanded ? 'bg-blue-50/50' : ''}`}
                                                onClick={() => toggleRow(log.id)}
                                            >
                                                <td className="p-3 text-center text-gray-400">
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </td>
                                                <td className="p-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                                                    {formatTime(log.created_at)}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-bold text-[#003375] text-xs truncate max-w-[150px]" title={log.user_email}>
                                                        {log.user_email?.split('@')[0]}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                                                        {log.user_email}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    {formatAction(log.action, isSoftDelete)}
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                        {formatTarget(log.table_name)}
                                                    </span>
                                                    <span className="ml-1 text-[10px] text-gray-400">#{log.record_id}</span>
                                                </td>
                                                <td className="p-3">
                                                    {summary}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex items-center justify-end gap-1 text-gray-700 font-medium text-xs">
                                                        {deviceInfo.type === 'mobile' ? <Smartphone size={12}/> : <Monitor size={12}/>}
                                                        {deviceInfo.browser} / {deviceInfo.os}
                                                    </div>
                                                    <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 mt-0.5">
                                                        <Globe size={10}/> {log.ip_address || 'Unknown IP'}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-gray-50 border-b border-gray-200">
                                                    <td colSpan={7} className="p-4">
                                                        <div className="bg-gray-900 text-green-400 rounded-lg p-3 font-mono text-xs overflow-x-auto shadow-inner">
                                                            <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
                                                                <span className="uppercase font-bold text-gray-500">Raw JSON Data</span>
                                                                <span className="text-gray-500">Record ID: {log.record_id}</span>
                                                            </div>
                                                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-10 text-center text-gray-400">
                                            <Database size={32} className="mx-auto mb-2 opacity-30" />
                                            Chưa có lịch sử hoạt động nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 text-center">
                    Hiển thị 50 hoạt động mới nhất. Nhấn vào dòng để xem chi tiết kỹ thuật (JSON).
                </div>
            </div>
        </div>,
        document.body
    );
};
