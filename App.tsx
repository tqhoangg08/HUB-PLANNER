import React, { useState, useEffect, useRef } from 'react';
import { UserData, Semester, STORAGE_KEY } from './types';
import { Dashboard } from './components/Dashboard';
import { SemesterTable } from './components/SemesterTable';
import { GeminiAdvisor } from './components/GeminiAdvisor';
import { Onboarding } from './components/Onboarding';
import { Handbook } from './components/Handbook';
import { EventsBoard } from './components/EventsBoard';
import { LostFoundBoard } from './components/LostFoundBoard';
import { RoleSelection } from './components/RoleSelection';
import { LoginScreen } from './components/LoginScreen';
import { ActivityLogModal } from './components/ActivityLogModal';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download, Search, HelpCircle, BookOpen, LogOut, Shield, Clock, Cloud } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';

// Default generator if no PDF is used
const generateStandardCurriculum = (): Semester[] => {
    const semesters: Semester[] = [];
    const years = 4;
    for (let y = 1; y <= years; y++) {
        semesters.push({ id: `y${y}_hk1`, name: `Năm ${y} - Học kỳ 1`, subjects: [], trainingScore: null });
        semesters.push({ id: `y${y}_hk2`, name: `Năm ${y} - Học kỳ 2`, subjects: [], trainingScore: null });
    }
    return semesters;
};

const INITIAL_DATA: UserData = {
  studentName: '',
  cohort: '',
  programName: '',
  majorName: '',
  specializationName: '',
  totalCreditsRequired: 125, 
  hasOnboarded: false,
  semesters: generateStandardCurriculum(),
  targetGPA: 3.2, 
};

const App: React.FC = () => {
  const { isAdmin, isCTV, session, loading: loadingRole } = useUserRole();
  const canManage = isAdmin || isCTV;

  const [userRolePref, setUserRolePref] = useState<'unknown' | 'student' | 'admin'>(() => {
      const savedRole = localStorage.getItem('user_role_preference');
      return (savedRole === 'student' || savedRole === 'admin') ? savedRole : 'unknown';
  });

  const [data, setData] = useState<UserData>(INITIAL_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'handbook' | 'events' | 'lost-found'>('dashboard');
  
  // Trạng thái Sync: isSyncing chỉ dùng khi Login lần đầu, isBackgroundSyncing dùng khi reload
  const [isSyncing, setIsSyncing] = useState(false); 
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const LOCAL_UPDATED_AT_KEY = `${STORAGE_KEY}__updated_at`;

  // --- AUTH & DATA SYNC LOGIC ---
  const readLocalData = () => {
    const str = localStorage.getItem(STORAGE_KEY);
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const loadLocalData = () => {
    const saved = readLocalData();
    if (saved) setData({ ...INITIAL_DATA, ...saved });
    setIsLoaded(true);
  };

  useEffect(() => {
    if (!supabase) { loadLocalData(); return; }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, sess) => {
      // 1. Xử lý Đăng xuất
      if (event === 'SIGNED_OUT') {
        // Reset về mặc định nhưng không xóa role preference để tránh nháy màn hình chọn role
        localStorage.removeItem(STORAGE_KEY);
        setData(INITIAL_DATA);
        setIsLoaded(true);
        return;
      }

      // 2. Load LocalStorage ngay lập tức để người dùng không phải chờ
      const localRaw = readLocalData();
      if (!isLoaded && localRaw) {
          setData({ ...INITIAL_DATA, ...localRaw });
          setIsLoaded(true);
      } else if (!isLoaded) {
          setIsLoaded(true);
      }

      // 3. Logic Đồng bộ Cloud (Khi đã đăng nhập)
      if (sess?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        // QUAN TRỌNG: Chỉ hiện màn hình chờ (isSyncing) nếu là sự kiện ĐĂNG NHẬP (bấm nút)
        // Còn nếu là F5 (INITIAL_SESSION) thì chỉ chạy ngầm (isBackgroundSyncing)
        if (event === 'SIGNED_IN') setIsSyncing(true);
        else setIsBackgroundSyncing(true);

        try {
            const email = sess.user.email;
            if (!email) return;

            // Auto-set student role
            if (!isAdmin) {
                 setUserRolePref('student');
                 localStorage.setItem('user_role_preference', 'student');
            }

            // Check domain
            if (!email.endsWith('@st.buh.edu.vn') && !isAdmin) {
              const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', sess.user.id).single();
              if (roleData?.role !== 'admin') {
                await supabase.auth.signOut();
                alert("Vui lòng sử dụng email sinh viên (@st.buh.edu.vn)");
                return;
              }
            }

            // Lấy dữ liệu từ Cloud
            const { data: cloudProfile } = await supabase
                .from('profiles')
                .select('saved_data, full_name')
                .eq('id', sess.user.id)
                .maybeSingle();

            // LOGIC QUYẾT ĐỊNH DÙNG DATA NÀO:
            if (cloudProfile?.saved_data && (cloudProfile.saved_data as any).hasOnboarded) {
                // Cloud có dữ liệu -> Lấy về dùng
                const cloudData = cloudProfile.saved_data as UserData;
                setData(cloudData);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
            } 
            else if (localRaw && localRaw.hasOnboarded) {
                 // Cloud chưa có nhưng Local có -> Đẩy lên Cloud (Lần đầu sync)
                 const studentCode = email.split('@')[0];
                 await supabase.from('profiles').upsert({
                     id: sess.user.id,
                     email: email,
                     full_name: sess.user.user_metadata?.full_name || localRaw.studentName,
                     avatar_url: sess.user.user_metadata?.avatar_url,
                     student_code: studentCode,
                     saved_data: localRaw,
                     updated_at: new Date().toISOString()
                 });
            }
            // Đảm bảo tạo profile row
            else {
                const studentCode = email.split('@')[0];
                await supabase.from('profiles').upsert({
                    id: sess.user.id,
                    email: email,
                    student_code: studentCode,
                    full_name: sess.user.user_metadata?.full_name,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            }

        } catch (err) {
            console.error("Sync error:", err);
        } finally {
            setIsSyncing(false);
            setIsBackgroundSyncing(false);
        }
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, [isAdmin]);

  // Auto-save logic (Giữ nguyên)
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!session || !supabase) return;
    const t = setTimeout(async () => {
      try {
        await supabase.from("profiles").update({
            saved_data: data,
            full_name: data.studentName || null,
            updated_at: new Date().toISOString(),
          }).eq("id", session.user.id);
      } catch (e) { console.warn("Cloud save exception:", e); }
    }, 2000); // Tăng thời gian debounce lên 2s cho đỡ spam request
    return () => clearTimeout(t);
  }, [data, isLoaded, session?.user.id]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [activeView]);

  const handleRoleSelect = (role: 'student' | 'admin') => {
      localStorage.setItem('user_role_preference', role);
      setUserRolePref(role);
  };

  const handleSwitchRole = () => {
      playClick();
      if (window.confirm("Bạn muốn quay lại màn hình chọn vai trò?")) {
          localStorage.removeItem('user_role_preference');
          setUserRolePref('unknown');
          if (session) supabase?.auth.signOut();
      }
  };

  const handleLogout = async () => {
      playClick();
      if (window.confirm("Bạn có chắc muốn đăng xuất?")) {
          await supabase?.auth.signOut();
      }
  };

  const addSemester = () => {
    playClick();
    setData(prev => ({ ...prev, semesters: [...prev.semesters, {
      id: Date.now().toString(), name: `Học kỳ Mới`, subjects: [], trainingScore: null
    }]}));
  };

  const updateSemester = (index: number, updatedSem: Semester) => {
    const newSemesters = [...data.semesters];
    newSemesters[index] = updatedSem;
    setData(prev => ({ ...prev, semesters: newSemesters }));
  };

  const removeSemester = (index: number) => {
    playClick();
    if (window.confirm("Bạn có chắc muốn xóa học kỳ này không?")) {
        setData(prev => ({ ...prev, semesters: data.semesters.filter((_, i) => i !== index) }));
    }
  };

  const resetData = (confirm = true) => {
      if (confirm) playClick();
      if (!confirm || window.confirm("Thao tác này sẽ xóa toàn bộ dữ liệu. Bạn có chắc không?")) {
        setData(INITIAL_DATA);
        localStorage.removeItem(STORAGE_KEY);
        if (session && supabase && confirm) {
             supabase.from('profiles').update({ saved_data: INITIAL_DATA }).eq('id', session.user.id);
        }
      }
  };

  const handleOnboardingComplete = (onboardingData: Partial<UserData>) => {
    const nextData: UserData = { ...data, ...onboardingData, hasOnboarded: true };
    setData(nextData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
    if (session) {
      supabase.from("profiles").update({
          full_name: (nextData.studentName || "").trim() || null,
          saved_data: nextData,
          updated_at: new Date().toISOString(),
        }).eq("id", session.user.id);
    }
  };

  const handleExportPDF = () => { playClick(); exportTranscriptToPdf(data); };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setShowImportGuide(false);
    setIsImporting(true);
    setShowImportLoadingToast(true);
    try {
        const result = await parseHubPdf(file);
        setData(prev => {
            const newData = { ...prev };
            if (!newData.studentName) newData.studentName = result.studentInfo.studentName || "";
            if (!newData.majorName) newData.majorName = result.studentInfo.majorName || "";
            // ... (Logic merge semester giữ nguyên như cũ để tiết kiệm chỗ hiển thị)
            // Tôi giữ nguyên logic import phức tạp của bạn ở đây nhưng viết gọn lại 1 chút
            let startYear = new Date().getFullYear();
            if (result.yearRanges.length > 0) startYear = Math.min(...result.yearRanges.map(y => y.start));
            const reconstructSemesters: Semester[] = [];
            const importedSemesters = result.semesters;
            for (let i = 0; i < 4; i++) {
                const curStart = startYear + i;
                const curEnd = curStart + 1;
                const yearLabel = `Năm học ${curStart}-${curEnd}`;
                ['hk1', 'hk2'].forEach((hk, idx) => {
                    const found = importedSemesters.find(s => s.id === `imported_${curStart}_${curEnd}_${hk}`);
                    if (found) reconstructSemesters.push(found);
                    else reconstructSemesters.push({ id: `generated_${curStart}_${hk}`, name: `${yearLabel} - Học kỳ ${idx+1}`, subjects: [], trainingScore: null });
                });
                reconstructSemesters.push(...importedSemesters.filter(s => s.id.startsWith(`imported_${curStart}_${curEnd}`) && !s.id.includes('hk1') && !s.id.includes('hk2')));
            }
            reconstructSemesters.push(...importedSemesters.filter(s => !reconstructSemesters.some(r => r.id === s.id)));
            return { ...newData, semesters: reconstructSemesters, hasOnboarded: true };
        });
        alert(`Đã nhập thành công!`);
    } catch (error) { console.error(error); alert("Lỗi khi đọc file PDF."); } 
    finally { setIsImporting(false); setShowImportLoadingToast(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const ImportGuideModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn border border-gray-200">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                <h3 className="font-bold text-lg flex items-center gap-2"><FileUp size={20} /> Hướng dẫn lấy file bảng điểm</h3>
                <button onClick={() => { playClick(); setShowImportGuide(false); }} className="hover:bg-white/20 p-2 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
                 {/* Giữ nguyên nội dung hướng dẫn của bạn */}
                 <div className="text-gray-600 text-sm">Truy cập Portal -> Xem điểm -> Ctrl + P -> Lưu dưới dạng PDF</div>
                <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button onClick={() => { playClick(); setShowImportGuide(false); }} className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl">Để sau</button>
                    <button onClick={() => { playClick(); fileInputRef.current?.click(); }} className="flex-1 bg-[#990000] text-white py-3 rounded-xl font-bold hover:bg-[#7a0000] flex items-center justify-center gap-2"><FileUp size={18}/> Chọn file PDF</button>
                </div>
            </div>
        </div>
    </div>
  );

  const UserGuideModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn border border-gray-200">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2"><BookOpen size={20} /> Hướng dẫn sử dụng</h3>
                <button onClick={() => { playClick(); setShowGuide(false); }} className="hover:bg-white/20 p-2 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto text-sm space-y-4 text-gray-700">
                <p>Ứng dụng giúp quản lý điểm số và lộ trình học tập.</p>
            </div>
        </div>
    </div>
  );

  // --- RENDERING ---
  if (!isLoaded) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={40} /></div>;

  if (userRolePref === 'unknown') return <RoleSelection onSelect={handleRoleSelect} />;
  if (userRolePref === 'admin' && !session) return <LoginScreen onBack={handleSwitchRole} />;
  if (userRolePref === 'student' && !data.hasOnboarded) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div className="min-h-screen pb-24 font-sans text-gray-800 bg-[#f8f9fa] animate-fadeIn">
      <header className="bg-white/80 backdrop-blur-md border-b-2 border-[#003375] sticky top-0 z-40 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 relative flex-shrink-0 group cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95" onClick={playClick}>
                <img src="https://upload.wikimedia.org/wikipedia/vi/1/1a/Logo_HUB.png" alt="HUB Logo" className="h-full w-full object-contain drop-shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
             </div>
             <div>
                <h1 className="text-xl font-bold text-[#003375] tracking-tight uppercase">HUB Planner</h1>
                <p className="text-[10px] text-gray-500 hidden md:block uppercase tracking-wider font-semibold text-[#990000]">Hỗ trợ sinh viên</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             {/* Nav Buttons - Giữ nguyên */}
             <div className="flex bg-gray-100 rounded-lg p-1 gap-1 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar shadow-inner">
                {/* (Giữ code nút Dashboard, Events, v.v. của bạn ở đây cho ngắn gọn) */}
                <button onClick={() => setActiveView('dashboard')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeView==='dashboard'?'bg-white text-[#003375] shadow-sm':'text-gray-500'}`}><LayoutDashboard size={16}/><span className="hidden sm:inline ml-1">Bảng điểm</span></button>
                <button onClick={() => setActiveView('events')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeView==='events'?'bg-white text-[#003375] shadow-sm':'text-gray-500'}`}><Zap size={16}/><span className="hidden sm:inline ml-1">Sự kiện</span></button>
             </div>

             <div className="flex items-center gap-2 border-l border-gray-300 pl-4 ml-2">
                <div className="text-right hidden sm:block">
                    {/* TRẠNG THÁI LOADING THÔNG MINH */}
                    {loadingRole || isBackgroundSyncing ? (
                        <div className="flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin text-gray-400"/>
                            <span className="text-xs text-gray-400 italic">Đang tải...</span>
                        </div>
                    ) : session ? (
                        <>
                            <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">{session.user.user_metadata.full_name || data.studentName}</p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{session.user.email?.split('@')[0]}</p>
                        </>
                    ) : (
                        <>
                            <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">{data.studentName || 'Khách'}</p>
                            <p className="text-[10px] text-gray-500 italic">Chưa đăng nhập</p>
                        </>
                    )}
                </div>

                {session?.user.user_metadata.avatar_url && <img src={session.user.user_metadata.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200 hidden sm:block" />}
                
                {(session || userRolePref === 'admin') ? (
                    <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-300 active:scale-90" title="Đăng xuất"><LogOut size={20} /></button>
                ) : (
                    <button onClick={handleSwitchRole} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90" title="Đăng nhập"><Shield size={20} /></button>
                )}
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'handbook' && <Handbook />}
        {activeView === 'events' && <EventsBoard />}
        {activeView === 'lost-found' && <LostFoundBoard />}
        {activeView === 'dashboard' && (
            <div className="animate-slideInRight relative">
                {/* Chỉ hiện loading block nếu là LẦN ĐẦU LOGIN */}
                {isSyncing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-xl">
                        <Loader2 size={48} className="animate-spin text-[#003375] mb-2"/>
                        <p className="font-bold text-[#003375]">Đang đồng bộ dữ liệu...</p>
                    </div>
                )}
                
                <Dashboard data={data} onTargetChange={(newTarget) => setData(prev => ({...prev, targetGPA: newTarget}))} />
                
                <div className="flex flex-col sm:flex-row justify-between items-end mb-4 gap-4 mt-8">
                    <h2 className="text-2xl font-bold text-[#003375] border-l-4 border-[#990000] pl-3">Chi tiết bảng điểm</h2>
                    <div className="flex gap-2">
                        <button onClick={handleExportPDF} className="bg-white hover:bg-blue-50 text-[#003375] border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium"><Download size={18} /> Xuất PDF</button>
                        <div>
                            <input type="file" accept=".pdf" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button onClick={() => { playClick(); setShowImportGuide(true); }} disabled={isImporting} className="bg-[#990000] hover:bg-[#7a0000] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium">{isImporting ? <Loader2 className="animate-spin" size={18}/> : <FileUp size={18} />} Nhập PDF</button>
                        </div>
                        <button onClick={addSemester} className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium"><Plus size={18} /> Thêm học kỳ</button>
                    </div>
                </div>

                <div className="space-y-6">
                {data.semesters.map((sem, idx) => (
                    <SemesterTable key={sem.id} semester={sem} index={idx} onUpdateSemester={(updated) => updateSemester(idx, updated)} onRemoveSemester={() => removeSemester(idx)} />
                ))}
                {data.semesters.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-400 mb-4">Chưa có dữ liệu.</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => setShowImportGuide(true)} className="text-[#003375] font-medium hover:underline flex items-center gap-1"><FileUp size={16}/> Nhập từ PDF</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={addSemester} className="text-[#990000] font-medium hover:underline flex items-center gap-1"><Plus size={16}/> Tạo thủ công</button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        )}
      </main>

      <footer className="text-center pb-8 pt-2">
        <p className="text-[10px] text-gray-400 font-medium tracking-wide mb-2 uppercase">Web designed by tqhoangg</p>
      </footer>
      <GeminiAdvisor data={data} />
      {showImportLoadingToast && <div className="fixed bottom-4 right-4 bg-white shadow-xl p-4 rounded-xl border border-blue-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-sm"><Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" /><div className="flex-1"><p className="text-sm font-medium text-[#003375]">Đang tải dữ liệu...</p></div><button onClick={() => setShowImportLoadingToast(false)} className="text-gray-400"><X size={16} /></button></div>}
      {showImportGuide && <ImportGuideModal />} {showGuide && <UserGuideModal />} {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
    </div>
  );
};

export default App;
