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
import { ActivityLogModal } from './components/ActivityLogModal';
import { HeaderUser } from './components/HeaderUser'; // New Component
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download, Search, HelpCircle, BookOpen, Clock } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { supabase } from './utils/supabase';
import { Session } from '@supabase/supabase-js';

// --- Default Data Generator ---
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

// --- Types ---
type AppRole = 'student' | 'ctv' | 'admin' | 'guest' | null;

interface UserState {
    session: Session | null;
    role: AppRole;
    isCloud: boolean;
    loading: boolean;
}

const App: React.FC = () => {
  // --- 1. Global Auth & Role State ---
  const [userState, setUserState] = useState<UserState>({
      session: null,
      role: null,
      isCloud: false,
      loading: true
  });

  // --- 2. App Data State ---
  const [data, setData] = useState<UserData>(INITIAL_DATA);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // --- 3. UI State ---
  const [activeView, setActiveView] = useState<'dashboard' | 'handbook' | 'events' | 'lost-found'>('dashboard');
  const [isImporting, setIsImporting] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTH & ROLE LOGIC ---
  const checkUser = async () => {
      setUserState(prev => ({ ...prev, loading: true }));

      // A. Check Supabase Session
      let currentSession = null;
      if (supabase) {
          const { data } = await supabase.auth.getSession();
          currentSession = data.session;
      }

      if (currentSession) {
          // CASE A: Logged In (Cloud Mode)
          const user = currentSession.user;
          const email = user.email || '';
          let detectedRole: AppRole = 'guest';

          // Step 1 & 2: Determine Role
          // 2.1 Admin Hardcode
          if (email === 'tqhoangg2@gmail.com') {
              detectedRole = 'admin';
          } else {
              // 2.2 Check 'profiles' table
              try {
                  const { data: profile } = await supabase!
                      .from('profiles')
                      .select('role')
                      .eq('id', user.id)
                      .single();
                  
                  if (profile?.role === 'admin') detectedRole = 'admin';
                  else if (profile?.role === 'editor') detectedRole = 'ctv';
                  else if (email.endsWith('@st.buh.edu.vn')) detectedRole = 'student';
              } catch (err) {
                  console.error("Profile fetch error", err);
                  // Fallback to student if email matches, else guest
                  if (email.endsWith('@st.buh.edu.vn')) detectedRole = 'student';
              }
          }

          // Step 3: Block Invalid Users
          if (detectedRole === 'guest') {
              alert('Email không hợp lệ. Vui lòng dùng Email trường (@st.buh.edu.vn) hoặc liên hệ Admin.');
              await supabase?.auth.signOut();
              setUserState({ session: null, role: null, isCloud: false, loading: false });
              return;
          }

          // Success
          setUserState({
              session: currentSession,
              role: detectedRole,
              isCloud: true,
              loading: false
          });

      } else {
          // CASE B: Not Logged In (Local/Anonymous Mode)
          const mode = localStorage.getItem('hub_login_mode');
          
          if (mode === 'anonymous') {
              setUserState({
                  session: null,
                  role: 'student',
                  isCloud: false, // LocalStorage
                  loading: false
              });
          } else {
              // Show Role Selection Screen
              setUserState({
                  session: null,
                  role: null,
                  isCloud: false,
                  loading: false
              });
          }
      }
  };

  useEffect(() => {
      checkUser();

      // Listen for Auth Changes
      const { data: { subscription } } = supabase?.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
              checkUser();
          }
      }) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => subscription.unsubscribe();
  }, []);


  // --- DATA LOADING LOGIC (LocalStorage) ---
  // Note: Even in Cloud mode, we currently use LS for 'Academic Data' (grades) 
  // to keep the app simple as per request, unless expanded later.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setData({ ...INITIAL_DATA, ...parsed });
      } catch (e) {
        console.error("Failed to load data", e);
      }
    }
    setIsDataLoaded(true);
  }, []);

  useEffect(() => {
    if (isDataLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isDataLoaded]);

  // --- HANDLERS ---

  const handleAnonymousSelect = () => {
      localStorage.setItem('hub_login_mode', 'anonymous');
      checkUser(); // Re-run check to update state
  };

  const handleAdminLoginSelect = () => {
      // Just redirect/prompt to login via Supabase (which RoleSelection handles)
      // Or if using a separate Admin login form:
      // setUserState(...)
      // Ideally, RoleSelection handles the Supabase trigger.
  };

  // Scroll to top
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeView]);

  // Actions
  const addSemester = () => {
    playClick();
    const newSem: Semester = { id: Date.now().toString(), name: `Học kỳ Mới`, subjects: [], trainingScore: null };
    setData(prev => ({ ...prev, semesters: [...prev.semesters, newSem] }));
  };

  const updateSemester = (index: number, updatedSem: Semester) => {
    const newSemesters = [...data.semesters];
    newSemesters[index] = updatedSem;
    setData(prev => ({ ...prev, semesters: newSemesters }));
  };

  const removeSemester = (index: number) => {
    playClick();
    if (window.confirm("Bạn có chắc muốn xóa học kỳ này không?")) {
        const newSemesters = data.semesters.filter((_, i) => i !== index);
        setData(prev => ({ ...prev, semesters: newSemesters }));
    }
  };

  const resetData = () => {
      playClick();
      if (window.confirm("Thao tác này sẽ xóa toàn bộ dữ liệu điểm trên máy này. Bạn có chắc không?")) {
        setData(INITIAL_DATA);
        localStorage.removeItem(STORAGE_KEY);
        // If Anonymous, maybe allow clearing mode too?
        if (!userState.isCloud && window.confirm("Bạn có muốn thoát chế độ Ẩn danh luôn không?")) {
            localStorage.removeItem('hub_login_mode');
            window.location.reload();
        }
      }
  };

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
            if (!newData.studentName && result.studentInfo.studentName) newData.studentName = result.studentInfo.studentName!;
            if (!newData.majorName && result.studentInfo.majorName) newData.majorName = result.studentInfo.majorName!;

            // Merge Logic (Simplified for brevity, same as before)
            let startYear = new Date().getFullYear();
            if (result.yearRanges.length > 0) startYear = Math.min(...result.yearRanges.map(y => y.start));
            const reconstructSemesters: Semester[] = [];
            const importedSemesters = result.semesters;
            for (let i = 0; i < 4; i++) {
                const curStart = startYear + i;
                const sem1Id = `imported_${curStart}_${curStart+1}_hk1`;
                const sem2Id = `imported_${curStart}_${curStart+1}_hk2`;
                const imp1 = importedSemesters.find(s => s.id === sem1Id);
                const imp2 = importedSemesters.find(s => s.id === sem2Id);
                reconstructSemesters.push(imp1 || { id: `generated_${curStart}_hk1`, name: `Năm học ${curStart}-${curStart+1} - Học kỳ 1`, subjects: [], trainingScore: null });
                reconstructSemesters.push(imp2 || { id: `generated_${curStart}_hk2`, name: `Năm học ${curStart}-${curStart+1} - Học kỳ 2`, subjects: [], trainingScore: null });
            }
            const standardIds = reconstructSemesters.map(s => s.id);
            reconstructSemesters.push(...importedSemesters.filter(s => !standardIds.includes(s.id)));

            return { ...newData, semesters: reconstructSemesters, hasOnboarded: true };
        });
        alert(`Đã nhập thành công!`);
    } catch (error) {
        console.error(error);
        alert("Lỗi khi đọc file PDF.");
    } finally {
        setIsImporting(false);
        setShowImportLoadingToast(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- RENDER LOGIC ---

  // 1. Loading
  if (userState.loading || !isDataLoaded) {
      return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#003375]" size={40}/></div>;
  }

  // 2. Role Selection (If no role determined)
  if (!userState.role) {
      return <RoleSelection onSelect={(role) => {
          if (role === 'student') handleAnonymousSelect();
          // if role === 'admin', RoleSelection UI handles login trigger or navigation
      }} />;
  }

  // 3. Onboarding (Only for Students, Local or Cloud, who haven't onboarded)
  if (userState.role === 'student' && !data.hasOnboarded) {
      return <Onboarding onComplete={(d) => setData(prev => ({ ...prev, ...d, hasOnboarded: true }))} />;
  }

  // 4. Main App
  return (
    <div className="min-h-screen pb-24 font-sans text-gray-800 bg-[#f8f9fa] animate-fadeIn">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b-2 border-[#003375] sticky top-0 z-40 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 relative flex-shrink-0 group cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95" onClick={playClick}>
                <img src="https://upload.wikimedia.org/wikipedia/vi/1/1a/Logo_HUB.png" alt="HUB Logo" className="h-full w-full object-contain drop-shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
             </div>
             <div>
                <h1 className="text-xl font-bold text-[#003375] tracking-tight uppercase group-hover:text-[#002855] transition-colors">HUB Planner</h1>
                <p className="text-[10px] text-gray-500 hidden md:block uppercase tracking-wider font-semibold text-[#990000]">Hỗ trợ sinh viên</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             {/* Navigation */}
             <div className="flex bg-gray-100 rounded-lg p-1 gap-1 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar shadow-inner">
                {[
                    { id: 'dashboard', icon: LayoutDashboard, label: 'Bảng điểm' },
                    { id: 'events', icon: Zap, label: 'Sự kiện ĐRL' },
                    { id: 'lost-found', icon: Search, label: 'Tìm đồ' },
                    { id: 'handbook', icon: Book, label: 'Cẩm nang' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => { playClick(); setActiveView(tab.id as any); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap active:scale-95 ${activeView === tab.id ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <tab.icon size={16} />
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
             </div>

             {/* Right Controls */}
             <div className="flex items-center gap-2 border-l border-gray-300 pl-4 ml-2">
                {/* Admin Activity Log */}
                {userState.role === 'admin' && (
                    <button onClick={() => { playClick(); setShowActivityLog(true); }} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90 relative group" title="Logs">
                        <Clock size={20} />
                    </button>
                )}

                <button onClick={() => { playClick(); setShowGuide(true); }} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90" title="Hướng dẫn">
                    <HelpCircle size={20} />
                </button>
                
                {/* Local Reset (Only visible if not cloud, or if student wants to clear local cache) */}
                {!userState.isCloud && (
                    <button onClick={resetData} className="p-2 text-gray-400 hover:text-[#990000] hover:bg-red-50 rounded-full transition-all duration-300 transform hover:rotate-180 active:scale-90" title="Reset Local Data">
                        <RotateCcw size={20} />
                    </button>
                )}

                {/* User Profile / Logout */}
                <HeaderUser session={userState.session} />
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeView === 'handbook' && <Handbook />}
        
        {activeView === 'events' && (
            // Role is passed inherently via context or checks inside EventsBoard, 
            // but we can pass it if we update EventsBoard to accept props.
            // For now, EventsBoard uses useUserRole hook which fetches session again.
            // Since we established session in App, the hook will pick it up.
            <EventsBoard />
        )}
        
        {activeView === 'lost-found' && <LostFoundBoard />}
        
        {activeView === 'dashboard' && (
            <div className="animate-slideInRight">
                <Dashboard 
                    data={data} 
                    onTargetChange={(newTarget) => setData(prev => ({...prev, targetGPA: newTarget}))}
                />

                <div className="flex flex-col sm:flex-row justify-between items-end mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-[#003375] border-l-4 border-[#990000] pl-3">Chi tiết bảng điểm</h2>
                    <div className="flex gap-2">
                        <button onClick={() => { playClick(); exportTranscriptToPdf(data); }} className="bg-white hover:bg-blue-50 text-[#003375] border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95 text-sm font-medium">
                            <Download size={18} /> Xuất PDF
                        </button>
                        <div>
                            <input type="file" accept=".pdf" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button onClick={() => { playClick(); setShowImportGuide(true); }} disabled={isImporting} className="bg-[#990000] hover:bg-[#7a0000] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95 text-sm font-medium disabled:opacity-70">
                                {isImporting ? <Loader2 className="animate-spin" size={18}/> : <FileUp size={18} />} Nhập PDF
                            </button>
                        </div>
                        <button onClick={addSemester} className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95 text-sm font-medium">
                            <Plus size={18} /> Thêm học kỳ
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    {data.semesters.map((sem, idx) => (
                        <SemesterTable key={sem.id} semester={sem} index={idx} onUpdateSemester={(updated) => updateSemester(idx, updated)} onRemoveSemester={() => removeSemester(idx)} />
                    ))}
                    {data.semesters.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-400 mb-4">Chưa có dữ liệu học kỳ nào.</p>
                            <div className="flex justify-center gap-4">
                                <button onClick={() => { playClick(); setShowImportGuide(true); }} className="text-[#003375] font-medium hover:underline flex items-center gap-1"><FileUp size={16}/> Nhập từ PDF</button>
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
      
      {showImportLoadingToast && (
            <div className="fixed bottom-4 right-4 bg-white shadow-xl p-4 rounded-xl border border-blue-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-sm">
                <Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" />
                <div className="flex-1"><p className="text-sm font-medium text-[#003375]">Đang xử lý dữ liệu PDF, vui lòng đợi...</p></div>
                <button onClick={() => setShowImportLoadingToast(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
      )}

      {/* Guide Modals (Simplified for brevity, logic remains same as previous App.tsx) */}
      {showImportGuide && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn border border-gray-200">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold text-lg flex items-center gap-2"><FileUp size={20} /> Hướng dẫn lấy file bảng điểm</h3>
                    <button onClick={() => { playClick(); setShowImportGuide(false); }} className="hover:bg-white/20 p-2 rounded-full"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-4 text-sm text-gray-700">
                        <p>1. Truy cập <a href="https://online.hub.edu.vn" target="_blank" className="text-blue-600 underline font-bold">Portal HUB</a></p>
                        <p>2. Vào mục <strong>Xem điểm</strong>.</p>
                        <p>3. Nhấn <strong>Ctrl + P</strong> (In), chọn Lưu dưới dạng <strong>PDF</strong>.</p>
                        <p>4. Tải file PDF đó lên đây.</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3 items-start text-sm text-orange-800">
                        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                        <p>Chỉ hỗ trợ file PDF xuất từ máy tính (PC/Laptop).</p>
                    </div>
                    <div className="pt-4 border-t border-gray-100 flex gap-3">
                        <button onClick={() => { playClick(); setShowImportGuide(false); }} className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl">Để sau</button>
                        <button onClick={() => { playClick(); fileInputRef.current?.click(); }} className="flex-1 bg-[#990000] text-white py-3 rounded-xl font-bold hover:bg-[#7a0000] flex items-center justify-center gap-2"><FileUp size={18}/> Chọn file PDF</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {showGuide && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2"><BookOpen size={20} className="text-yellow-300" /> Hướng dẫn</h3>
                    <button onClick={() => { playClick(); setShowGuide(false); }} className="hover:bg-white/20 p-2 rounded-full"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-gray-700">
                    <p>Chào mừng bạn đến với HUB Planner...</p>
                </div>
            </div>
        </div>
      )}

      {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
    </div>
  );
};

export default App;
