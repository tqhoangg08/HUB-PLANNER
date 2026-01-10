import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { X, Clock, Loader2, Activity, Database } from 'lucide-react';
import { playClick } from '../utils/audio';

interface LogEntry {
    id: number;
    created_at: string;
    user_email: string; // Giả định trigger lưu email người dùng vào cột này
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name: string;
    record_id: string;
    details?: any; // JSONB nếu có
}

interface ActivityLogModalProps {
    onClose: () => void;
}

const formatAction = (action: string) => {
    switch (action) {
        case 'INSERT': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">Tạo mới</span>;
        case 'UPDATE': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-200">Cập nhật</span>;
        case 'DELETE': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200">Xóa</span>;
        default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold border border-gray-200">{action}</span>;
    }
};

const formatTarget = (table: string) => {
    if (table === 'events') return 'Sự kiện ĐRL';
    if (table === 'lost_found_items') return 'Tìm đồ';
    return table;
};

const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('vi-VN', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
};

export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            if (!supabase) {
                // Demo data for preview if no DB
                setLogs([
                    { id: 1, created_at: new Date().toISOString(), user_email: 'admin@hub.edu.vn', action: 'INSERT', table_name: 'events', record_id: '1' },
                    { id: 2, created_at: new Date(Date.now() - 3600000).toISOString(), user_email: 'ctv@hub.edu.vn', action: 'UPDATE', table_name: 'lost_found_items', record_id: '2' },
                ]);
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(100); // Giới hạn 100 log mới nhất

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

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scaleIn relative border border-gray-200" onClick={e => e.stopPropagation()}>
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
                            <p className="text-sm text-gray-500 mt-2">Vui lòng kiểm tra lại bảng activity_logs trong Database.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-100 text-gray-500 font-semibold sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="p-3 w-40">Thời gian</th>
                                    <th className="p-3">Người thực hiện</th>
                                    <th className="p-3 w-32 text-center">Hành động</th>
                                    <th className="p-3 w-40">Đối tượng</th>
                                    <th className="p-3 w-20 text-center">ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-blue-50 transition-colors">
                                        <td className="p-3 text-gray-600 font-mono text-xs">
                                            {formatTime(log.created_at)}
                                        </td>
                                        <td className="p-3 font-medium text-[#003375]">
                                            {log.user_email || 'Hệ thống/Ẩn danh'}
                                        </td>
                                        <td className="p-3 text-center">
                                            {formatAction(log.action)}
                                        </td>
                                        <td className="p-3 text-gray-700">
                                            {formatTarget(log.table_name)}
                                        </td>
                                        <td className="p-3 text-center text-gray-400 font-mono text-xs">
                                            #{log.record_id}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-gray-400">
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
                    Chỉ hiển thị 100 hoạt động gần nhất để tối ưu hiệu năng.
                </div>
            </div>
        </div>,
        document.body
    );
};