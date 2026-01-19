import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfUse } from './components/TermsOfUse';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download, Search, HelpCircle, BookOpen, LogOut, Shield, Clock, Facebook, Phone, Mail } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const STUDENT_PROFILE_TABLE = 'profiles';

// Default generator if no PDF is used
const generateStandardCurriculum = (): Semester[] => {
    const semesters: Semester[] = [];
    const years = 4;
    
    for (let y = 1; y <= years; y++) {
        semesters.push({
            id: `y${y}_hk1`,
            name: `Năm ${y} - Học kỳ 1`,
            subjects: [],
            trainingScore: null
        });
        semesters.push({
            id: `y${y}_hk2`,
            name: `Năm ${y} - Học kỳ 2`,
            subjects: [],
            trainingScore: null
        });
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
  targetGPA: 3.2, // Default target for Good degree
};

const App: React.FC = () => {
  // Global Role Hook
  const { isAdmin, isCTV, session, loading: loadingRole } = useUserRole();
  const canManage = isAdmin || isCTV;
  const navigate = useNavigate();

  // Local Preference Role (User selected in RoleSelection)
  const [userRolePref, setUserRolePref] = useState<'unknown' | 'student' | 'admin' | 'school'>(() => {
      const savedRole = localStorage.getItem('user_role_preference');
      return (savedRole === 'student' || savedRole === 'admin' || savedRole === 'school') ? savedRole : 'unknown';
  });

  // App Data State (For Student Role)
  const [data, setData] = useState<UserData>(INITIAL_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [profileFullName, setProfileFullName] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [draftFullName, setDraftFullName] = useState('');
  const [draftAvatarUrl, setDraftAvatarUrl] = useState('');
  const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
  const [draftAvatarPreview, setDraftAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'handbook' | 'events' | 'lost-found'>('dashboard');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = useMemo(() => {
    if (userRolePref === 'school' && session?.user?.id) {
      return `${STORAGE_KEY}:${session.user.id}`;
    }

    return STORAGE_KEY;
  }, [session?.user?.id, userRolePref]);

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;
    setIsLoaded(false);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    const loadData = async () => {
      if (userRolePref === 'school' && session?.user?.id && supabase) {
        const { data: profileData, error } = await supabase
          .from(STUDENT_PROFILE_TABLE)
          .select('data, full_name, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!isActive) return;

        if (error) {
          console.error('Failed to load profile data:', error);
        }

        if (profileData?.full_name || profileData?.avatar_url) {
          setProfileFullName(profileData?.full_name ?? '');
          setProfileAvatarUrl(profileData?.avatar_url ?? '');
        }

        if (profileData?.data) {
          setData({ ...INITIAL_DATA, ...profileData.data });
          localStorage.setItem(storageKey, JSON.stringify(profileData.data));
          setIsLoaded(true);
          return;
        }

        if (!error) {
          setProfileFullName(profileData?.full_name ?? '');
          setProfileAvatarUrl(profileData?.avatar_url ?? '');
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setData({ ...INITIAL_DATA, ...parsed });
            } catch (e) {
              console.error("Failed to load data", e);
              setData(INITIAL_DATA);
            }
          } else {
            setData(INITIAL_DATA);
          }
          setIsLoaded(true);
          return;
        }
      }

      if (userRolePref !== 'school') {
        setProfileFullName('');
        setProfileAvatarUrl('');
      }

      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setData({ ...INITIAL_DATA, ...parsed });
        } catch (e) {
          console.error("Failed to load data", e);
          setData(INITIAL_DATA);
        }
      } else {
        setData(INITIAL_DATA);
      }
      setIsLoaded(true);
    };

    loadData();

    return () => {
      isActive = false;
    };
  }, [storageKey, session?.user?.id, userRolePref]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  }, [data, isLoaded, storageKey]);

  useEffect(() => {
    if (!isLoaded) return;
    if (userRolePref !== 'school' || !session?.user?.id || !supabase) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const payload = {
        id: session.user.id,
        data,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(STUDENT_PROFILE_TABLE)
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.error('Failed to save profile data:', error);
      }
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, isLoaded, session?.user?.id, userRolePref]);

  useEffect(() => {
    if (showAccountSettings) {
      setDraftFullName(profileFullName);
      setDraftAvatarUrl(profileAvatarUrl);
      setDraftAvatarFile(null);
      setDraftAvatarPreview('');
      setProfileError(null);
    }
  }, [showAccountSettings, profileFullName, profileAvatarUrl]);

  useEffect(() => {
    return () => {
      if (draftAvatarPreview) {
        URL.revokeObjectURL(draftAvatarPreview);
      }
    };
  }, [draftAvatarPreview]);

  // Scroll to top when switching views
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeView]);

  useEffect(() => {
    const ensureSchoolDomain = async () => {
        if (userRolePref !== 'school' || !session?.user?.email) return;
        const emailDomain = session.user.email.split('@')[1];
        if (emailDomain !== SCHOOL_DOMAIN) {
            await supabase?.auth.signOut();
            alert(`Vui lòng dùng tài khoản @${SCHOOL_DOMAIN} để đăng nhập.`);
        }
    };

    ensureSchoolDomain();
  }, [session, userRolePref]);

  const setRolePreference = useCallback((role: 'student' | 'admin' | 'school') => {
      localStorage.setItem('user_role_preference', role);
      setUserRolePref(role);
  }, []);

  const handleRoleSelect = (role: 'student' | 'admin' | 'school') => {
      setRolePreference(role);
  };

  const handleSwitchRole = () => {
      playClick();
      if (window.confirm("Bạn muốn quay lại màn hình chọn vai trò?")) {
          localStorage.removeItem('user_role_preference');
          setUserRolePref('unknown');
          if (session) {
              supabase?.auth.signOut();
          }
          navigate('/');
      }
  };

  const handleLogout = async () => {
      const isGuest = userRolePref === 'student' && !session;
      if (isGuest) {
          localStorage.removeItem('user_role_preference');
          setUserRolePref('unknown');
          navigate('/');
          return;
      }
      playClick();
      if (window.confirm("Đăng xuất khỏi tài khoản quản trị?")) {
          await supabase?.auth.signOut();
          // Stay on admin role pref but show login screen
          navigate('/');
      }
  };

  const handleSchoolLogout = async () => {
      playClick();
      if (window.confirm("Đăng xuất khỏi tài khoản HUB?")) {
          await supabase?.auth.signOut();
          // Stay on school role pref but show login screen
          navigate('/');
      }
  };

  const handleMenuLogout = async () => {
    setIsUserMenuOpen(false);
    await handleSchoolLogout();
  };

  const handleSaveProfile = async () => {
    if (!session?.user?.id || !supabase) return;
    setProfileSaving(true);
    setProfileError(null);

    let avatarUrlToSave = draftAvatarUrl.trim();

    if (draftAvatarFile) {
      const fileExt = draftAvatarFile.name.split('.').pop() || 'png';
      const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, draftAvatarFile, { upsert: true });

      if (uploadError) {
        setProfileError('Không thể tải ảnh lên. Vui lòng thử lại.');
        setProfileSaving(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      avatarUrlToSave = publicData.publicUrl;
    }

    const { error } = await supabase
      .from(STUDENT_PROFILE_TABLE)
      .update({
        full_name: draftFullName.trim(),
        avatar_url: avatarUrlToSave,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (error) {
      setProfileError('Không thể lưu thông tin. Vui lòng thử lại.');
      setProfileSaving(false);
      return;
    }

    setProfileFullName(draftFullName.trim());
    setProfileAvatarUrl(avatarUrlToSave);
    setDraftAvatarFile(null);
    if (draftAvatarPreview) {
      URL.revokeObjectURL(draftAvatarPreview);
      setDraftAvatarPreview('');
    }
    setProfileSaving(false);
    setShowAccountSettings(false);
  };

  const displayName = useMemo(() => {
    if (profileFullName.trim()) return profileFullName.trim();
    return session?.user?.email ?? 'HUB User';
  }, [profileFullName, session?.user?.email]);

  const avatarSeed = useMemo(() => {
    if (displayName.trim()) return displayName.trim()[0].toUpperCase();
    return 'H';
  }, [displayName]);

  const avatarColors = ['#1f2937', '#2563eb', '#16a34a', '#f97316', '#a855f7'];
  const isColorAvatar = profileAvatarUrl?.startsWith('#');
  const studentId = session?.user?.email?.split('@')[0] ?? '';

  const addSemester = () => {
    playClick();
    const newSem: Semester = {
      id: Date.now().toString(),
      name: `Học kỳ Mới`,
      subjects: [],
      trainingScore: null
    };
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

  const resetData = async () => {
      playClick();
      if (!window.confirm("Cảnh báo: Hành động này sẽ xóa toàn bộ dữ liệu điểm số và đăng xuất. Bạn có chắc không?")) {
        return;
      }

      try {
        setData(INITIAL_DATA);
        localStorage.clear();

        if (userRolePref === 'school' && session?.user?.id && supabase) {
          await supabase
            .from(STUDENT_PROFILE_TABLE)
            .delete()
            .eq('id', session.user.id);
        }

        if (supabase) {
          const { error } = await supabase.auth.signOut();
          if (error) {
            console.log("Lỗi đăng xuất:", error);
          }
        }
      } catch (error) {
        console.error("Lỗi khi reset:", error);
      } finally {
        localStorage.removeItem('user_role_preference');
        setUserRolePref('unknown');
        navigate('/');
      }
  };

  const handleOnboardingComplete = (onboardingData: Partial<UserData>) => {
      setData(prev => ({
          ...prev,
          ...onboardingData,
          hasOnboarded: true
      }));
  };

  const handleExportPDF = () => {
      playClick();
      exportTranscriptToPdf(data);
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
            if (!newData.studentName && result.studentInfo.studentName) {
                newData.studentName = result.studentInfo.studentName!;
            }
            if (!newData.majorName && result.studentInfo.majorName) {
                newData.majorName = result.studentInfo.majorName!;
            }

            let startYear = new Date().getFullYear();
            if (result.yearRanges.length > 0) {
                startYear = Math.min(...result.yearRanges.map(y => y.start));
            }

            const reconstructSemesters: Semester[] = [];
            const importedSemesters = result.semesters;

            for (let i = 0; i < 4; i++) {
                const curStart = startYear + i;
                const curEnd = curStart + 1;
                const yearLabel = `Năm học ${curStart}-${curEnd}`;
                
                const sem1Id = `imported_${curStart}_${curEnd}_hk1`;
                const importedSem1 = importedSemesters.find(s => s.id === sem1Id);
                
                if (importedSem1) {
                    reconstructSemesters.push(importedSem1);
                } else {
                    reconstructSemesters.push({
                        id: `generated_${curStart}_hk1`,
                        name: `${yearLabel} - Học kỳ 1`,
                        subjects: [],
                        trainingScore: null
                    });
                }

                const sem2Id = `imported_${curStart}_${curEnd}_hk2`;
                const importedSem2 = importedSemesters.find(s => s.id === sem2Id);
                
                if (importedSem2) {
                    reconstructSemesters.push(importedSem2);
                } else {
                    reconstructSemesters.push({
                        id: `generated_${curStart}_hk2`,
                        name: `${yearLabel} - Học kỳ 2`,
                        subjects: [],
                        trainingScore: null
                    });
                }

                const otherSems = importedSemesters.filter(s => 
                    s.id.startsWith(`imported_${curStart}_${curEnd}`) && 
                    !s.id.endsWith('hk1') && 
                    !s.id.endsWith('hk2')
                );

                if (otherSems.length > 0) {
                    reconstructSemesters.push(...otherSems);
                }
            }

            const standardIds = reconstructSemesters.map(s => s.id);
            const leftOvers = importedSemesters.filter(s => !standardIds.includes(s.id));
            reconstructSemesters.push(...leftOvers);

            return {
                ...newData,
                semesters: reconstructSemesters,
                hasOnboarded: true
            };
        });
        alert(`Đã nhập thành công và sắp xếp lại lộ trình học tập từ năm ${result.yearRanges[0]?.start || '...'}`);
    } catch (error) {
        console.error(error);
        alert("Lỗi khi đọc file PDF.");
    } finally {
        setIsImporting(false);
        setShowImportLoadingToast(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const ImportGuideModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn border border-gray-200">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <FileUp size={20} /> Hướng dẫn lấy file bảng điểm
                </h3>
                <button 
                    onClick={() => { playClick(); setShowImportGuide(false); }} 
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">1</div>
                        <div>
                            <p className="font-medium text-gray-900 mb-1">Truy cập Hub Portal</p>
                            <a 
                                href="https://online.hub.edu.vn" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[#003375] underline flex items-center gap-1 hover:text-blue-700 text-sm font-semibold hover:translate-x-1 transition-transform"
                                onClick={playClick}
                            >
                                https://online.hub.edu.vn <ExternalLink size={14}/>
                            </a>
                        </div>
                    </div>
                    
                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">2</div>
                        <div>
                            <p className="font-medium text-gray-900">Đăng nhập tài khoản sinh viên</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">3</div>
                        <div>
                            <p className="font-medium text-gray-900">Vào mục "Xem điểm"</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">4</div>
                        <div>
                            <p className="font-medium text-gray-900">Bấm tổ hợp phím <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-300 font-mono text-sm text-[#990000]">CTRL + P</span></p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">5</div>
                        <div>
                            <p className="font-medium text-gray-900">Tại hộp thoại in, chọn "Lưu dưới dạng PDF" (Save as PDF) và bấm Lưu</p>
                        </div>
                    </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3 items-start text-sm text-orange-800">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p>
                            <strong>Lưu ý quan trọng:</strong> Hiện tại tính năng này chỉ hỗ trợ file PDF được xuất từ <strong>máy tính (PC/Laptop)</strong>. File xuất từ điện thoại có thể gặp lỗi định dạng hoặc không nhận diện được dữ liệu.
                        </p>
                        <p>
                            Ngoài ra, điểm quá trình sẽ được hệ thống random (do file PDF chỉ hiện điểm tổng kết) để khớp GPA.
                        </p>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button 
                        onClick={() => { playClick(); setShowImportGuide(false); }}
                        className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                    >
                        Để sau
                    </button>
                    <button 
                        onClick={() => { playClick(); fileInputRef.current?.click(); }}
                        className="flex-1 bg-[#990000] text-white py-3 rounded-xl font-bold hover:bg-[#7a0000] hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 transform hover:-translate-y-0.5"
                    >
                        <FileUp size={18}/>
                        Chọn file PDF
                    </button>
                </div>
            </div>
        </div>
    </div>
  );

  const UserGuideModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <BookOpen size={20} className="text-yellow-300" /> Hướng dẫn sử dụng HUB Planner
                </h3>
                <button 
                    onClick={() => { playClick(); setShowGuide(false); }} 
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar text-sm space-y-6 text-gray-700 leading-relaxed">
                <p>Ứng dụng này được thiết kế như một "trợ lý học tập" toàn diện, giúp sinh viên quản lý điểm số, lập kế hoạch GPA, theo dõi điểm rèn luyện và tìm kiếm thông tin tiện ích.</p>
                {/* ... existing guide content ... */}
            </div>
        </div>
    </div>
  );

  const AccountSettingsModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-scaleIn">
            <div className="bg-[#003375] p-4 text-white flex items-center justify-between">
                <h3 className="font-bold text-lg">Cài đặt tài khoản</h3>
                <button
                    onClick={() => setShowAccountSettings(false)}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="p-6 space-y-5">
                {profileError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                        {profileError}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Tên hiển thị</label>
                    <input
                        type="text"
                        value={draftFullName}
                        onChange={(e) => setDraftFullName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none transition-all"
                        placeholder="Nhập tên hiển thị"
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-bold text-gray-700">Chọn màu avatar</label>
                    <div className="flex gap-2">
                        {avatarColors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => {
                                    if (draftAvatarPreview) {
                                        URL.revokeObjectURL(draftAvatarPreview);
                                        setDraftAvatarPreview('');
                                    }
                                    setDraftAvatarFile(null);
                                    setDraftAvatarUrl(color);
                                }}
                                className={`h-10 w-10 rounded-full border-2 transition-all ${draftAvatarUrl === color ? 'border-[#003375] ring-2 ring-[#003375]/20' : 'border-transparent'}`}
                                style={{ backgroundColor: color }}
                                title={`Màu ${color}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Tải ảnh đại diện</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (draftAvatarPreview) {
                                URL.revokeObjectURL(draftAvatarPreview);
                            }
                            const previewUrl = URL.createObjectURL(file);
                            setDraftAvatarFile(file);
                            setDraftAvatarPreview(previewUrl);
                            setDraftAvatarUrl('');
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none transition-all"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Xem trước:</span>
                    {draftAvatarPreview ? (
                        <img
                            src={draftAvatarPreview}
                            alt="Avatar preview"
                            className="h-10 w-10 rounded-full object-cover border border-gray-200"
                        />
                    ) : draftAvatarUrl ? (
                        draftAvatarUrl.startsWith('#') ? (
                            <span
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                style={{ backgroundColor: draftAvatarUrl }}
                            >
                                {avatarSeed}
                            </span>
                        ) : (
                            <img
                                src={draftAvatarUrl}
                                alt="Avatar preview"
                                className="h-10 w-10 rounded-full object-cover border border-gray-200"
                            />
                        )
                    ) : (
                        <span className="h-10 w-10 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold">
                            {avatarSeed}
                        </span>
                    )}
                </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                <button
                    onClick={() => setShowAccountSettings(false)}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                    Hủy
                </button>
                <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="px-4 py-2 rounded-lg bg-[#003375] text-white font-bold hover:bg-[#002855] transition flex items-center gap-2"
                >
                    {profileSaving ? <Loader2 className="animate-spin" size={16} /> : null}
                    Lưu
                </button>
            </div>
        </div>
    </div>
  );

  // --- ROUTING LOGIC ---
  const renderProtectedApp = () => {
    if (!isLoaded) return null;

    // 1. Role Selection Screen
    if (userRolePref === 'unknown' && !session) {
        return <RoleSelection onSelect={handleRoleSelect} />;
    }

    // 2. Admin Flow (Login Check)
    if (userRolePref === 'admin') {
        if (loadingRole) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={40}/></div>;
        
        // If not logged in, show Login Screen
        if (!session) {
            return <LoginScreen />;
        }
        
        // If logged in, proceed to Main App (In-place Management Mode)
    }

    // 3. School Account Flow (Google) - Login Check
    if (userRolePref === 'school') {
        if (loadingRole) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={40}/></div>;

        if (!session) {
            return <LoginScreen />;
        }
    }

    // 4. Student Flow - Check onboarding
    if ((userRolePref === 'student' || userRolePref === 'school') && !data.hasOnboarded) {
        return <Onboarding onComplete={handleOnboardingComplete} />;
    }

    return (
    <div className="min-h-screen pb-12 font-sans text-gray-800 bg-[#f8f9fa] animate-fadeIn">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b-2 border-[#003375] fixed top-0 left-0 w-full z-50 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-0 min-h-[64px] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
             {/* HUB Logo */}
             <div className="h-10 w-10 relative flex-shrink-0 group cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95" onClick={playClick}>
                <img 
                    src="logo.png" 
                    alt="HUB Logo" 
                    className="h-full w-full object-contain drop-shadow-sm"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<div class="h-10 w-10 bg-[#003375] rounded flex items-center justify-center text-white font-bold text-xs shadow-md">HUB</div>';
                    }}
                />
             </div>
             <div>
                <h1 className="text-xl font-bold text-[#003375] tracking-tight uppercase group-hover:text-[#002855] transition-colors">HUB Planner</h1>
                <p className="text-[10px] text-gray-500 hidden md:block uppercase tracking-wider font-semibold text-[#990000]">Hỗ trợ sinh viên (Không chính thức từ nhà Trường)</p>
             </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4 w-full sm:w-auto">
             {/* Navigation Tabs */}
             <div className="flex bg-gray-100 rounded-lg p-2 gap-2 overflow-x-auto w-full sm:w-auto max-w-full no-scrollbar shadow-inner sm:justify-start justify-between px-6 sm:px-2">
                <button 
                    onClick={() => { playClick(); setActiveView('dashboard'); }}
                    className={`px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap active:scale-95 ${activeView === 'dashboard' ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                    <LayoutDashboard size={20} className="sm:hidden" />
                    <LayoutDashboard size={16} className="hidden sm:inline" />
                    <span className="hidden sm:inline">Bảng điểm</span>
                </button>
                <button 
                    onClick={() => { playClick(); setActiveView('events'); }}
                    className={`px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap active:scale-95 ${activeView === 'events' ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                    <Zap size={20} className="sm:hidden" />
                    <Zap size={16} className="hidden sm:inline" />
                    <span className="hidden sm:inline">Sự kiện ĐRL</span>
                </button>
                <button 
                    onClick={() => { playClick(); setActiveView('lost-found'); }}
                    className={`px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap active:scale-95 ${activeView === 'lost-found' ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                    <Search size={20} className="sm:hidden" />
                    <Search size={16} className="hidden sm:inline" />
                    <span className="hidden sm:inline">Tìm đồ</span>
                </button>
                <button 
                    onClick={() => { playClick(); setActiveView('handbook'); }}
                    className={`px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap active:scale-95 ${activeView === 'handbook' ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                    <Book size={20} className="sm:hidden" />
                    <Book size={16} className="hidden sm:inline" />
                    <span className="hidden sm:inline">Cẩm nang</span>
                </button>
             </div>

             {/* User Info / Controls */}
             <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start sm:border-l sm:border-gray-300 sm:pl-4 sm:ml-2">
                <div className="text-right hidden sm:block">
                    {canManage ? (
                        <>
                            <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">
                                {isAdmin ? 'Admin' : 'CTV'}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[120px]">
                                {session?.user.email}
                            </p>
                        </>
                    ) : (
                        <>
                            {userRolePref === 'school' && session?.user?.email ? (
                                <>
                                    <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[140px]">
                                        {displayName}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        {studentId}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">
                                        {data.studentName || 'Sinh viên'}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        {data.cohort}
                                    </p>
                                </>
                            )}
                        </>
                    )}
                </div>
                
                <button 
                    onClick={() => { playClick(); setShowGuide(true); }}
                    className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90"
                    title="Hướng dẫn sử dụng"
                >
                    <HelpCircle size={20} />
                </button>
                
                {(userRolePref === 'student' || userRolePref === 'school') ? (
                    <button 
                        onClick={resetData} 
                        className="p-2 text-gray-400 hover:text-[#990000] hover:bg-red-50 rounded-full transition-all duration-300 transform hover:rotate-180 active:scale-90" 
                        title="Reset Data"
                    >
                        <RotateCcw size={20} />
                    </button>
                ) : null}

                {/* Logout / Switch Role */}
                {userRolePref === 'admin' ? (
                    <>
                        {isAdmin && (
                            <button 
                                onClick={() => { playClick(); setShowActivityLog(true); }}
                                className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90 relative group"
                                title="Lịch sử hoạt động"
                            >
                                <Clock size={20} />
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-0 group-hover:opacity-100"></span>
                            </button>
                        )}
                        <button 
                            onClick={handleLogout}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-300 active:scale-90"
                            title="Đăng xuất"
                        >
                            <LogOut size={20} />
                        </button>
                    </>
                ) : userRolePref === 'school' ? (
                    <div className="relative">
                        <button
                            onClick={() => setIsUserMenuOpen(prev => !prev)}
                            className="flex items-center gap-2 px-2 py-1 rounded-full border border-gray-200 hover:border-[#003375] hover:shadow-sm transition-all"
                            title="Tài khoản HUB"
                        >
                            {profileAvatarUrl ? (
                                isColorAvatar ? (
                                    <span
                                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                        style={{ backgroundColor: profileAvatarUrl }}
                                    >
                                        {avatarSeed}
                                    </span>
                                ) : (
                                    <img
                                        src={profileAvatarUrl}
                                        alt="Avatar"
                                        className="h-8 w-8 rounded-full object-cover border border-gray-200"
                                    />
                                )
                            ) : (
                                <span className="h-8 w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold">
                                    {avatarSeed}
                                </span>
                            )}
                        </button>

                        {isUserMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAccountSettings(true);
                                        setIsUserMenuOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                                >
                                    Cài đặt tài khoản
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        resetData();
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                                >
                                    Xóa dữ liệu (Reset)
                                </button>
                                <button
                                    type="button"
                                    onClick={handleMenuLogout}
                                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button 
                        onClick={handleLogout}
                        className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-300 active:scale-90"
                        title="Thoát"
                    >
                        <Shield size={20} />
                    </button>
                )}
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-[calc(12rem+env(safe-area-inset-top))] sm:pt-24">
        
        {activeView === 'handbook' && <Handbook />}
        {activeView === 'events' && <EventsBoard />}
        {activeView === 'lost-found' && <LostFoundBoard />}
        {activeView === 'dashboard' && (
            <div className="animate-slideInRight">
                <Dashboard 
                data={data} 
                onTargetChange={(newTarget) => setData(prev => ({...prev, targetGPA: newTarget}))}
                showSecurityNotice={!session}
                />

                <div className="flex flex-col sm:flex-row justify-between items-end mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-[#003375] border-l-4 border-[#990000] pl-3">Chi tiết bảng điểm</h2>
                    
                    <div className="flex gap-2">
                        {/* Export PDF Button */}
                        <button 
                            onClick={handleExportPDF}
                            className="bg-white hover:bg-blue-50 text-[#003375] border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium hover:shadow-md hover:-translate-y-0.5"
                        >
                            <Download size={18} />
                            Xuất PDF
                        </button>

                        {/* Import PDF Button */}
                        <div>
                            <input 
                                type="file" 
                                accept=".pdf" 
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <button 
                                onClick={() => { playClick(); setShowImportGuide(true); }}
                                disabled={isImporting}
                                className="bg-[#990000] hover:bg-[#7a0000] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium disabled:opacity-70 hover:shadow-lg hover:-translate-y-0.5"
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={18}/> : <FileUp size={18} />}
                                Nhập PDF
                            </button>
                        </div>

                        <button 
                            onClick={addSemester}
                            className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 hover:shadow-md text-sm font-medium hover:-translate-y-0.5"
                        >
                            <Plus size={18} />
                            Thêm học kỳ
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                {data.semesters.map((sem, idx) => (
                    <SemesterTable 
                    key={sem.id} 
                    semester={sem} 
                    index={idx}
                    onUpdateSemester={(updated) => updateSemester(idx, updated)}
                    onRemoveSemester={() => removeSemester(idx)}
                    />
                ))}
                
                {data.semesters.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 hover:shadow-md transition-shadow">
                        <p className="text-gray-400 mb-4">Chưa có dữ liệu học kỳ nào.</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => { playClick(); setShowImportGuide(true); }} className="text-[#003375] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform active:scale-95">
                                <FileUp size={16}/> Nhập từ PDF
                            </button>
                            <span className="text-gray-300">|</span>
                            <button onClick={addSemester} className="text-[#990000] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform active:scale-95">
                                <Plus size={16}/> Tạo thủ công
                            </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        )}
      </main>

      {/* Footer and other Modals */}
      <footer className="text-center pb-4 pt-2">
        <p className="text-[10px] text-gray-400 font-medium tracking-wide mb-2 uppercase">Web designed by tqhoangg</p>
        <div className="text-xs text-gray-500">
            <Link to="/privacy" className="hover:underline">Chính sách bảo mật</Link>
            <span className="mx-2">|</span>
            <Link to="/terms" className="hover:underline">Điều khoản sử dụng</Link>
        </div>
      </footer>

      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3">
        <a
            href="https://www.facebook.com/hubplannerr"
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 w-11 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
            aria-label="Facebook HUB Planner"
        >
            <Facebook size={18} />
        </a>
        <a
            href="https://zalo.me/0389342812"
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 w-11 rounded-full bg-[#0a68ff] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow text-[11px] font-bold"
            aria-label="Zalo HUB Planner"
        >
            Zalo
        </a>
        <a
            href="tel:0389342812"
            className="h-11 w-11 rounded-full bg-[#003375] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
            aria-label="Gọi điện thoại"
        >
            <Phone size={18} />
        </a>
        <a
            href="mailto:contact@hotrosinhvienhub.id.vn"
            className="h-11 w-11 rounded-full bg-[#990000] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
            aria-label="Gửi email"
        >
            <Mail size={18} />
        </a>
      </div>

      <GeminiAdvisor data={data} />
      
      {showImportLoadingToast && (
            <div className="fixed bottom-4 right-4 bg-white shadow-xl p-4 rounded-xl border border-blue-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-sm">
                <Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" />
                <div className="flex-1">
                     <p className="text-sm font-medium text-[#003375]">
                        Bạn hãy kiên nhẫn chờ mình một chút nhé, điểm của bạn đang được tải lên, đừng thoát khỏi màn hình nhaaaa
                     </p>
                </div>
                <button onClick={() => setShowImportLoadingToast(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                </button>
            </div>
      )}

      {showImportGuide && <ImportGuideModal />}
      {showGuide && <UserGuideModal />}
      {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
      {showAccountSettings && <AccountSettingsModal />}
    </div>
  );
  };

  const LoginRoute: React.FC = () => {
    const [searchParams] = useSearchParams();
    const role = searchParams.get('role');

    useEffect(() => {
      if (role === 'admin') {
        setRolePreference('admin');
      }

      if (role === 'student') {
        setRolePreference('school');
      }
    }, [role, setRolePreference]);

    return <LoginScreen />;
  };

  const GuestRoute: React.FC = () => {
    useEffect(() => {
      if (userRolePref !== 'student') {
        setRolePreference('student');
      }
    }, [userRolePref, setRolePreference]);

    if (userRolePref !== 'student') {
      return (
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-[#003375]" size={40} />
        </div>
      );
    }

    return renderProtectedApp();
  };

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/guest" element={<GuestRoute />} />
      <Route path="/" element={session ? renderProtectedApp() : <RoleSelection onSelect={handleRoleSelect} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
