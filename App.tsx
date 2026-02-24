import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { UserData, Semester, STORAGE_KEY } from './types';
import { Dashboard } from './components/Dashboard';
import { SemesterTable } from './components/SemesterTable';
import { Onboarding } from './components/Onboarding';
import { Handbook } from './components/Handbook';
import { EventsBoard } from './components/EventsBoard';
import { LostFoundBoard } from './components/LostFoundBoard';
import { RoleSelection } from './components/RoleSelection';
import { LoginScreen } from './components/LoginScreen';
import { ActivityLogModal } from './components/ActivityLogModal';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfUse } from './components/TermsOfUse';
import { AIAdvisor } from './components/AIAdvisor';
// ĐÃ THÊM: Import Calendar cho icon Thời khóa biểu
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download, Search, HelpCircle, BookOpen, LogOut, Shield, Clock, Facebook, Phone, Mail, Calendar } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams, NavLink } from 'react-router-dom';
import { ImportGuideModal } from './components/ImportGuideModal';
import { UserGuideModal } from './components/UserGuideModal';
import ProfilePage from './pages/ProfilePage';
import UserSearch from './components/UserSearch';
import NotificationBell from './components/NotificationBell';
import ScheduleBoard from './components/ScheduleBoard';

// --- 1. IMPORT THƯ VIỆN HOA RƠI ---
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const LoginWrapper: React.FC<{ setRolePreference: (role: 'student' | 'admin' | 'school') => void }> = ({ setRolePreference }) => {
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

const GuestWrapper: React.FC<{
    userRolePref: string,
    setRolePreference: (role: 'student' | 'admin' | 'school') => void,
    children: React.ReactNode
}> = ({ userRolePref, setRolePreference, children }) => {
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

    return <>{children}</>;
};

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const STUDENT_PROFILE_TABLE = 'profiles';

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
    targetGPA: 3.2,
};

const App: React.FC = () => {
    const { isAdmin, isCTV, session, loading: loadingRole } = useUserRole();
    const canManage = isAdmin || isCTV;
    const navigate = useNavigate();

    const [userRolePref, setUserRolePref] = useState<'unknown' | 'student' | 'admin' | 'school'>(() => {
        const savedRole = localStorage.getItem('user_role_preference');
        return (savedRole === 'student' || savedRole === 'admin' || savedRole === 'school') ? savedRole : 'unknown';
    });

    const [data, setData] = useState<UserData>(INITIAL_DATA);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportGuide, setShowImportGuide] = useState(false);
    const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showAccountSettings, setShowAccountSettings] = useState(false);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [profileFullName, setProfileFullName] = useState('');
    const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
    const [draftFullName, setDraftFullName] = useState('');
    const [draftAvatarUrl, setDraftAvatarUrl] = useState('');
    const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
    const [draftAvatarPreview, setDraftAvatarPreview] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 2. CẤU HÌNH HIỆU ỨNG TẾT (HOA RƠI) ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: true, zIndex: 0 }, 
        fpsLimit: 60,
        particles: {
            number: { value: 30, density: { enable: true, area: 800 } },
            color: { value: ["#FFC0CB", "#FF69B4", "#FFD700", "#FFFF00"] },
            shape: { type: "circle" },
            opacity: { value: { min: 0.3, max: 0.7 }, animation: { enable: true, speed: 0.5 } },
            size: { value: { min: 3, max: 5 } },
            move: { enable: true, speed: { min: 1, max: 2 }, direction: "bottom-right", random: true, straight: false, outModes: "out" },
            wobble: { enable: true, distance: 5, speed: 5 }
        },
        detectRetina: true,
    }), []);
    // ------------------------------------------

    const storageKey = useMemo(() => {
        if (userRolePref === 'school' && session?.user?.id) {
            return `${STORAGE_KEY}:${session.user.id}`;
        }
        return STORAGE_KEY;
    }, [session?.user?.id, userRolePref]);

    const saveTimeoutRef = useRef<number | null>(null);

    // --- EFFECT: LOAD DATA ---
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

                if (profileData?.data) {
                    setData({ ...INITIAL_DATA, ...profileData.data });
                    setProfileFullName(profileData.full_name || ''); 
                    setProfileAvatarUrl(profileData.avatar_url || ''); 
                    localStorage.setItem(storageKey, JSON.stringify(profileData.data));
                    setIsLoaded(true);
                    return;
                }

                const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
                const metaAvatar = session.user.user_metadata.avatar_url || session.user.user_metadata.picture || '';
                
                setProfileFullName(metaName);
                setProfileAvatarUrl(metaAvatar);
                
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        setData({ ...INITIAL_DATA, ...parsed });
                    } catch (e) {
                        setData(INITIAL_DATA);
                    }
                } else {
                    setData(INITIAL_DATA);
                }
                setIsLoaded(true);
                return;
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

    // --- EFFECT: SYNC LOCAL STORAGE ---
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(storageKey, JSON.stringify(data));
        }
    }, [data, isLoaded, storageKey]);

    // --- EFFECT: AUTO SAVE TO DB ---
    useEffect(() => {
        if (!isLoaded) return;
        if (userRolePref !== 'school' || !session?.user?.id || !supabase) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            const userEmail = session.user.email || '';
            const studentCode = userEmail.split('@')[0];
            const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
            const nameToSave = profileFullName || metaName;

            const payload = {
                id: session.user.id,
                email: userEmail,
                student_code: studentCode,
                full_name: nameToSave,
                avatar_url: profileAvatarUrl,
                data,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .upsert(payload, { onConflict: 'id' });

            if (error) {
                console.error('Failed to save profile data:', error);
            } else {
                if (!profileFullName && nameToSave) {
                    setProfileFullName(nameToSave);
                }
            }
        }, 600);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [data, isLoaded, session?.user?.id, userRolePref, profileFullName, profileAvatarUrl]);

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

    useEffect(() => {
        const ensureSchoolDomain = async () => {
            if (userRolePref !== 'school' || !session?.user?.email) return;
            const emailDomain = session.user.email.split('@')[1];
            if (emailDomain !== SCHOOL_DOMAIN) {
                setIsAccessDenied(true);
            } else {
                setIsAccessDenied(false);
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
            navigate('/');
        }
    };

    const handleSchoolLogout = async () => {
        playClick();
        if (window.confirm("Đăng xuất khỏi tài khoản HUB?")) {
            await supabase?.auth.signOut();
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

        const userEmail = session.user.email || '';
        const studentCode = userEmail.split('@')[0];

        const { error } = await supabase
            .from(STUDENT_PROFILE_TABLE)
            .update({
                full_name: draftFullName.trim(),
                avatar_url: avatarUrlToSave,
                student_code: studentCode,
                email: userEmail,
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
        if (!window.confirm("CẢNH BÁO CỰC MẠNH: Hành động này sẽ xóa VĨNH VIỄN toàn bộ dữ liệu (điểm số, ảnh đại diện, thông tin cá nhân) trên cả máy và máy chủ. Bạn có chắc chắn không?")) {
            return;
        }

        try {
            if (userRolePref === 'school' && session?.user?.id && supabase) {
                const { data: listFiles } = await supabase.storage
                    .from('avatars')
                    .list(session.user.id);

                if (listFiles && listFiles.length > 0) {
                    const filesToRemove = listFiles.map(x => `${session.user.id}/${x.name}`);
                    await supabase.storage
                        .from('avatars')
                        .remove(filesToRemove);
                }

                const { error: dbError } = await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .delete()
                    .eq('id', session.user.id);
                
                if (dbError) {
                    console.error("Lỗi xóa DB:", dbError);
                    alert("Không thể xóa dữ liệu trên máy chủ. Vui lòng thử lại.");
                    return; 
                }
            }

            setData(INITIAL_DATA);
            localStorage.clear();

            if (supabase) {
                const { error } = await supabase.auth.signOut();
                if (error) console.log("Lỗi đăng xuất:", error);
            }

        } catch (error) {
            console.error("Lỗi khi reset:", error);
            alert("Có lỗi xảy ra. Dữ liệu có thể chưa được xóa hết.");
        } finally {
            localStorage.removeItem('user_role_preference');
            setUserRolePref('unknown');
            navigate('/');
            window.location.reload(); 
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
                    if (importedSem1) reconstructSemesters.push(importedSem1);
                    else reconstructSemesters.push({ id: `generated_${curStart}_hk1`, name: `${yearLabel} - Học kỳ 1`, subjects: [], trainingScore: null });

                    const sem2Id = `imported_${curStart}_${curEnd}_hk2`;
                    const importedSem2 = importedSemesters.find(s => s.id === sem2Id);
                    if (importedSem2) reconstructSemesters.push(importedSem2);
                    else reconstructSemesters.push({ id: `generated_${curStart}_hk2`, name: `${yearLabel} - Học kỳ 2`, subjects: [], trainingScore: null });

                    const otherSems = importedSemesters.filter(s => s.id.startsWith(`imported_${curStart}_${curEnd}`) && !s.id.endsWith('hk1') && !s.id.endsWith('hk2'));
                    if (otherSems.length > 0) reconstructSemesters.push(...otherSems);
                }

                const standardIds = reconstructSemesters.map(s => s.id);
                const leftOvers = importedSemesters.filter(s => !standardIds.includes(s.id));
                reconstructSemesters.push(...leftOvers);

                return { ...newData, semesters: reconstructSemesters, hasOnboarded: true };
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

    const renderProtectedApp = () => {
        if (!isLoaded) return null;

        if (isAccessDenied && userRolePref === 'school') {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-xl max-w-md text-center border-t-4 border-red-600">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Shield className="text-red-600" size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                        <p className="text-gray-600 mb-6">
                            Hệ thống phát hiện bạn đang sử dụng tài khoản email: <br /> <strong>{session?.user.email}</strong>
                        </p>
                        <div className="bg-red-50 text-red-800 p-4 rounded-xl text-sm mb-8 text-left border border-red-100">
                            <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} /> Yêu cầu bắt buộc:</p>
                            <p>Vui lòng đăng nhập bằng email sinh viên trường ĐH Ngân hàng TP.HCM có đuôi tên miền là <strong>@{SCHOOL_DOMAIN}</strong></p>
                        </div>
                        <button onClick={handleSchoolLogout} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-1">
                            <LogOut size={18} /> Đăng xuất & Thử lại
                        </button>
                    </div>
                </div>
            )
        }

        if (userRolePref === 'unknown' && !session) {
            return <RoleSelection onSelect={handleRoleSelect} />;
        }

        if (userRolePref === 'admin') {
            if (loadingRole) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={40} /></div>;
            if (!session) return <LoginScreen />;
        }

        if (userRolePref === 'school') {
            if (loadingRole) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={40} /></div>;
            if (!session) return <LoginScreen />;
        }

        if ((userRolePref === 'student' || userRolePref === 'school') && !data.hasOnboarded) {
            return <Onboarding onComplete={handleOnboardingComplete} />;
        }

        return (
            <div className="min-h-screen relative font-sans text-gray-800">

                <Particles
                    id="app-particles"
                    init={particlesInit}
                    options={particlesOptions}
                    className="fixed inset-0 z-0 pointer-events-none"
                />

                <div className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none md:hidden opacity-40 bg-[#FFF9F2]"
                    style={{ backgroundImage: "url('/backgroundrole-mobile.png')" }}>
                </div>

                <div className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none hidden md:block opacity-40 bg-[#FFF9F2]"
                    style={{ backgroundImage: "url('/backgroundrole.png')" }}>
                </div>

                <div className="min-h-screen flex flex-col">

                    <header className="bg-white/70 backdrop-blur-md border-b border-red-200/40 fixed top-0 left-0 w-full z-50 shadow-sm transition-all duration-300">
                        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-3 sm:py-0 min-h-[64px] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div className="flex items-center gap-3">
                                <Link to="/dashboard" className="h-10 w-10 relative flex-shrink-0 group cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95" onClick={playClick}>
                                    <img
                                        src="logo.png"
                                        alt="HUB Logo"
                                        className="h-full w-full object-contain drop-shadow-sm"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.parentElement!.innerHTML = '<div class="h-10 w-10 bg-[#003375] rounded flex items-center justify-center text-white font-bold text-xs shadow-md">HUB</div>';
                                        }}
                                    />
                                </Link>
                                <div>
                                    <h1 className="text-xl font-bold text-[#003375] tracking-tight uppercase group-hover:text-[#002855] transition-colors">HUB Planner</h1>
                                    <p className="text-[10px] text-gray-500 hidden md:block uppercase tracking-wider font-semibold text-[#990000]">Hỗ trợ sinh viên</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4 w-full sm:w-auto">

                                {/* ĐÃ SỬA: Thay đổi cấu trúc hiển thị Ẩn/Hiện Chữ và Icon trên Mobile/Laptop */}
                                <div className="flex bg-white/50 backdrop-blur-sm rounded-lg p-2 gap-2 overflow-x-auto w-full sm:w-auto max-w-full no-scrollbar shadow-inner sm:justify-start justify-between px-6 sm:px-2 border border-white/50">
                                    <NavLink
                                        to="/dashboard"
                                        onClick={playClick}
                                        className={({ isActive }) => `px-3 sm:px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${isActive ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}`}
                                    >
                                        <LayoutDashboard size={22} className="sm:hidden" />
                                        <span className="hidden sm:inline">Tổng quan</span>
                                    </NavLink>
                                    
                                    {/* ĐÃ SỬA: Đổi Icon tia sét (Zap) thành Lịch (Calendar) */}
                                    <NavLink
                                        to="/schedule"
                                        onClick={playClick}
                                        className={({ isActive }) => `px-3 sm:px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${isActive ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}`}
                                    >
                                        <Calendar size={22} className="sm:hidden" />
                                        <span className="hidden sm:inline">Thời khóa biểu</span>
                                    </NavLink>
                                    
                                    <NavLink
                                        to="/events"
                                        onClick={playClick}
                                        className={({ isActive }) => `px-3 sm:px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${isActive ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}`}
                                    >
                                        <Zap size={22} className="sm:hidden" />
                                        <span className="hidden sm:inline">Sự kiện ĐRL</span>
                                    </NavLink>
                                    
                                    <NavLink
                                        to="/lost-found"
                                        onClick={playClick}
                                        className={({ isActive }) => `px-3 sm:px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${isActive ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}`}
                                    >
                                        <Search size={22} className="sm:hidden" />
                                        <span className="hidden sm:inline">Tìm đồ</span>
                                    </NavLink>
                                    
                                    <NavLink
                                        to="/handbook"
                                        onClick={playClick}
                                        className={({ isActive }) => `px-3 sm:px-4 py-2 rounded-md text-base sm:text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${isActive ? 'bg-white text-[#003375] shadow-sm scale-100' : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}`}
                                    >
                                        <Book size={22} className="sm:hidden" />
                                        <span className="hidden sm:inline">Cẩm nang</span>
                                    </NavLink>
                                </div>

                                {/* User Info & Search */}
                                {(userRolePref === 'school' || userRolePref === 'student') && (
                                    <UserSearch />
                                )}
                                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start sm:border-l sm:border-gray-300 sm:pl-4 sm:ml-2">
                                    <div className="text-right hidden sm:block">
                                        {canManage ? (
                                            <>
                                                <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">{isAdmin ? 'Admin' : 'CTV'}</p>
                                                <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{session?.user.email}</p>
                                            </>
                                        ) : (
                                            <>
                                                {userRolePref === 'school' && session?.user?.email ? (
                                                    <>
                                                        <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[140px]">{displayName}</p>
                                                        <p className="text-[10px] text-gray-500">{studentId}</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-xs font-bold text-[#003375] uppercase line-clamp-1 max-w-[120px]">{data.studentName || 'Sinh viên'}</p>
                                                        <p className="text-[10px] text-gray-500">{data.cohort}</p>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <button onClick={() => { playClick(); setShowGuide(true); }} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50/50 rounded-full transition-all duration-300 active:scale-90" title="Hướng dẫn sử dụng">
                                        <HelpCircle size={20} />
                                    </button>
                                    {(userRolePref === 'school' && session?.user?.id) && (
                                        <div className="mr-1"><NotificationBell currentUserId={session.user.id} /></div>
                                    )}
                                    {userRolePref === 'admin' ? (
                                        <>
                                            {isAdmin && (
                                                <button onClick={() => { playClick(); setShowActivityLog(true); }} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50/50 rounded-full transition-all duration-300 active:scale-90 relative group" title="Lịch sử hoạt động">
                                                    <Clock size={20} />
                                                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-0 group-hover:opacity-100"></span>
                                                </button>
                                            )}
                                            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50/50 rounded-full transition-all duration-300 active:scale-90" title="Đăng xuất">
                                                <LogOut size={20} />
                                            </button>
                                        </>
                                    ) : userRolePref === 'school' ? (
                                        <div className="relative">
                                            <button onClick={() => setIsUserMenuOpen(prev => !prev)} className="flex items-center gap-2 px-2 py-1 rounded-full border border-gray-200 hover:border-[#003375] hover:shadow-sm transition-all bg-white/50" title="Tài khoản HUB">
                                                {profileAvatarUrl ? (
                                                    isColorAvatar ? (
                                                        <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: profileAvatarUrl }}>{avatarSeed}</span>
                                                    ) : (
                                                        <img src={profileAvatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover border border-gray-200" />
                                                    )
                                                ) : (
                                                    <span className="h-8 w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold">{avatarSeed}</span>
                                                )}
                                            </button>
                                            {isUserMenuOpen && (
                                                <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 animate-fadeIn">
                                                    <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors font-semibold text-[#003375] border-b border-gray-100">Thông tin cá nhân</button>
                                                    <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">Cài đặt tài khoản</button>
                                                    <button type="button" onClick={() => { setIsUserMenuOpen(false); resetData(); }} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">Xóa dữ liệu (Reset)</button>
                                                    <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-[#003375] hover:bg-blue-50/50 rounded-full transition-all duration-300 active:scale-90" title="Thoát">
                                            <Shield size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className={`w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-8 sm:pt-24 flex-1 ${(userRolePref === 'school' || userRolePref === 'student')
                        ? 'pt-[calc(11.5rem+env(safe-area-inset-top))]'
                        : 'pt-[calc(8rem+env(safe-area-inset-top))]'
                        }`}>
                        <Routes>
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={
                                <div className="animate-slideInRight">
                                    <Dashboard
                                        data={data}
                                        onTargetChange={(newTarget) => setData(prev => ({ ...prev, targetGPA: newTarget }))}
                                        showSecurityNotice={!session}
                                    />

                                    <div className="flex flex-col sm:flex-row justify-between items-end mb-4 gap-4 mt-8">
                                        <h2 className="text-2xl font-bold text-[#003375] border-l-4 border-[#990000] pl-3">Chi tiết bảng điểm</h2>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportPDF}
                                                className="bg-white/80 backdrop-blur-sm hover:bg-blue-50 text-[#003375] border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium hover:shadow-md hover:-translate-y-0.5"
                                            >
                                                <Download size={18} />
                                                Xuất PDF
                                            </button>

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
                                                    className="bg-[#990000]/90 backdrop-blur-sm hover:bg-[#7a0000] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium disabled:opacity-70 hover:shadow-lg hover:-translate-y-0.5"
                                                >
                                                    {isImporting ? <Loader2 className="animate-spin" size={18} /> : <FileUp size={18} />}
                                                    Nhập PDF
                                                </button>
                                            </div>

                                            <button
                                                onClick={addSemester}
                                                className="bg-[#003375]/90 backdrop-blur-sm hover:bg-[#002855] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 hover:shadow-md text-sm font-medium hover:-translate-y-0.5"
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
                                            <div className="text-center py-20 bg-white/60 backdrop-blur-md rounded-xl border border-dashed border-gray-300 hover:shadow-md transition-shadow">
                                                <p className="text-gray-500 mb-4 font-medium">Chưa có dữ liệu học kỳ nào.</p>
                                                <div className="flex justify-center gap-4">
                                                    <button onClick={() => { playClick(); setShowImportGuide(true); }} className="text-[#003375] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform active:scale-95">
                                                        <FileUp size={16} /> Nhập từ PDF
                                                    </button>
                                                    <span className="text-gray-300">|</span>
                                                    <button onClick={addSemester} className="text-[#990000] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform active:scale-95">
                                                        <Plus size={16} /> Tạo thủ công
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            } />
                            <Route path="/schedule" element={<ScheduleBoard />} />
                            <Route path="/events" element={<EventsBoard />} />
                            <Route path="/lost-found" element={<LostFoundBoard />} />
                            <Route path="/handbook" element={<Handbook />} />
                            <Route path="/profile/:id" element={<ProfilePage />} />
                            <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                    </main>

                    <footer className="text-center pb-4 pt-2 relative z-10">
                        <p className="text-[10px] text-gray-500 font-medium tracking-wide mb-2 uppercase">Web designed by tqhoangg</p>
                        <p className="text-[10px] text-gray-500/80 italic mb-3 px-4">
                            HUB Planner có thể mắc sai sót, vui lòng xác minh lại thông tin khi cần thiết.
                        </p>
                        <div className="text-xs text-gray-600">
                            <Link to="/privacy" className="hover:underline">Chính sách bảo mật</Link>
                            <span className="mx-2">|</span>
                            <Link to="/terms" className="hover:underline">Điều khoản sử dụng</Link>
                        </div>
                    </footer>
                </div>

                {/* Floating Action Buttons */}
                <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3">
                    <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noopener noreferrer" className="h-11 w-11 rounded-full bg-[#1877F2]/90 backdrop-blur-sm text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow" aria-label="Facebook">
                        <Facebook size={18} />
                    </a>
                    <a href="https://zalo.me/0389342812" target="_blank" rel="noopener noreferrer" className="h-11 w-11 rounded-full bg-[#0a68ff]/90 backdrop-blur-sm text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow text-[11px] font-bold" aria-label="Zalo">
                        Zalo
                    </a>
                    <a href="tel:0389342812" className="h-11 w-11 rounded-full bg-[#003375]/90 backdrop-blur-sm text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow" aria-label="Gọi điện">
                        <Phone size={18} />
                    </a>
                    <a href="mailto:contact@hotrosinhvienhub.id.vn" className="h-11 w-11 rounded-full bg-[#990000]/90 backdrop-blur-sm text-white flex items-center justify-center shadow-md hover:shadow-lg transition-shadow" aria-label="Gửi email">
                        <Mail size={18} />
                    </a>
                </div>
                {(userRolePref === 'student' || userRolePref === 'school') && (
                    <AIAdvisor data={data} />
                )}

                {showImportLoadingToast && (
                    <div className="fixed bottom-4 right-4 bg-white/90 backdrop-blur-md shadow-xl p-4 rounded-xl border border-blue-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-sm">
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

                {/* Các Modal giữ nguyên */}
                {showImportGuide && <ImportGuideModal onClose={() => setShowImportGuide(false)} onFileClick={() => fileInputRef.current?.click()} />}
                {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}
                {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
                {showAccountSettings && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                        {/* Nội dung modal giữ nguyên, chỉ chỉnh lại background nếu cần */}
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-scaleIn">
                            {/* ... Phần nội dung modal ... */}
                            <div className="bg-[#003375] p-4 text-white flex items-center justify-between">
                                <h3 className="font-bold text-lg">Cài đặt tài khoản</h3>
                                <button onClick={() => setShowAccountSettings(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                {/* ... Form content ... */}
                                {profileError && (
                                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                                        {profileError}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">Tên hiển thị</label>
                                    <input type="text" value={draftFullName} onChange={(e) => setDraftFullName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none transition-all" placeholder="Nhập tên hiển thị" />
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
                                            if (draftAvatarPreview) URL.revokeObjectURL(draftAvatarPreview);
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
                                        <img src={draftAvatarPreview} alt="Avatar preview" className="h-10 w-10 rounded-full object-cover border border-gray-200" />
                                    ) : draftAvatarUrl ? (
                                        draftAvatarUrl.startsWith('#') ? (
                                            <span className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: draftAvatarUrl }}>{avatarSeed}</span>
                                        ) : (
                                            <img src={draftAvatarUrl} alt="Avatar preview" className="h-10 w-10 rounded-full object-cover border border-gray-200" />
                                        )
                                    ) : (
                                        <span className="h-10 w-10 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold">{avatarSeed}</span>
                                    )}
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                                <button onClick={() => setShowAccountSettings(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">Hủy</button>
                                <button onClick={handleSaveProfile} disabled={profileSaving} className="px-4 py-2 rounded-lg bg-[#003375] text-white font-bold hover:bg-[#002855] transition flex items-center gap-2">
                                    {profileSaving ? <Loader2 className="animate-spin" size={16} /> : null} Lưu
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Routes>
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/login" element={<LoginWrapper setRolePreference={setRolePreference} />} />
            <Route path="/guest" element={<GuestWrapper userRolePref={userRolePref} setRolePreference={setRolePreference}>{renderProtectedApp()}</GuestWrapper>} />
            <Route path="/*" element={(session || userRolePref === 'student') ? renderProtectedApp() : <RoleSelection onSelect={handleRoleSelect} />} />
        </Routes>
    );
};

export default App;