import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { LogOut, Plus, Edit2, Trash2, Save, X, Loader2, Calendar, MapPin, User, Key, AlertCircle, ArrowLeft, Shield, History, Monitor, CheckCircle2, Circle, Search as SearchIcon, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';
import { playClick } from '../utils/audio';
import { AdminLostFoundBoard } from './AdminLostFoundBoard';

interface AdminEventBoardProps {
    onBack: () => void;
    onGoToApp?: () => void; // New prop
}

// --- Types ---
interface EventData {
  id?: number;
  title: string;
  deadline: string; // YYYY-MM-DD
  category: string; // Phân loại (Minigame, Cổ vũ...)
  criteria: string; // Mục (I, II...)
  points: string;
  organizer: string;
  link: string;
  location_type: string;
  format: string; // Online/Offline
  status: string; // 'Sắp diễn ra' | 'Đang diễn ra' | 'Đã kết thúc'
  is_manually_closed: boolean; // New field for manual closing
}

interface ActivityLog {
    id: number;
    created_at: string;
    user_email: string;
    action: string;
    ip_address: string;
    device_info: string;
}

const INITIAL_FORM: EventData = {
  title: '',
  deadline: '',
  category: 'Hoạt động phong trào',
  criteria: 'III',
  points: '5',
  organizer: '',
  link: '',
  location_type: 'Trong trường',
  format: 'Offline',
  status: 'Sắp diễn ra',
  is_manually_closed: false
};

type UserRole = 'admin' | 'editor' | null;

export const AdminEventBoard: React.FC<AdminEventBoardProps> = ({ onBack, onGoToApp }) => {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'events' | 'lostfound'>('events'); 
  
  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data State (Events)
  const [events, setEvents] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  
  // History Logs State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Modal & Form State (Events)
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<EventData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // --- 1. Auth & Role Logic ---
  useEffect(() => {
    if (!supabase) return;
    
    // Check session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
          checkUserRole(session.user.id);
          fetchEvents();
      } else {
          setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          checkUserRole(session.user.id);
          fetchEvents();
      } else {
          setUserRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
      if (!supabase) return;
      try {
          const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('id', userId)
            .single();
          
          if (data) {
              setUserRole(data.role as UserRole);
          } else {
              setUserRole('editor'); // Default fallback
          }
      } catch (err) {
          console.error("Error fetching role:", err);
          setUserRole('editor');
      } finally {
          setLoading(false);
      }
  };

  // --- Security Logging Function ---
  const logActivity = async (userEmail: string, action: string) => {
      if (!supabase) return;
      try {
          const ipRes = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipRes.json();
          const ip = ipData.ip || 'Unknown';
          const userAgent = navigator.userAgent;

          await supabase.from('activity_logs').insert([
              {
                  user_email: userEmail,
                  action: action,
                  ip_address: ip,
                  device_info: userAgent
              }
          ]);
      } catch (e) {
          console.error("Logging failed:", e);
      }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { alert("Chưa cấu hình Supabase!"); return; }
    
    setAuthLoading(true);
    setAuthError(null);
    playClick();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    } else {
        await logActivity(email, 'Đăng nhập thành công');
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    playClick();
    await supabase.auth.signOut();
    setSession(null);
    setUserRole(null);
    setEmail('');
    setPassword('');
  };

  // --- 2. Event CRUD Logic ---
  const fetchEvents = async () => {
    if (!supabase) return;
    setDataLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false }); 
    
    if (error) console.error(error);
    else setEvents(data || []);
    setDataLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!supabase) return;
    playClick();
    
    if (userRole !== 'admin') {
        alert("Bạn không có quyền xóa sự kiện!");
        return;
    }

    if (!window.confirm("Bạn có chắc chắn muốn xóa sự kiện này?")) return;

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) alert("Lỗi khi xóa: " + error.message);
    else {
      setEvents(prev => prev.filter(e => e.id !== id));
      if (session?.user?.email) {
          logActivity(session.user.email, `Xóa sự kiện ID: ${id}`);
      }
    }
  };

  const openAddModal = () => {
    playClick();
    setFormData(INITIAL_FORM);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (event: any) => {
    playClick();
    let deadlineStr = '';
    if (event.deadline) {
        deadlineStr = new Date(event.deadline).toISOString().split('T')[0];
    }

    setFormData({
      id: event.id,
      title: event.title || '',
      deadline: deadlineStr,
      category: event.category || '',
      criteria: event.criteria || 'III',
      points: event.points || '',
      organizer: event.organizer || '',
      link: event.link || '',
      location_type: event.location_type || 'Trong trường',
      format: event.format || 'Offline',
      status: event.status || 'Sắp diễn ra',
      is_manually_closed: event.is_manually_closed || false
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    playClick();
    setSubmitting(true);

    const payload = {
        title: formData.title,
        deadline: formData.deadline,
        category: formData.category,
        criteria: formData.criteria,
        points: formData.points,
        organizer: formData.organizer,
        link: formData.link,
        location_type: formData.location_type,
        format: formData.format,
        status: formData.status,
        is_manually_closed: formData.is_manually_closed
    };

    let error;
    if (isEditing && formData.id) {
        const { error: err } = await supabase
            .from('events')
            .update(payload)
            .eq('id', formData.id);
        error = err;
    } else {
        const { error: err } = await supabase
            .from('events')
            .insert([payload]);
        error = err;
    }

    setSubmitting(false);

    if (error) {
        alert("Lỗi: " + error.message);
    } else {
        setShowModal(false);
        fetchEvents();
        if (session?.user?.email) {
            logActivity(session.user.email, isEditing ? `Cập nhật sự kiện: ${formData.title}` : `Thêm mới sự kiện: ${formData.title}`);
        }
    }
  };

  // --- History Logic ---
  const fetchHistory = async () => {
      if (!supabase) return;
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) console.error(error);
      else setActivityLogs(data || []);
      setLoadingHistory(false);
  };

  const openHistoryModal = () => {
      playClick();
      setShowHistoryModal(true);
      fetchHistory();
  };

  // --- Render Loading ---
  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-50"><Loader2 className="animate-spin text-[#003375]" size={40}/></div>;

  // --- Render Login Screen ---
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
        <button 
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-[#003375] font-bold transition-colors"
        >
            <ArrowLeft size={20} /> Quay lại
        </button>

        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 animate-scaleIn">
            <div className="bg-[#003375] p-6 text-center">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                    <Shield className="text-white" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-white">Cổng Quản Trị</h2>
                <p className="text-blue-200 text-sm mt-1">Đăng nhập hệ thống (Admin & Editor)</p>
            </div>
            
            <div className="p-8 space-y-6">
                {authError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                        <AlertCircle size={16} className="shrink-0"/> {authError}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                            <input 
                                type="email" required 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                placeholder="name@hub.edu.vn"
                                value={email} onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mật khẩu</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                            <input 
                                type="password" required 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                placeholder="••••••••"
                                value={password} onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={authLoading} className="w-full bg-[#003375] text-white font-bold py-3 rounded-lg hover:bg-[#002855] transition-all active:scale-95 flex items-center justify-center gap-2">
                        {authLoading ? <Loader2 className="animate-spin"/> : 'Đăng nhập'}
                    </button>
                </form>
            </div>
        </div>
      </div>
    );
  }

  // --- Render Dashboard ---
  return (
    <div className="animate-fadeIn min-h-screen bg-gray-50 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Top Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
                        title="Quay lại trang chính"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-[#003375]">Hệ thống Quản trị</h2>
                            {userRole === 'admin' ? (
                                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold border border-red-200">Super Admin</span>
                            ) : (
                                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold border border-blue-200">Cộng tác viên</span>
                            )}
                        </div>
                        <p className="text-gray-500 text-sm">{session.user.email}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 justify-end">
                    {onGoToApp && (
                        <button 
                            onClick={onGoToApp}
                            className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95"
                        >
                            <ExternalLink size={18} /> Vào trang chính
                        </button>
                    )}
                    {userRole === 'admin' && (
                        <button 
                            onClick={openHistoryModal}
                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95"
                        >
                            <History size={18} /> <span className="hidden sm:inline">Lịch sử</span>
                        </button>
                    )}
                    <button 
                        onClick={handleLogout}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95"
                    >
                        <LogOut size={18} /> <span className="hidden sm:inline">Đăng xuất</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-gray-100">
                <button
                    onClick={() => { playClick(); setActiveView('events'); }}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeView === 'events' ? 'border-[#003375] text-[#003375]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Calendar size={18}/> Quản lý Sự kiện
                </button>
                <button
                    onClick={() => { playClick(); setActiveView('lostfound'); }}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeView === 'lostfound' ? 'border-[#990000] text-[#990000]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <SearchIcon size={18}/> Quản lý Tìm đồ
                </button>
            </div>
        </div>

        {/* Dynamic Content */}
        {activeView === 'lostfound' ? (
            <AdminLostFoundBoard userRole={userRole} />
        ) : (
            <>
                <div className="flex justify-end mb-4">
                    <button 
                        onClick={openAddModal}
                        className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95"
                    >
                        <Plus size={18} /> Thêm sự kiện
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-3">Tên sự kiện</th>
                                    <th className="px-6 py-3">Trạng thái</th>
                                    <th className="px-6 py-3">Hạn</th>
                                    <th className="px-6 py-3">BTC</th>
                                    <th className="px-6 py-3 text-center">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {dataLoading ? (
                                    <tr><td colSpan={5} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-[#003375]"/></td></tr>
                                ) : events.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">Chưa có sự kiện nào.</td></tr>
                                ) : (
                                    events.map((evt) => {
                                        let statusColor = 'bg-gray-100 text-gray-600 border-gray-200';
                                        if (evt.status === 'Sắp diễn ra') statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                                        else if (evt.status === 'Đang diễn ra') statusColor = 'bg-green-100 text-green-800 border-green-200';
                                        
                                        // Check manual close
                                        const isManuallyClosed = evt.is_manually_closed;

                                        return (
                                        <tr key={evt.id} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <div className="line-clamp-2">{evt.title}</div>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{evt.category}</span>
                                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold">+{evt.points} điểm</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-full border flex w-fit items-center gap-1 ${statusColor}`}>
                                                        <Circle size={8} fill="currentColor" /> {evt.status || 'Sắp diễn ra'}
                                                    </span>
                                                    {isManuallyClosed && (
                                                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200 font-bold">
                                                            Đã đóng link thủ công
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {evt.deadline ? new Date(evt.deadline).toLocaleDateString('vi-VN') : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600">{evt.organizer}</td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button 
                                                        onClick={() => openEditModal(evt)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" 
                                                        title="Sửa"
                                                    >
                                                        <Edit2 size={16}/>
                                                    </button>
                                                    
                                                    {/* RBAC: Only Admin can Delete */}
                                                    {userRole === 'admin' && (
                                                        <button 
                                                            onClick={() => handleDelete(evt.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors" 
                                                            title="Xóa"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )})
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-scaleIn">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white sticky top-0 z-10">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        {isEditing ? <Edit2 size={20}/> : <Plus size={20}/>}
                        {isEditing ? 'Cập nhật Sự kiện' : 'Thêm Sự kiện Mới'}
                    </h3>
                    <button onClick={() => setShowModal(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                        <X size={20}/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                        <input 
                            type="text" required 
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none"
                            value={formData.title}
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            placeholder="VD: Hội thảo Kỹ năng..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Trạng thái</label>
                            <select 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none bg-white"
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value})}
                            >
                                <option value="Sắp diễn ra">Sắp diễn ra</option>
                                <option value="Đang diễn ra">Đang diễn ra</option>
                                <option value="Đã kết thúc">Đã kết thúc</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Hạn tham gia</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                <input 
                                    type="date" 
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                    value={formData.deadline}
                                    onChange={e => setFormData({...formData, deadline: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Manual Closing Toggle */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                        <div>
                            <label className="font-bold text-gray-700 block mb-0.5">Đóng đăng ký sớm (Thủ công)</label>
                            <p className="text-xs text-gray-500">
                                Bật tùy chọn này để khóa nút "Tham gia" ngay lập tức, bất kể hạn deadline.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={formData.is_manually_closed}
                                onChange={e => setFormData({...formData, is_manually_closed: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                        </label>
                    </div>

                    {/* ... Rest of fields ... */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại (Tự nhập)</label>
                            <input 
                                type="text"
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                value={formData.category}
                                onChange={e => setFormData({...formData, category: e.target.value})}
                                placeholder="VD: Minigame, Cổ vũ..."
                            />
                         </div>
                         <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mục</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none bg-white"
                                value={formData.criteria}
                                onChange={e => setFormData({...formData, criteria: e.target.value})}
                            >
                                <option value="I">I</option>
                                <option value="II">II</option>
                                <option value="III">III</option>
                                <option value="IV">IV</option>
                                <option value="V">V</option>
                            </select>
                         </div>
                         <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Điểm</label>
                            <input 
                                type="text"
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none text-center font-bold text-[#990000]"
                                value={formData.points}
                                onChange={e => setFormData({...formData, points: e.target.value})}
                            />
                         </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Đơn vị tổ chức</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                <input 
                                    type="text" 
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                    value={formData.organizer}
                                    onChange={e => setFormData({...formData, organizer: e.target.value})}
                                />
                            </div>
                        </div>
                        <div>
                             <label className="block text-sm font-bold text-gray-700 mb-1">Hình thức</label>
                             <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none bg-white"
                                value={formData.format}
                                onChange={e => setFormData({...formData, format: e.target.value})}
                            >
                                <option value="Offline">Offline</option>
                                <option value="Online">Online</option>
                                <option value="Hỗn hợp">Hỗn hợp</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                <select 
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none bg-white"
                                    value={formData.location_type}
                                    onChange={e => setFormData({...formData, location_type: e.target.value})}
                                >
                                    <option value="Trong trường">Trong trường</option>
                                    <option value="Ngoài trường">Ngoài trường</option>
                                    <option value="Khác">Khác</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Link tham gia</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none"
                                value={formData.link}
                                onChange={e => setFormData({...formData, link: e.target.value})}
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                        >
                            Hủy
                        </button>
                        <button 
                            type="submit"
                            disabled={submitting}
                            className="flex-1 py-3 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            {submitting ? <Loader2 className="animate-spin"/> : <Save size={18}/>}
                            {submitting ? 'Đang lưu...' : 'Lưu sự kiện'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn">
                  <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0 rounded-t-xl">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                          <History size={20} /> Lịch sử hoạt động
                      </h3>
                      <button onClick={() => setShowHistoryModal(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-auto custom-scrollbar p-0">
                      {loadingHistory ? (
                          <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-[#003375]"/></div>
                      ) : (
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs sticky top-0">
                                  <tr>
                                      <th className="px-4 py-3">Thời gian</th>
                                      <th className="px-4 py-3">Email</th>
                                      <th className="px-4 py-3">Hành động</th>
                                      <th className="px-4 py-3">IP</th>
                                      <th className="px-4 py-3">Thiết bị</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {activityLogs.map(log => (
                                      <tr key={log.id} className="hover:bg-gray-50">
                                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                              {new Date(log.created_at).toLocaleString('vi-VN')}
                                          </td>
                                          <td className="px-4 py-3 font-medium">{log.user_email}</td>
                                          <td className="px-4 py-3">
                                              <span className={`px-2 py-1 rounded text-xs font-bold ${log.action.includes('Đăng nhập') ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                  {log.action}
                                              </span>
                                          </td>
                                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.ip_address}</td>
                                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate" title={log.device_info}>
                                              <div className="flex items-center gap-1">
                                                  <Monitor size={12}/> {log.device_info}
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                                  {activityLogs.length === 0 && (
                                      <tr><td colSpan={5} className="text-center py-8 text-gray-400">Chưa có lịch sử nào.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
