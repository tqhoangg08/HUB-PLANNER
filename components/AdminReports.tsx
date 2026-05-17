import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { fetchProfilePrivateMap } from '../utils/profilePrivate';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, Bug, BookOpen, UserPlus, CalendarDays, MessageSquare, Trash2, Calendar, Edit2 } from 'lucide-react';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';

type TabType = 'course_reports' | 'bug_reports' | 'ctv_requests' | 'event_reports' | 'feedback';

interface ReportData {
    id: any;
    user_id: string | null;
    status: string;
    created_at: string;
    profile?: {
        full_name?: string;
        student_code?: string;
        email?: string;
    } | null;
    [key: string]: any; 
}

export const AdminReports: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('course_reports');
    const [reports, setReports] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingId, setUpdatingId] = useState<any>(null);

    // Cập nhật lại danh sách các tab theo đúng yêu cầu
    const tabs = [
        { id: 'course_reports', label: 'Lỗi môn học', icon: BookOpen, color: 'text-orange-600', bg: 'bg-orange-50' },
        { id: 'bug_reports', label: 'Lỗi bảng điểm', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        { id: 'ctv_requests', label: 'Đơn xin CTV', icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'event_reports', label: 'Lỗi sự kiện', icon: CalendarDays, color: 'text-purple-600', bg: 'bg-purple-50' },
        { id: 'feedback', label: 'Lỗi web', icon: Bug, color: 'text-emerald-600', bg: 'bg-emerald-50' }
    ] as const;

    const fetchReports = async () => {
        setLoading(true);
        if (!supabase) return;

        try {
            // Lấy dữ liệu báo cáo
            const { data: reportData, error: reportError } = await supabase
                .from(activeTab)
                .select('*')
                .order('created_at', { ascending: false });

            if (reportError) throw reportError;

            if (reportData && reportData.length > 0) {
                // Gom tất cả user_id duy nhất để query profile 1 lần
                const userIds = [...new Set(reportData.map(item => item.user_id).filter(Boolean))] as string[];
                
                let profilesMap: Record<string, any> = {};
                
                if (userIds.length > 0) {
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, full_name, student_code')
                        .in('id', userIds);
                    const privateMap = await fetchProfilePrivateMap(userIds);
                        
                    if (profilesData) {
                        profilesData.forEach(p => {
                            profilesMap[p.id] = { ...p, email: privateMap[p.id]?.email };
                        });
                    }
                }

                // Ráp dữ liệu report với profile
                const enrichedData = reportData.map(item => ({
                    ...item,
                    profile: item.user_id ? (profilesMap[item.user_id] || null) : null
                }));

                setReports(enrichedData);
            } else {
                setReports([]);
            }
        } catch (error) {
            console.error("Lỗi khi tải báo cáo:", error);
            alert("Lỗi tải dữ liệu!");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [activeTab]);

    const handleUpdateStatus = async (id: any, newStatus: string) => {
        if (!supabase) return;
        playClick();
        setUpdatingId(id);
        
        try {
            const { error } = await supabase
                .from(activeTab)
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            
            setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        } catch (error) {
            console.error("Lỗi update status:", error);
            alert("Cập nhật thất bại!");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleDelete = async (id: any) => {
        if (!await showConfirm("Bạn có chắc chắn muốn xóa báo cáo này vĩnh viễn?")) return;
        if (!supabase) return;
        playClick();
        setUpdatingId(id);
        
        try {
            const { error } = await supabase
                .from(activeTab)
                .delete()
                .eq('id', id);

            if (error) throw error;
            
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error("Lỗi xóa:", error);
            alert("Xóa thất bại!");
        } finally {
            setUpdatingId(null);
        }
    };

    // Render nội dung tương ứng theo bảng
    const renderReportCard = (item: ReportData) => {
        const dateStr = new Date(item.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
        const isResolved = item.status === 'ok' || item.status === 'resolved';

        return (
            <div key={item.id} className={`bg-white rounded-xl border ${isResolved ? 'border-green-200 bg-green-50/20' : 'border-gray-200'} p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative`}>
                
                {/* Header */}
                <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[#003375] font-bold text-lg border border-gray-200">
                            {item.profile?.full_name ? item.profile.full_name.charAt(0).toUpperCase() : (item.full_name ? item.full_name.charAt(0).toUpperCase() : '?')}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-sm">{item.profile?.full_name || item.full_name || 'Người dùng ẩn danh'}</p>
                            <p className="text-xs text-gray-500 font-medium">
                                MSSV: {item.profile?.student_code || item.student_code || '---'} | Email: {item.profile?.email || item.email || '---'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1"><Calendar size={12}/> {dateStr}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isResolved ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                            {isResolved ? 'Đã xử lý' : 'Đang chờ'}
                        </span>
                    </div>
                </div>

                {/* Nội dung chi tiết */}
                <div className="flex-1 text-sm text-gray-800 space-y-2">
                    {/* course_reports */}
                    {activeTab === 'course_reports' && (
                        <>
                            <p><strong className="text-gray-600">Môn học:</strong> <span className="font-bold">{item.subject_name}</span> ({item.course_code})</p>
                            <p><strong className="text-gray-600">Lỗi:</strong> <span className="whitespace-pre-line bg-orange-50 text-orange-800 px-2 py-1 rounded inline-block w-full mt-1 border border-orange-100">{item.error_description}</span></p>
                            {item.suggested_correction && (
                                <p><strong className="text-gray-600">Sửa đúng:</strong> <span className="whitespace-pre-line bg-blue-50 text-blue-800 px-2 py-1 rounded inline-block w-full mt-1 border border-blue-100">{item.suggested_correction}</span></p>
                            )}
                        </>
                    )}

                    {/* bug_reports */}
                    {activeTab === 'bug_reports' && (
                        <>
                            <p><strong className="text-gray-600">Vị trí lỗi (Bảng điểm):</strong> <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-medium">{item.error_location}</span></p>
                            <p><strong className="text-gray-600">Mô tả:</strong> <span className="whitespace-pre-line">{item.description}</span></p>
                        </>
                    )}
                    
                    {/* event_reports */}
                    {activeTab === 'event_reports' && (
                        <>
                            <p><strong className="text-gray-600">Sự kiện:</strong> <span className="font-bold text-[#003375]">{item.event_name}</span> (ID: {item.event_id})</p>
                            <p><strong className="text-gray-600">ID sự kiện:</strong> <span className="font-mono font-bold bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded">{item.event_id || '---'}</span></p>
                            <p><strong className="text-gray-600">BTC:</strong> {item.organizer}</p>
                            <p><strong className="text-gray-600">Chi tiết sai sót:</strong> <span className="whitespace-pre-line text-red-600 font-medium">{item.issue_description}</span></p>
                        </>
                    )}

                    {/* ctv_requests */}
                    {activeTab === 'ctv_requests' && (
                        <div className="grid grid-cols-2 gap-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                            <p><strong className="text-gray-600">Khóa:</strong> {item.student_batch}</p>
                            <p><strong className="text-gray-600">Ngành:</strong> {item.major}</p>
                            <p className="col-span-2"><strong className="text-gray-600">SĐT/Zalo:</strong> <span className="font-bold text-[#003375]">{item.contact_info}</span></p>
                        </div>
                    )}

                    {/* feedback */}
                    {activeTab === 'feedback' && (
                        <>
                            <p><strong className="text-gray-600">Phân loại:</strong> <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase text-[10px] font-bold">{item.type}</span></p>
                            <p><strong className="text-gray-600">Nội dung:</strong> <span className="whitespace-pre-line italic">"{item.content}"</span></p>
                            {item.contact && item.contact !== 'EMPTY' && <p><strong className="text-gray-600">Liên hệ:</strong> {item.contact}</p>}
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    {activeTab === 'event_reports' && item.event_id && (
                        <Link
                            to={`/events/edit/${encodeURIComponent(String(item.event_id))}`}
                            onClick={() => playClick()}
                            className="px-3 py-1.5 text-xs font-bold text-[#003375] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 border border-blue-100"
                        >
                            <Edit2 size={14}/> Sửa sự kiện
                        </Link>
                    )}
                    <button 
                        onClick={() => handleDelete(item.id)}
                        disabled={updatingId === item.id}
                        className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <Trash2 size={14}/> Xóa
                    </button>
                    {!isResolved && (
                        <button 
                            onClick={() => handleUpdateStatus(item.id, 'ok')}
                            disabled={updatingId === item.id}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {updatingId === item.id ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>} Xong
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fadeIn pb-10">
            {/* Header tinh gọn lại trên Mobile */}
            <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-2 sm:pb-4 -mt-2 mb-3 sm:mb-5 border-b border-gray-200/60 md:shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)]">
                <h2 className="text-2xl sm:text-[28px] font-black text-[#003375] mb-1">
                    Xử lý báo cáo
                </h2>
                <p className="text-[11px] sm:text-sm text-gray-500 truncate">Quản lý phản hồi, lỗi hệ thống và đơn xin CTV</p>
            </div>

            {/* Menu Tabs: Chuyển sang dạng cuộn ngang (Horizontal Scroll) */}
            <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4 pb-1">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { playClick(); setActiveTab(tab.id); }}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border transition-all shrink-0 ${
                                isActive 
                                ? `${tab.bg} ${tab.color} border-current shadow-sm ring-1 ring-current/20` 
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                        >
                            <Icon size={16} className={isActive ? '' : 'opacity-70'} />
                            <span className="text-[11px] sm:text-xs font-bold whitespace-nowrap">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Bảng dữ liệu / Danh sách Cards */}
            <div className="bg-gray-50/50 p-1 rounded-xl">
                <div className="flex justify-between items-center mb-3 sm:mb-4 px-1 sm:px-2">
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        {tabs.find(t => t.id === activeTab)?.label}
                    </h3>
                    <div className="text-xs font-bold text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                        Tổng cộng: {reports.length}
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
                        <p className="text-gray-500 text-sm font-medium">Đang tải dữ liệu báo cáo...</p>
                    </div>
                ) : reports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-4"><CheckCircle2 size={32}/></div>
                        <p className="text-gray-500 font-bold text-lg">Tuyệt vời!</p>
                        <p className="text-gray-400 text-sm">Hiện tại không có báo cáo nào cần xử lý trong mục này.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reports.map(renderReportCard)}
                    </div>
                )}
            </div>
        </div>
    );
};
