import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { LogOut, Plus, Edit2, Trash2, Save, X, Loader2, Calendar, MapPin, Lock, User, Key, CheckCircle2, AlertCircle, ArrowLeft, Shield, Mail, Send } from 'lucide-react';
import { playClick } from '../utils/audio';

interface AdminEventBoardProps {
    onBack: () => void;
}

// --- Types ---
interface EventData {
  id?: number;
  title: string;
  deadline: string; // YYYY-MM-DD
  category: string; // Phân loại (Minigame...)
  criteria: string; // Mục (I, II...)
  points: string;
  organizer: string;
  link: string;
  location_type: string;
  format: string; // Online/Offline
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
  format: 'Offline'
};

type LoginMethod = 'password' | 'otp';
type UserRole = 'admin' | 'editor' | null;

export const AdminEventBoard: React.FC<AdminEventBoardProps> = ({ onBack }) => {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  
  // Auth State
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  // Data State
  const [events, setEvents] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  
  // Modal & Form State
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
              // Fallback if no role assigned, treat as least privileged or handle error
              setUserRole('editor'); 
          }
      } catch (err) {
          console.error("Error fetching role:", err);
          setUserRole('editor');
      } finally {
          setLoading(false);
      }
  };

  const handleLoginPassword = async (e: React.FormEvent) => {
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
    }
    // Auth state change listener will handle success
  };

  const handleSendOtp = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!supabase) return;
      setAuthLoading(true);
      setAuthError(null);
      playClick();

      const { error } = await supabase.auth.signInWithOtp({ email });

      if (error) {
          setAuthError(error.message);
      } else {
          setAuthSuccessMsg("Mã OTP đã được gửi vào email của bạn!");
          setShowOtpInput(true);
      }
      setAuthLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!supabase) return;
      setAuthLoading(true);
      setAuthError(null);
      playClick();

      const { error } = await supabase.auth.verifyOtp({
          email,
          token: otpCode,
          type: 'email'
      });

      if (error) {
          setAuthError("Mã OTP không đúng hoặc đã hết hạn.");
          setAuthLoading(false);
      }
      // Auth state change listener will handle success
  };

  const handleLogout = async () => {
    if (!supabase) return;
    playClick();
    await supabase.auth.signOut();
    setSession(null);
    setUserRole(null);
    setEmail('');
    setPassword('');
    setOtpCode('');
    setShowOtpInput(false);
  };

  // --- 2. CRUD Logic ---
  const fetchEvents = async () => {
    if (!supabase) return;
    setDataLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('deadline', { ascending: false }); // Mới nhất lên đầu
    
    if (error) console.error(error);
    else setEvents(data || []);
    setDataLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!supabase) return;
    playClick();
    
    // Double check role on client side
    if (userRole !== 'admin') {
        alert("Bạn không có quyền xóa sự kiện!");
        return;
    }

    if (!window.confirm("Bạn có chắc chắn muốn xóa sự kiện này?")) return;

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) alert("Lỗi khi xóa: " + error.message);
    else {
      setEvents(prev => prev.filter(e => e.id !== id));
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
      format: event.format || 'Offline'
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
        format: formData.format
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
    }
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
                <p className="text-blue-200 text-sm mt-1">Hệ thống quản lý sự kiện HUB</p>
            </div>

            {/* Login Tabs */}
            <div className="flex border-b border-gray-100">
                <button 
                    onClick={() => { playClick(); setLoginMethod('password'); setAuthError(null); }}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${loginMethod === 'password' ? 'text-[#003375] border-b-2 border-[#003375] bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    Admin (Password)
                </button>
                <button 
                    onClick={() => { playClick(); setLoginMethod('otp'); setAuthError(null); }}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${loginMethod === 'otp' ? 'text-[#003375] border-b-2 border-[#003375] bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    CTV (OTP Email)
                </button>
            </div>
            
            {/* Login Forms */}
            <div className="p-8 space-y-6">
                {authError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                        <AlertCircle size={16} className="shrink-0"/> {authError}
                    </div>
                )}
                {authSuccessMsg && (
                    <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-green-100">
                        <CheckCircle2 size={16} className="shrink-0"/> {authSuccessMsg}
                    </div>
                )}

                {loginMethod === 'password' ? (
                    <form onSubmit={handleLoginPassword} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Email Admin</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                <input 
                                    type="email" required 
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                    placeholder="admin@hub.edu.vn"
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
                ) : (
                    <form onSubmit={showOtpInput ? handleVerifyOtp : handleSendOtp} className="space-y-4">
                        {!showOtpInput ? (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Email CTV</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                    <input 
                                        type="email" required 
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                        placeholder="ctv@hub.edu.vn"
                                        value={email} onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Chúng tôi sẽ gửi mã đăng nhập 6 số qua email này.</p>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nhập mã OTP</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                    <input 
                                        type="text" required 
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none tracking-widest text-center font-bold text-lg"
                                        placeholder="123456"
                                        value={otpCode} onChange={e => setOtpCode(e.target.value)}
                                        maxLength={6}
                                    />
                                </div>
                                <button type="button" onClick={() => setShowOtpInput(false)} className="text-xs text-[#003375] hover:underline mt-2">Gửi lại mã?</button>
                            </div>
                        )}
                        <button type="submit" disabled={authLoading} className="w-full bg-[#003375] text-white font-bold py-3 rounded-lg hover:bg-[#002855] transition-all active:scale-95 flex items-center justify-center gap-2">
                            {authLoading ? <Loader2 className="animate-spin"/> : (showOtpInput ? 'Xác thực OTP' : 'Gửi mã đăng nhập')}
                        </button>
                    </form>
                )}
            </div>
        </div>
      </div>
    );
  }

  // --- Render Dashboard ---
  return (
    <div className="animate-fadeIn min-h-screen bg-gray-50 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
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
                        <h2 className="text-2xl font-bold text-[#003375]">Quản lý Sự kiện</h2>
                        {userRole === 'admin' ? (
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold border border-red-200">Super Admin</span>
                        ) : (
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold border border-blue-200">Cộng tác viên</span>
                        )}
                    </div>
                    <p className="text-gray-500 text-sm">{session.user.email}</p>
                </div>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={openAddModal}
                    className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95"
                >
                    <Plus size={18} /> Thêm sự kiện
                </button>
                <button 
                    onClick={handleLogout}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95"
                >
                    <LogOut size={18} /> Đăng xuất
                </button>
            </div>
        </div>

        {/* Events Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-xs">
                        <tr>
                            <th className="px-6 py-3">Tên sự kiện</th>
                            <th className="px-6 py-3">Hạn</th>
                            <th className="px-6 py-3">BTC</th>
                            <th className="px-6 py-3">Điểm</th>
                            <th className="px-6 py-3 text-center">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {dataLoading ? (
                            <tr><td colSpan={5} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-[#003375]"/></td></tr>
                        ) : events.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-8 text-gray-500">Chưa có sự kiện nào.</td></tr>
                        ) : (
                            events.map((evt) => (
                                <tr key={evt.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        <div className="line-clamp-2">{evt.title}</div>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{evt.category}</span>
                                            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{evt.location_type}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                        {evt.deadline ? new Date(evt.deadline).toLocaleDateString('vi-VN') : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{evt.organizer}</td>
                                    <td className="px-6 py-4 font-bold text-[#990000]">{evt.points}</td>
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
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
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

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none bg-white"
                                value={formData.category}
                                onChange={e => setFormData({...formData, category: e.target.value})}
                            >
                                <option value="Hoạt động phong trào">Hoạt động phong trào</option>
                                <option value="Học thuật">Học thuật</option>
                                <option value="Minigame">Minigame</option>
                                <option value="Cổ vũ">Cổ vũ</option>
                                <option value="Tình nguyện">Tình nguyện</option>
                                <option value="Khác">Khác</option>
                            </select>
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

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Link tham gia</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none"
                            value={formData.link}
                            onChange={e => setFormData({...formData, link: e.target.value})}
                            placeholder="https://facebook.com/..."
                        />
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
    </div>
  );
};
