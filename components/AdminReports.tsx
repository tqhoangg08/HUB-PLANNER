import React, { useState, useEffect } from 'react';
import { deleteAdminReport, fetchAdminReports, resolveAllAdminReports, updateAdminReportStatus } from '../utils/adminLegacyDataApi';
import { fetchProfilePrivateMap } from '../utils/profilePrivate';
import { fetchStaffPublicProfileMap } from '../utils/staffProfilesApi';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, CheckCheck, AlertTriangle, Bug, BookOpen, UserPlus, CalendarDays, MessageSquare, Trash2, Calendar, Edit2, ExternalLink, Crown } from 'lucide-react';
import { playClick } from '../utils/audio';
import { showAlert, showConfirm } from '../utils/appNotifications';

type TabType = 'course_reports' | 'bug_reports' | 'ctv_requests' | 'event_reports' | 'feedback' | 'canva_pro_requests';

const REPORT_PAGE_SIZE = 30;

const getLostFoundItemUrl = (content?: string | null) => {
    if (!content) return null;

    const linkMatch = content.match(/\/lost-found\?item=(\d+)/i);
    if (linkMatch?.[1]) return `/lost-found?item=${linkMatch[1]}`;

    const itemIdMatch = content.match(/Item ID:\s*(\d+)/i);
    if (itemIdMatch?.[1]) return `/lost-found?item=${itemIdMatch[1]}`;

    return null;
};

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
    const [updatingAll, setUpdatingAll] = useState(false);
    const [page, setPage] = useState(0);
    const [totalReports, setTotalReports] = useState(0);

    // Cập nhật lại danh sách các tab theo đúng yêu cầu
    const tabs = [
        { id: 'course_reports', label: 'Lỗi môn học', icon: BookOpen, color: 'text-orange-600', bg: 'bg-orange-50' },
        { id: 'bug_reports', label: 'Lỗi bảng điểm', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        { id: 'ctv_requests', label: 'Đơn xin CTV', icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'event_reports', label: 'Lỗi sự kiện', icon: CalendarDays, color: 'text-purple-600', bg: 'bg-purple-50' },
        { id: 'feedback', label: 'Feedback / Takedown', icon: Bug, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { id: 'canva_pro_requests', label: 'Canva Pro', icon: Crown, color: 'text-sky-600', bg: 'bg-sky-50' }
    ] as const;

    const fetchReports = async () => {
        setLoading(true);
        try {
            const from = page * REPORT_PAGE_SIZE;
            const response = await fetchAdminReports(activeTab, from, REPORT_PAGE_SIZE);
            setTotalReports(response.total || 0);
            const typedReportData = (response.data || []) as unknown as ReportData[];

            if (typedReportData.length > 0) {
                // Gom tất cả user_id duy nhất để query profile 1 lần
                const userIds = [...new Set(typedReportData.map(item => item.user_id).filter(Boolean))] as string[];
                
                let profilesMap: Record<string, any> = {};
                
                if (userIds.length > 0) {
                    const publicMap = await fetchStaffPublicProfileMap(userIds);
                    const privateMap = await fetchProfilePrivateMap(userIds, { mode: 'summary' });
                    Object.values(publicMap).forEach((profile: any) => {
                        profilesMap[profile.id] = { ...profile, email: privateMap[profile.id]?.email };
                    });
                }

                // Ráp dữ liệu report với profile
                const enrichedData = typedReportData.map(item => ({
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
        setPage(0);
    }, [activeTab]);

    useEffect(() => {
        fetchReports();
    }, [activeTab, page]);

    const handleUpdateStatus = async (id: any, newStatus: string) => {
        playClick();
        setUpdatingId(id);
        
        try {
            await updateAdminReportStatus(activeTab, id, newStatus);
            
            setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        } catch (error) {
            console.error("Lỗi update status:", error);
            alert("Cập nhật thất bại!");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleResolveAllInActiveTab = async () => {
        const activeLabel = tabs.find(tab => tab.id === activeTab)?.label || 'mục này';
        const confirmed = await showConfirm({
            title: `Đánh dấu đã xử lý tất cả ${activeLabel}?`,
            message: `Chỉ các báo cáo chưa xử lý trong mục "${activeLabel}" được cập nhật. Những mục khác sẽ không bị ảnh hưởng.`,
            confirmText: 'Đã xử lý tất cả',
            cancelText: 'Hủy',
            variant: 'warning',
        });
        if (!confirmed) return;

        playClick();
        setUpdatingAll(true);
        try {
            const resolvedStatus = activeTab === 'canva_pro_requests' ? 'contacted' : 'ok';
            const { updated } = await resolveAllAdminReports(activeTab, resolvedStatus);

            await fetchReports();
            await showAlert({
                title: `Đã xử lý ${activeLabel}`,
                message: updated > 0
                    ? `Đã đánh dấu ${updated} báo cáo trong mục này là đã xử lý.`
                    : 'Mục này không còn báo cáo nào cần xử lý.',
                variant: 'success',
            });
        } catch (error: any) {
            console.error('Lỗi xử lý tất cả báo cáo:', error);
            await fetchReports();
            await showAlert({
                title: 'Không thể xử lý tất cả báo cáo',
                message: error?.message || 'Vui lòng thử lại.',
                variant: 'warning',
            });
        } finally {
            setUpdatingAll(false);
        }
    };

    const handleDelete = async (id: any) => {
        if (!await showConfirm("Bạn có chắc chắn muốn xóa báo cáo này vĩnh viễn?")) return;
        playClick();
        setUpdatingId(id);
        
        try {
            await deleteAdminReport(activeTab, id);
            
            setReports(prev => prev.filter(r => r.id !== id));
            setTotalReports(prev => Math.max(0, prev - 1));
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
        const isResolved = item.status === 'ok' || item.status === 'resolved' || item.status === 'contacted' || item.status === 'approved' || item.status === 'rejected';
        const lostFoundItemUrl = activeTab === 'feedback' ? getLostFoundItemUrl(item.content) : null;

        return (
            <div key={item.id} className={`rounded-[20px] border ${isResolved ? 'border-green-200 bg-green-50/20' : 'border-[#EEF2FF] bg-white'} p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)] transition-shadow md:rounded-xl md:border-gray-200 md:p-5 md:shadow-sm md:hover:shadow-md flex flex-col gap-4 relative`}>
                
                {/* Header */}
                <div className="flex justify-between items-start gap-3 border-b border-gray-100 pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[#003375] font-bold text-lg border border-gray-200">
                            {item.profile?.full_name ? item.profile.full_name.charAt(0).toUpperCase() : (item.full_name ? item.full_name.charAt(0).toUpperCase() : '?')}
                        </div>
                        <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-sm">{item.profile?.full_name || item.full_name || 'Người dùng ẩn danh'}</p>
                            <p className="text-xs text-gray-500 font-medium">
                                MSSV: {item.profile?.student_code || item.student_code || '---'} | Email: {item.profile?.email || item.email || '---'}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
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

                    {activeTab === 'canva_pro_requests' && (
                        <div className="grid grid-cols-2 gap-2 bg-sky-50/60 p-3 rounded-lg border border-sky-100">
                            <p><strong className="text-gray-600">Email:</strong> <span className="font-bold text-[#003375]">{item.email}</span></p>
                            <p><strong className="text-gray-600">Ho ten:</strong> {item.full_name}</p>
                            <p><strong className="text-gray-600">Khoa:</strong> {item.student_batch}</p>
                            <p><strong className="text-gray-600">Nganh:</strong> {item.major}</p>
                            {item.note && <p className="col-span-2"><strong className="text-gray-600">Ghi chu:</strong> {item.note}</p>}
                        </div>
                    )}

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
                    {lostFoundItemUrl && (
                        <Link
                            to={lostFoundItemUrl}
                            onClick={() => playClick()}
                            className="px-3 py-1.5 text-xs font-bold text-[#003375] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 border border-blue-100"
                        >
                            <ExternalLink size={14}/> Đi tới đồ thất lạc
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
                            onClick={() => handleUpdateStatus(item.id, activeTab === 'canva_pro_requests' ? 'contacted' : 'ok')}
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
        <div className="w-full min-h-full bg-transparent">
            <div className="min-h-full w-full pb-10 text-[#0D1B3E]">
        <div className="animate-fadeIn">
            {/* Header tinh gọn lại trên Mobile */}
            <div className="relative z-40 mb-5 border-b border-gray-200/60 bg-[#F8FAFC] pb-4 pt-1 shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)] md:sticky md:top-0 md:-mt-2">
                <h2 className="mb-1 text-2xl font-black leading-tight tracking-normal text-[#003375] sm:text-[28px]">
                    Xử lý báo cáo
                </h2>
                <p className="text-[13px] font-semibold leading-snug text-[#7B8AB0] md:text-sm md:text-gray-500">Quản lý phản hồi, lỗi hệ thống và đơn xin CTV.</p>
            </div>

            {/* Menu Tabs: Chuyển sang dạng cuộn ngang (Horizontal Scroll) */}
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { playClick(); setActiveTab(tab.id); }}
                            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                                isActive 
                                ? 'bg-[#003375] text-white border-[#003375]'
                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                        >
                            <Icon size={16} className={isActive ? '' : 'opacity-70'} />
                            <span className="whitespace-nowrap">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Bảng dữ liệu / Danh sách Cards */}
            <div className="rounded-xl bg-gray-50/50 p-1">
                <div className="mb-4 flex flex-col items-start justify-between gap-3 px-2 sm:flex-row sm:items-center">
                    <h3 className="flex min-w-0 items-center gap-2 truncate text-lg font-black text-gray-800">
                        {tabs.find(t => t.id === activeTab)?.label}
                    </h3>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={handleResolveAllInActiveTab}
                            disabled={updatingAll || loading}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                        >
                            {updatingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                            Đã xử lý tất cả
                        </button>
                        <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-black text-gray-500 shadow-sm">
                            Tổng cộng: {totalReports}
                        </div>
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
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                        {reports.map(renderReportCard)}
                    </div>
                )}
                {totalReports > REPORT_PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-end gap-2 px-1 text-xs font-bold text-gray-600">
                        <button
                            onClick={() => setPage(prev => Math.max(0, prev - 1))}
                            disabled={page === 0 || loading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
                        >
                            Trước
                        </button>
                        <span>
                            Trang {page + 1}/{Math.max(1, Math.ceil(totalReports / REPORT_PAGE_SIZE))}
                        </span>
                        <button
                            onClick={() => setPage(prev => prev + 1)}
                            disabled={loading || (page + 1) * REPORT_PAGE_SIZE >= totalReports}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
                        >
                            Sau
                        </button>
                    </div>
                )}
            </div>
        </div>
            </div>
        </div>
    );
};
