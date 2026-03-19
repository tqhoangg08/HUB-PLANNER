import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { UserData, Semester, STORAGE_KEY } from './types';
import { Dashboard } from './components/Dashboard'; 
import { Onboarding } from './components/Onboarding';
import { Handbook } from './components/Handbook';
import { EventsBoard } from './components/EventsBoard';
import { LostFoundBoard } from './components/LostFoundBoard';
import { LoginScreen } from './components/LoginScreen';
import { ActivityLogModal } from './components/ActivityLogModal';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfUse } from './components/TermsOfUse';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, AlertTriangle, Zap, Download, Search, HelpCircle, LogOut, Shield, Clock, Facebook, Phone, Mail, Calendar, ChevronDown, Users, Award, MessageSquarePlus, Heart, Info, User, ShieldAlert, ChevronLeft, ArrowUp, ArrowDown, ListFilter, Trash2, Crown, BarChart2, TrendingUp, HeartCrack, ArrowLeft, RefreshCw } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { ImportGuideModal } from './components/ImportGuideModal';
import { UserGuideModal } from './components/UserGuideModal';
import ProfilePage from './pages/ProfilePage';
import NotificationBell from './components/NotificationBell';
import ScheduleBoard from './components/ScheduleBoard';
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

// Import dữ liệu Ngành/Khóa học
import { ACADEMIC_PROGRAMS, Program, Major, Specialization, getMajors } from './utils/programs';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const STUDENT_PROFILE_TABLE = 'profiles';

const COHORT_OPTIONS: Record<string, string[]> = {
    'standard': ['K38', 'K39', 'K40', 'K41'],
    'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
    'special': ['CTDBK1', 'CTDBK2']
};

const generateStandardCurriculum = (): Semester[] => {
    const semesters: Semester[] = [];
    const years = 4;

    for (let y = 1; y <= years; y++) {
        semesters.push({
            id: `y${y}_hk1`,
            name: ``, 
            subjects: [],
            trainingScore: null
        });
        semesters.push({
            id: `y${y}_hk2`,
            name: ``, 
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
    const navigate = useNavigate();
    const location = useLocation();

    const isGuest = !session;
    const [forceGuestOnboarding, setForceGuestOnboarding] = useState(false);

    const [isHandbookMenuOpen, setIsHandbookMenuOpen] = useState(false);
    const handbookMenuRef = useRef<HTMLDivElement>(null);
    const navRefs = useRef<(HTMLAnchorElement | HTMLDivElement | null)[]>([]);
    const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, opacity: 0 });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (handbookMenuRef.current && !handbookMenuRef.current.contains(event.target as Node)) {
                setIsHandbookMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const updateNavIndicator = () => {
            let activeIndex = -1;
            if (location.pathname.includes('/dashboard')) activeIndex = 0;
            else if (location.pathname.includes('/schedule')) activeIndex = 1;
            else if (location.pathname.includes('/events')) activeIndex = 2;
            else if (location.pathname.includes('/lost-found')) activeIndex = 3;
            else if (location.pathname.includes('/handbook') || isHandbookMenuOpen) activeIndex = 4;

            if (activeIndex !== -1 && navRefs.current[activeIndex]) {
                const el = navRefs.current[activeIndex];
                if (el) {
                    setNavIndicator({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
                }
            } else {
                setNavIndicator(prev => ({ ...prev, opacity: 0 }));
            }
        };

        updateNavIndicator();
        window.addEventListener('resize', updateNavIndicator);
        setTimeout(updateNavIndicator, 100); 
        
        return () => window.removeEventListener('resize', updateNavIndicator);
    }, [location.pathname, isHandbookMenuOpen]);

    const [data, setData] = useState<UserData>(INITIAL_DATA);
    const [adminSearchMssv, setAdminSearchMssv] = useState('');
    const [viewingUser, setViewingUser] = useState<{ id: string, mssv: string, name: string } | null>(null);
    const [isSearchingUser, setIsSearchingUser] = useState(false);
    const dataOwnerIdRef = useRef<string | null>(null);

    const handleAdminSearchUser = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!adminSearchMssv.trim() || !supabase) return;
        setIsSearchingUser(true);
        playClick();
        
        try {
            const { data: userProfile, error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .select('id, student_code, full_name')
                .eq('student_code', adminSearchMssv.trim())
                .single();

            if (error || !userProfile) {
                alert("Không tìm thấy sinh viên có MSSV này trong hệ thống!");
                setViewingUser(null);
                setData(INITIAL_DATA);
                dataOwnerIdRef.current = session?.user?.id || null;
            } else {
                setData(INITIAL_DATA);
                dataOwnerIdRef.current = userProfile.id; 
                
                setViewingUser({
                    id: userProfile.id,
                    mssv: userProfile.student_code,
                    name: userProfile.full_name || 'Chưa cập nhật tên'
                });
                alert(`Đã chuyển sang xem dữ liệu của sinh viên: ${userProfile.student_code}`);
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi khi tìm kiếm sinh viên!");
        } finally {
            setIsSearchingUser(false);
        }
    };

    const [isLoaded, setIsLoaded] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportGuide, setShowImportGuide] = useState(false);
    const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showAccountSettings, setShowAccountSettings] = useState(false);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [deniedEmail, setDeniedEmail] = useState<string>('');
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [profileFullName, setProfileFullName] = useState('');
    const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
    const [draftFullName, setDraftFullName] = useState('');
    const [draftAvatarUrl, setDraftAvatarUrl] = useState('');
    const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
    const [draftAvatarPreview, setDraftAvatarPreview] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [draftStudentName, setDraftStudentName] = useState('');
    const [draftProgram, setDraftProgram] = useState<Program | null>(null);
    const [draftCohort, setDraftCohort] = useState('');
    const [draftMajor, setDraftMajor] = useState<Major | null>(null);
    const [draftSpecialization, setDraftSpecialization] = useState<Specialization | null>(null);

    const [showResetModal, setShowResetModal] = useState(false);
    const [resetStep, setResetStep] = useState<1 | 2 | 3 | 4>(1); 
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);

    const userRolePref: 'guest' | 'school' | 'admin' = session ? (isAdmin ? 'admin' : 'school') : 'guest';

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (resendCountdown > 0) {
            timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const storageKey = useMemo(() => {
        if (!isGuest && session?.user?.id) {
            const targetId = (isAdmin && viewingUser) ? viewingUser.id : session.user.id;
            return `${STORAGE_KEY}:${targetId}`;
        }
        return STORAGE_KEY;
    }, [session?.user?.id, isGuest, isAdmin, viewingUser]);

    const saveTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        let isActive = true;
        setIsLoaded(false);
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);

        const loadData = async () => {
            if ((userRolePref === 'school' || userRolePref === 'admin') && session?.user?.id && supabase) {
                
                if (isAdmin && viewingUser) {
                    const { data: profileData } = await supabase
                        .from(STUDENT_PROFILE_TABLE)
                        .select('data')
                        .eq('id', viewingUser.id)
                        .maybeSingle();

                    if (!isActive) return;

                    if (profileData && profileData.data) {
                        setData({ ...INITIAL_DATA, ...profileData.data });
                    } else {
                        setData(INITIAL_DATA); 
                    }
                    
                    dataOwnerIdRef.current = viewingUser.id;
                    setIsLoaded(true);
                    return; 
                }

                const { data: profileData } = await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .select('data, full_name, avatar_url')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (!isActive) return;

                if (profileData?.data) {
                    setData({ ...INITIAL_DATA, ...profileData.data });
                    setProfileFullName(profileData.full_name || ''); 
                    setProfileAvatarUrl(profileData.avatar_url || ''); 
                    localStorage.setItem(storageKey, JSON.stringify(profileData.data));
                    dataOwnerIdRef.current = session.user.id;
                    setIsLoaded(true);
                    return;
                }

                const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
                const metaAvatar = session.user.user_metadata.avatar_url || session.user.user_metadata.picture || '';
                setProfileFullName(metaName);
                setProfileAvatarUrl(metaAvatar);
                
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    try { setData({ ...INITIAL_DATA, ...JSON.parse(saved) }); } 
                    catch (e) { setData(INITIAL_DATA); }
                } else {
                    setData(INITIAL_DATA);
                }
                dataOwnerIdRef.current = session.user.id;
                setIsLoaded(true);
                return;
            }

            if (userRolePref !== 'school' && userRolePref !== 'admin') { 
                setProfileFullName(''); 
                setProfileAvatarUrl(''); 
            }
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try { setData({ ...INITIAL_DATA, ...JSON.parse(saved) }); } 
                catch (e) { setData(INITIAL_DATA); }
            } else { setData(INITIAL_DATA); }
            dataOwnerIdRef.current = 'guest';
            setIsLoaded(true);
        };

        loadData();
        return () => { isActive = false; };
    }, [storageKey, session?.user?.id, userRolePref, isAdmin, viewingUser, isGuest]);

    useEffect(() => {
        if (isLoaded && !viewingUser) {
            localStorage.setItem(storageKey, JSON.stringify(data));
        }
    }, [data, isLoaded, storageKey, viewingUser]);

    useEffect(() => {
        if (!isLoaded) return;
        if ((userRolePref !== 'school' && userRolePref !== 'admin') || !session?.user?.id || !supabase) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            if (isAdmin && viewingUser) return; 

            const targetUserId = session.user.id;
            if (dataOwnerIdRef.current !== targetUserId) return;

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

            if (!error && !profileFullName && nameToSave) {
                setProfileFullName(nameToSave);
            }
        }, 600);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [data, isLoaded, session?.user?.id, userRolePref, profileFullName, profileAvatarUrl, isAdmin, viewingUser]);

    useEffect(() => {
        if (showAccountSettings) {
            setDraftFullName(profileFullName);
            setDraftAvatarUrl(profileAvatarUrl);
            setDraftAvatarFile(null);
            setDraftAvatarPreview('');
            setProfileError(null);
            
            setDraftStudentName(data.studentName || '');
            
            const prog = ACADEMIC_PROGRAMS.find(p => p.name === data.programName) || null;
            setDraftProgram(prog);
            setDraftCohort(data.cohort || '');
            
            if (prog && data.cohort) {
                const majors = getMajors(prog.id, data.cohort);
                const maj = majors.find(m => m.name === data.majorName) || null;
                setDraftMajor(maj);
                
                if (maj) {
                    const spec = maj.specializations.find(s => s.name === data.specializationName) || null;
                    setDraftSpecialization(spec);
                } else {
                    setDraftSpecialization(null);
                }
            } else {
                setDraftMajor(null);
                setDraftSpecialization(null);
            }
        }
    }, [showAccountSettings, profileFullName, profileAvatarUrl, data]);

    useEffect(() => {
        return () => {
            if (draftAvatarPreview) {
                URL.revokeObjectURL(draftAvatarPreview);
            }
        };
    }, [draftAvatarPreview]);

    useEffect(() => {
        const ensureSchoolDomain = async () => {
            const searchParams = new URLSearchParams(window.location.search);
            const authError = searchParams.get('error');
            
            if (authError) {
                setIsAccessDenied(true);
                setDeniedEmail('Ngoài hệ thống HUB (VD: @gmail.com)');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }

            if (isGuest || isAdmin || isCTV || !session?.user?.email) return;
            
            const emailDomain = session.user.email.split('@')[1];
            if (emailDomain !== SCHOOL_DOMAIN) {
                setIsAccessDenied(true);
                setDeniedEmail(session.user.email);
            } else {
                setIsAccessDenied(false);
            }
        };

        ensureSchoolDomain();
    }, [session, isGuest, isAdmin, isCTV]);

    const handleLogout = async () => {
        playClick();
        if (window.confirm("Đăng xuất khỏi hệ thống?")) {
            try {
                if (supabase) await supabase.auth.signOut();
            } catch (e) {
                console.error("Lỗi khi đăng xuất Supabase:", e);
            }
            
            localStorage.clear();
            sessionStorage.clear();
            
            window.location.href = '/login';
        }
    };

    const handleMenuLogout = async () => {
        setIsUserMenuOpen(false);
        await handleLogout();
    };

    const handleRequestReset = () => {
        playClick();
        if (isGuest) {
            if (window.confirm("Xóa toàn bộ dữ liệu dùng thử?")) {
                executeResetData();
            }
        } else {
            setShowResetModal(true);
            setResetStep(1); 
            setOtpInput('');
            setOtpError('');
            setIsUserMenuOpen(false);
        }
    };

    const sendOtpEmail = async () => {
        setIsSendingOtp(true);
        setOtpError('');
        try {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedOtp(otp);

            const expireTime = new Date();
            expireTime.setMinutes(expireTime.getMinutes() + 15);
            const timeString = expireTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            const { data, error } = await supabase.functions.invoke('send-otp-email', {
                body: { 
                    email: session?.user?.email, 
                    passcode: otp, 
                    time: timeString 
                }
            });

            if (error || !data || data.error) {
                console.error("Chi tiết lỗi từ Edge Function:", error || data?.error);
                throw new Error("Lỗi từ máy chủ Backend");
            }

            setResetStep(3); 
            setOtpInput(''); 
            setResendCountdown(300); 

        } catch (error) {
            console.error('Lỗi gửi mail:', error);
            setOtpError('Hệ thống mail đang bận. Vui lòng thử lại sau.');
        } finally {
            setIsSendingOtp(false);
        }
    };

    const verifyOtpAndReset = () => {
        playClick();
        if (otpInput === generatedOtp) {
            setOtpError('');
            setResetStep(4); 
            executeResetData(); 
        } else {
            setOtpError('Mã xác nhận không chính xác!');
        }
    };

    const executeResetData = async () => {
        try {
            if (!isGuest && session?.user?.id && supabase) {
                try {
                    const { data: listFiles } = await supabase.storage.from('avatars').list(session.user.id);
                    if (listFiles && listFiles.length > 0) {
                        const filesToRemove = listFiles.map(x => `${session.user.id}/${x.name}`);
                        await supabase.storage.from('avatars').remove(filesToRemove);
                    }
                } catch (e) { console.error("Lỗi xóa Avatar:", e); }

                const tables = ['user_schedules', 'user_participations', 'notifications', 'profiles'];
                for (const table of tables) {
                    try {
                        const col = table === 'profiles' ? 'id' : 'user_id';
                        await supabase.from(table).delete().eq(col, session.user.id);
                    } catch (e) {
                        console.error(`Bỏ qua lỗi dọn dẹp bảng ${table}:`, e);
                    }
                }

                try {
                    await supabase.rpc('delete_my_account');
                } catch (e) {
                    console.error("Lỗi xóa tài khoản Auth:", e);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
            console.error("Lỗi khi reset:", error);
        } finally {
            try {
                if (supabase) await supabase.auth.signOut();
            } catch(e) {}

            localStorage.clear();
            sessionStorage.clear();
            
            window.location.href = '/login';
        }
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

        setData(prev => ({
            ...prev,
            studentName: draftStudentName.trim(),
            programName: draftProgram?.name || prev.programName,
            cohort: draftCohort || prev.cohort,
            majorName: draftMajor?.name || prev.majorName,
            specializationName: draftSpecialization?.name || prev.specializationName,
            totalCreditsRequired: draftSpecialization?.credits || prev.totalCreditsRequired
        }));

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
            name: ``, 
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
                    else reconstructSemesters.push({ id: `generated_${curStart}_hk1`, name: `Học kỳ 1 ${yearLabel}`, subjects: [], trainingScore: null });

                    const sem2Id = `imported_${curStart}_${curEnd}_hk2`;
                    const importedSem2 = importedSemesters.find(s => s.id === sem2Id);
                    if (importedSem2) reconstructSemesters.push(importedSem2);
                    else reconstructSemesters.push({ id: `generated_${curStart}_hk2`, name: `Học kỳ 2 ${yearLabel}`, subjects: [], trainingScore: null });

                    const otherSems = importedSemesters.filter(s => s.id.startsWith(`imported_${curStart}_${curEnd}`) && !s.id.endsWith('hk1') && !s.id.endsWith('hk2'));
                    if (otherSems.length > 0) reconstructSemesters.push(...otherSems);
                }

                const standardIds = reconstructSemesters.map(s => s.id);
                const leftOvers = importedSemesters.filter(s => !standardIds.includes(s.id));
                reconstructSemesters.push(...leftOvers);

                return { ...newData, semesters: reconstructSemesters };
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

        if (isAccessDenied && !isAdmin && !isCTV) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F8FAFC] animate-fadeIn">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-md text-center">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Shield className="text-red-500" size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                        <p className="text-gray-500 mb-6 text-sm">
                            Hệ thống phát hiện bạn đang sử dụng tài khoản email: <br /> 
                            <strong className="text-gray-800">{deniedEmail}</strong>
                        </p>
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-8 text-left border border-red-100">
                            <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} /> Yêu cầu bắt buộc:</p>
                            <p>Vui lòng đăng nhập bằng email sinh viên trường ĐH Ngân hàng TP.HCM có đuôi tên miền là <strong>@{SCHOOL_DOMAIN}</strong></p>
                        </div>
                        <button 
                            onClick={async () => { 
                                playClick(); 
                                await supabase?.auth.signOut(); 
                                setIsAccessDenied(false); 
                                window.location.href = '/login'; 
                            }} 
                            className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                            <LogOut size={18} /> Đăng xuất & Thử lại
                        </button>
                    </div>
                </div>
            )
        }

        if ((session && !data.hasOnboarded) || forceGuestOnboarding) {
            return <Onboarding onComplete={(onboardingData) => {
                handleOnboardingComplete(onboardingData);
                setForceGuestOnboarding(false);
            }} />;
        }

        return (
            <div className="h-[100dvh] bg-[#F8FAFC] font-sans text-gray-800 flex flex-col relative overflow-hidden">
                <Particles
                    id="app-particles"
                    init={particlesInit}
                    options={particlesOptions}
                    className="absolute inset-0 z-0 pointer-events-none"
                />

                <header className="bg-white border-b border-gray-200 w-full z-50 shrink-0 h-auto sm:h-14 shadow-sm p-3 sm:p-0 relative">
                    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-8">
                        <div className="w-full flex flex-row items-center justify-between sm:w-auto sm:gap-3 shrink-0">
                            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                                <Link to="/dashboard" className="h-7 w-7 relative flex-shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95" onClick={playClick}>
                                    <img src="logo.png" alt="HUB Logo" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-7 w-7 bg-[#003375] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                                </Link>
                                <div className="leading-tight">
                                    <h1 className="text-[15px] font-extrabold text-[#003375] tracking-tight">HUB PLANNER</h1>
                                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 sm:hidden shrink-0">
                                {(!isGuest) && (
                                    <NotificationBell currentUserId={session.user.id} />
                                )}
                                
                                {isGuest && (
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={handleRequestReset} className="p-1.5 bg-red-50 text-red-600 rounded-md border border-red-100" title="Reset dữ liệu"><RotateCcw size={16}/></button>
                                        <Link to="/login" onClick={playClick} className="px-2 py-1.5 bg-[#003375] text-white rounded-md text-xs font-bold shadow-sm">Đăng nhập</Link>
                                    </div>
                                )}

                                {isAdmin && (
                                     <button onClick={handleLogout} className="p-1.5 bg-red-50 text-red-600 rounded-md border border-red-100" title="Đăng xuất"><LogOut size={16}/></button>
                                )}

                                {!isGuest && !isAdmin && (
                                    <div className="relative">
                                        <button onClick={() => setIsUserMenuOpen(prev => !prev)} className="flex items-center focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                                            {profileAvatarUrl ? (
                                                isColorAvatar ? (
                                                    <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{ backgroundColor: profileAvatarUrl }}>{avatarSeed}</span>
                                                ) : (
                                                    <img src={profileAvatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                                )
                                            ) : (
                                                <span className="h-8 w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold shadow-sm">{avatarSeed}</span>
                                            )}
                                        </button>

                                        {isUserMenuOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                                                <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                                <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Cài đặt thông tin</button>
                                                <button type="button" onClick={handleRequestReset} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                                <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Đã xóa UserSearch ở đây theo yêu cầu */}

                        <nav className="flex items-center justify-between sm:justify-start lg:justify-end flex-1 gap-1 sm:gap-2 lg:gap-6 sm:h-full p-1.5 sm:p-0 sm:px-2 bg-gray-50 sm:bg-transparent rounded-full sm:rounded-none border border-gray-100 sm:border-none w-full sm:w-auto overflow-x-auto sm:overflow-visible no-scrollbar sm:mask-edges relative">
                            
                            <NavLink 
                                to="/dashboard" 
                                ref={el => navRefs.current[0] = el}
                                onClick={playClick} 
                                className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}
                            >
                                <LayoutDashboard size={20} className="sm:hidden" />
                                <span className="hidden sm:block">Tổng quan</span>
                            </NavLink>
                            <NavLink 
                                to="/schedule" 
                                ref={el => navRefs.current[1] = el}
                                onClick={playClick} 
                                className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}
                            >
                                <Calendar size={20} className="sm:hidden" />
                                <span className="hidden sm:block">Thời khóa biểu</span>
                            </NavLink>
                            <NavLink 
                                to="/events" 
                                ref={el => navRefs.current[2] = el}
                                onClick={playClick} 
                                className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}
                            >
                                <Zap size={20} className="sm:hidden" />
                                <span className="hidden sm:block">Sự kiện ĐRL</span>
                            </NavLink>
                            <NavLink 
                                to="/lost-found" 
                                ref={el => navRefs.current[3] = el}
                                onClick={playClick} 
                                className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}
                            >
                                <Search size={20} className="sm:hidden" />
                                <span className="hidden sm:block">Tìm đồ thất lạc</span>
                            </NavLink>

                            <div 
                                className="relative flex items-center justify-center sm:h-full shrink-0 z-10" 
                                ref={el => {
                                    handbookMenuRef.current = el; 
                                    navRefs.current[4] = el; 
                                }}
                                onMouseEnter={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(true)}
                                onMouseLeave={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(false)}
                            >
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        playClick();
                                        setIsHandbookMenuOpen(!isHandbookMenuOpen);
                                    }}
                                    className={`flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none ${
                                        location.pathname.includes('/handbook') || isHandbookMenuOpen
                                            ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' 
                                            : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    <Book size={20} className="sm:hidden" />
                                    <span className="hidden sm:flex items-center gap-1">
                                        Cẩm nang <ChevronDown size={14} className={`transition-transform duration-200 ${isHandbookMenuOpen ? 'rotate-180' : ''}`}/>
                                    </span>
                                </button>

                                {isHandbookMenuOpen && (
                                    <div className="fixed sm:absolute top-[105px] sm:top-full right-4 sm:right-0 sm:pt-2 w-64 z-[999] animate-fadeIn">
                                        <div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
                                            <div className="p-2 flex flex-col gap-0.5">
                                                <Link to="/handbook/contacts" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#003375] rounded-lg transition-colors group">
                                                    <div className="bg-[#003375]/10 p-1.5 rounded-lg text-[#003375] group-hover:bg-[#003375] group-hover:text-white transition-colors"><Phone size={16} /></div> Danh bạ & Khoa
                                                </Link>
                                                <Link to="/handbook/clubs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#990000] rounded-lg transition-colors group">
                                                    <div className="bg-[#990000]/10 p-1.5 rounded-lg text-[#990000] group-hover:bg-[#990000] group-hover:text-white transition-colors"><Users size={16} /></div> CLB - Đội - Nhóm
                                                </Link>
                                                <Link to="/handbook/scholarships" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-lg transition-colors group">
                                                    <div className="bg-green-100 p-1.5 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Award size={16} /></div> Học bổng & Quy chế
                                                </Link>
                                                <div className="h-px bg-gray-100 my-1 mx-2"></div>
                                                <Link to="/handbook/faqs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-colors group">
                                                    <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><HelpCircle size={16} /></div> FAQs
                                                </Link>
                                                <Link to="/handbook/feedback" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 rounded-lg transition-colors group">
                                                    <div className="bg-teal-100 p-1.5 rounded-lg text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors"><MessageSquarePlus size={16} /></div> Góp ý
                                                </Link>
                                                <Link to="/handbook/donate" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-pink-600 rounded-lg transition-colors group">
                                                    <div className="bg-pink-100 p-1.5 rounded-lg text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors"><Heart size={16} /></div> Ủng hộ & Tri ân
                                                </Link>
                                                <Link to="/handbook/about" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors group">
                                                    <div className="bg-gray-200 p-1.5 rounded-lg text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors"><Info size={16} /></div> Về chúng mình
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div 
                                className="hidden sm:block absolute bottom-0 h-[2px] bg-[#003375] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] z-20 rounded-t-full"
                                style={{ 
                                    left: `${navIndicator.left}px`, 
                                    width: `${navIndicator.width}px`,
                                    opacity: navIndicator.opacity 
                                }}
                            />
                        </nav>

                        <div className="hidden sm:flex items-center gap-1.5 lg:gap-3 shrink-0 pl-2 lg:pl-4 border-l border-gray-200">
                            {isAdmin && (
                            <form onSubmit={handleAdminSearchUser} className="flex items-center gap-1 lg:gap-2 mr-1 lg:mr-2 bg-purple-50 p-1 rounded-lg border border-purple-200 shadow-inner">
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        placeholder="Admin: Tìm..." 
                                        value={adminSearchMssv}
                                        onChange={(e) => setAdminSearchMssv(e.target.value)}
                                        className="pl-7 pr-2 py-1.5 text-[11px] lg:text-xs w-20 lg:w-28 rounded-md border border-purple-200 outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                                    />
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-400" />
                                </div>
                                {viewingUser ? (
                                    <button type="button" onClick={() => { 
                                        setViewingUser(null); 
                                        setAdminSearchMssv(''); 
                                        setData(INITIAL_DATA); 
                                        playClick(); 
                                    }} className="px-2 py-1 lg:px-3 lg:py-1.5 bg-red-500 text-white text-[11px] lg:text-xs font-bold rounded-md hover:bg-red-600 transition-colors whitespace-nowrap">
                                        Thoát
                                    </button>
                                ) : (
                                    <button type="submit" disabled={isSearchingUser} className="px-2 py-1 lg:px-3 lg:py-1.5 bg-purple-600 text-white text-[11px] lg:text-xs font-bold rounded-md hover:bg-purple-700 transition-colors whitespace-nowrap">
                                        {isSearchingUser ? '...' : 'Xem'}
                                    </button>
                                )}
                            </form>
                            )}

                            <button onClick={() => { playClick(); setShowGuide(true); }} className="text-gray-400 hover:text-gray-900 transition-colors hidden sm:block" title="Hướng dẫn">
                                <HelpCircle size={18} />
                            </button>
                            
                            {!isGuest && (
                                <NotificationBell currentUserId={session.user.id} />
                            )}
                            
                            {isAdmin ? (
                                <div className="flex items-center gap-1.5 lg:gap-3 border-l border-gray-200 pl-1.5 lg:pl-3">
                                    
                                    {/* NÚT ĐỒNG BỘ DB MỚI BẰNG ICON */}
                                    <button 
                                        onClick={async (e) => {
                                            if (!window.confirm("Bắt đầu đồng bộ? Đảm bảo bạn đã chạy lệnh DISABLE ROW LEVEL SECURITY trên Supabase nhé!")) return;
                                            playClick();
                                            
                                            const btn = e.currentTarget;
                                            const originalHTML = btn.innerHTML; // Lưu icon gốc lại
                                            btn.innerHTML = "⏳";
                                            btn.disabled = true;

                                            try {
                                                let hasMore = true;
                                                let page = 0;
                                                const pageSize = 100;
                                                let updatedCount = 0;
                                                
                                                console.warn("🚀 [BƯỚC 1] BẮT ĐẦU TIẾN TRÌNH ĐỒNG BỘ DATA...");

                                                while (hasMore) {
                                                    console.warn(`⏳ [BƯỚC 2] Đang tải nhóm ${pageSize} tài khoản ở trang ${page + 1}...`);
                                                    const { data: profiles, error } = await supabase
                                                        .from('profiles')
                                                        .select('id, data')
                                                        .range(page * pageSize, (page + 1) * pageSize - 1);

                                                    if (error) {
                                                        console.error("❌ Lỗi lấy data từ Supabase:", error);
                                                        throw error;
                                                    }
                                                    
                                                    if (!profiles || profiles.length === 0) {
                                                        console.warn("✅ Đã quét đến cuối Database.");
                                                        hasMore = false;
                                                        break;
                                                    }

                                                    console.warn(`🔍 Đang quét ${profiles.length} tài khoản (Trang ${page + 1})...`);

                                                    for (const profile of profiles) {
                                                        let pData = profile.data;
                                                        if (!pData || !pData.semesters || !Array.isArray(pData.semesters)) continue;

                                                        let needsUpdate = false;
                                                        let baseYear = 2024; 
                                                        const cohortStr = String(pData.cohort || "").toUpperCase();

                                                        if (cohortStr.includes("K38") || cohortStr.includes("CLCK10")) baseYear = 2022;
                                                        else if (cohortStr.includes("K39") || cohortStr.includes("CLCK11")) baseYear = 2023;
                                                        else if (cohortStr.includes("K40") || cohortStr.includes("CLCK12") || cohortStr.includes("CTDBK1")) baseYear = 2024;
                                                        else if (cohortStr.includes("K41") || cohortStr.includes("CLCK13") || cohortStr.includes("CTDBK2")) baseYear = 2025;

                                                        const newSemesters = pData.semesters.map((sem: any) => {
                                                            const match = sem.name ? sem.name.match(/Năm (\d+) - Học kỳ (1|2|3|Hè)/) : null;
                                                            if (match) {
                                                                needsUpdate = true;
                                                                const namHoc = parseInt(match[1]);
                                                                const kyHoc = match[2];
                                                                const targetYear = baseYear + (namHoc - 1);
                                                                return { ...sem, name: `Học kỳ ${kyHoc} Năm học ${targetYear}-${targetYear + 1}` };
                                                            }
                                                            return sem;
                                                        });

                                                        if (needsUpdate) {
                                                            pData.semesters = newSemesters;
                                                            await supabase.from('profiles').update({ data: pData }).eq('id', profile.id);
                                                            updatedCount++;
                                                            console.warn(`👉 Đã sửa thành công bảng điểm ID: ${profile.id}`);
                                                        }
                                                    }
                                                    
                                                    console.warn(`✅ Xong trang ${page + 1}. Tổng đã sửa: ${updatedCount}`);
                                                    page++;
                                                }
                                                
                                                alert(`🎉 ĐÃ ĐỒNG BỘ HOÀN TẤT! Cập nhật thành công ${updatedCount} tài khoản.`);
                                                window.location.reload(); 
                                            } catch (err) {
                                                console.error(err);
                                                alert("❌ Có lỗi xảy ra trong quá trình đồng bộ! (Xem Console)");
                                            } finally {
                                                btn.innerHTML = originalHTML; // Trả lại icon ban đầu
                                                btn.disabled = false;
                                            }
                                        }} 
                                        className="p-1.5 lg:p-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center" 
                                        title="Đồng bộ DB Cũ -> Mới"
                                    >
                                        <RefreshCw size={16} />
                                    </button>

                                    <button onClick={() => { playClick(); setShowActivityLog(true); }} className="text-gray-400 hover:text-[#003375] transition-colors p-1" title="Lịch sử hoạt động">
                                        <Clock size={16} className="lg:w-[18px] lg:h-[18px]" />
                                    </button>
                                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Đăng xuất">
                                        <LogOut size={16} className="lg:w-[18px] lg:h-[18px]" />
                                    </button>
                                </div>
                            ) : session ? (
                                <div className="relative flex items-center gap-2 lg:gap-3 border-l border-gray-200 pl-2 lg:pl-3">
                                    <div className="hidden md:flex flex-col items-end justify-center">
                                        <span className="text-[11px] lg:text-xs font-bold text-gray-700 uppercase tracking-wide leading-none truncate max-w-[100px] lg:max-w-[150px]">{displayName}</span>
                                        <span className="text-[10px] text-gray-400 font-medium leading-none mt-1">{studentId}</span>
                                    </div>
                                    <button onClick={() => setIsUserMenuOpen(prev => !prev)} className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                                        {profileAvatarUrl ? (
                                            isColorAvatar ? (
                                                <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shadow-sm" style={{ backgroundColor: profileAvatarUrl }}>{avatarSeed}</span>
                                            ) : (
                                                <img src={profileAvatarUrl} alt="Avatar" className="h-7 w-7 lg:h-8 lg:w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                            )
                                        ) : (
                                            <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                                        )}
                                    </button>
                                    {isUserMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                                            <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                            <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Cài đặt thông tin</button>
                                            <button type="button" onClick={handleRequestReset} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                            <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 lg:gap-2 border-l border-gray-200 pl-1.5 lg:pl-3">
                                    <button onClick={handleRequestReset} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa dữ liệu dùng thử">
                                        <RotateCcw size={14} className="lg:w-4 lg:h-4" />
                                        <span className="text-[10px] lg:text-xs font-bold hidden md:block">Reset</span>
                                    </button>
                                    <Link to="/login" onClick={playClick} className="flex items-center gap-1 px-2 lg:px-4 py-1.5 bg-[#003375] text-white text-[10px] lg:text-sm font-bold rounded-lg hover:bg-[#002855] transition-colors shadow-sm whitespace-nowrap">
                                        <User size={14} className="lg:w-4 lg:h-4" /> <span className="hidden md:block">Đăng nhập</span>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10">
                    <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 sm:pt-3 min-h-full flex flex-col">
                        <div className="flex-1">
                            <Routes>
                                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                
                                <Route path="/dashboard" element={
                                    <div className="animate-fadeIn">
                                        <Dashboard
                                            data={data}
                                            onSetSemesters={(sems) => setData(prev => ({ ...prev, semesters: sems }))}
                                            isGuest={isGuest}
                                            onRequireOnboarding={() => setForceGuestOnboarding(true)}
                                            onTargetChange={(newTarget) => setData(prev => ({ ...prev, targetGPA: newTarget }))}
                                            showSecurityNotice={!session}
                                            onUpdateSemester={updateSemester} 
                                            onRemoveSemester={removeSemester} 
                                            onAddSemester={addSemester}       
                                            onExportPDF={handleExportPDF}     
                                            onImportPDF={() => { playClick(); setShowImportGuide(true); }} 
                                            isImporting={isImporting}
                                            fileInputRef={fileInputRef}
                                            onFileUpload={handleFileUpload}
                                        />
                                    </div>
                                } />

                                <Route path="/schedule" element={<ScheduleBoard viewUserId={viewingUser?.id} />} />
                                <Route path="/events" element={<EventsBoard viewUserId={viewingUser?.id} />} />
                                <Route path="/lost-found" element={<LostFoundBoard />} />
                                <Route path="/handbook/:tab?" element={<Handbook />} />
                                <Route path="/profile/:id" element={<ProfilePage />} />
                                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                            </Routes>
                        </div>

                        <footer className="text-center py-6 mt-10 border-t border-gray-200 text-gray-500 bg-[#F8FAFC]">
                            <p className="text-xs font-medium tracking-wide mb-1 uppercase">Web designed by tqhoangg</p>
                            <p className="text-[10px] opacity-80 px-4 mb-3">
                                HUB Planner có thể mắc sai sót, vui lòng xác minh lại thông tin khi cần thiết.
                            </p>
                            <div className="text-xs">
                                <Link to="/privacy" className="hover:text-gray-900 transition-colors">Chính sách bảo mật</Link>
                                <span className="mx-3 opacity-50">•</span>
                                <Link to="/terms" className="hover:text-gray-900 transition-colors">Điều khoản sử dụng</Link>
                            </div>
                        </footer>
                    </main>
                </div>

                <div className="fixed bottom-6 left-6 z-40 flex flex-col gap-3">
                    <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-white text-[#1877F2] flex items-center justify-center shadow-md border border-gray-200 hover:scale-110 transition-transform" aria-label="Facebook">
                        <Facebook size={20} />
                    </a>
                    <a href="https://zalo.me/0389342812" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-white text-[#0a68ff] flex items-center justify-center shadow-md border border-gray-200 hover:scale-110 transition-transform text-[10px] font-bold" aria-label="Zalo">
                        Zalo
                    </a>
                </div>

                {showImportLoadingToast && (
                    <div className="fixed bottom-6 right-6 bg-white shadow-xl p-4 rounded-xl border border-gray-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-xs">
                        <Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" />
                        <p className="text-sm font-medium text-gray-700 leading-snug">
                            Đang xử lý PDF của bạn, vui lòng đợi giây lát...
                        </p>
                    </div>
                )}

                {showImportGuide && (
                    <ImportGuideModal 
                        onClose={() => setShowImportGuide(false)} 
                        onFileClick={() => fileInputRef.current?.click()} 
                        onFileDrop={(file) => {
                            setShowImportGuide(false); 
                            if (fileInputRef.current) {
                                const dataTransfer = new DataTransfer();
                                dataTransfer.items.add(file);
                                fileInputRef.current.files = dataTransfer.files;
                                
                                const event = new Event('change', { bubbles: true });
                                fileInputRef.current.dispatchEvent(event);
                            }
                        }}
                    />
                )}
                
                {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}
                {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
                
                {/* MODAL XÁC NHẬN OTP ĐỂ RESET DATA */}
                {showResetModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn border border-gray-200">
                            
                            {resetStep === 1 ? (
                                <div className="p-8 sm:p-10 animate-fadeIn text-center relative">
                                    <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1.5 transition-colors"><X size={18} /></button>
                                    <div className="w-20 h-20 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-6">
                                        <HeartCrack size={40} />
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-900 mb-3">Khoan đã... 🥺</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed mb-8 px-2">
                                        Bạn đã dành rất nhiều thời gian để xây dựng lộ trình học tập trên HUB Planner. Nếu xóa tài khoản, <strong className="text-red-600">toàn bộ dữ liệu, bảng điểm và sự kiện</strong> sẽ biến mất vĩnh viễn.
                                        <br/><br/>
                                        Thay vì xóa, bạn có muốn tạm thời <strong>Đăng xuất</strong> để nghỉ ngơi không?
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        <button onClick={() => setShowResetModal(false)} className="w-full py-3.5 bg-[#003375] text-white font-bold rounded-xl hover:bg-[#002855] transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                                            Thôi, mình ở lại! 💙
                                        </button>
                                        <button onClick={() => setResetStep(2)} className="w-full py-3 bg-transparent text-gray-500 font-bold rounded-xl hover:bg-gray-50 hover:text-red-600 transition-all text-sm">
                                            Mình đã quyết định, tiếp tục xóa
                                        </button>
                                    </div>
                                </div>
                            ) : resetStep === 2 ? (
                                <div className="animate-slideInRight">
                                    <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100 relative">
                                        <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 bg-white rounded-full p-1 transition-colors"><X size={18} /></button>
                                        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-red-600 border border-red-100">
                                            <ShieldAlert size={28} />
                                        </div>
                                        <h3 className="text-xl font-bold text-red-700">Cảnh báo xóa dữ liệu</h3>
                                        <p className="text-sm text-red-600/80 font-medium mt-1">Hành động này không thể hoàn tác.</p>
                                    </div>
                                    
                                    <div className="p-6">
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-600 text-center leading-relaxed">
                                                Để đảm bảo an toàn, chúng tôi sẽ gửi một mã xác nhận đến email:
                                            </p>
                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center font-bold text-[#003375]">
                                                {session?.user.email}
                                            </div>
                                            {otpError && <p className="text-xs text-red-500 text-center font-bold">{otpError}</p>}
                                            
                                            <div className="flex flex-col gap-2 mt-4">
                                                <button onClick={sendOtpEmail} disabled={isSendingOtp} className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-md">
                                                    {isSendingOtp ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />} 
                                                    {isSendingOtp ? 'Đang gửi mã...' : 'Xác nhận gửi mã'}
                                                </button>
                                                <button onClick={() => setResetStep(1)} className="w-full py-3 text-sm text-gray-500 font-bold hover:text-gray-900 transition-colors">
                                                    Quay lại
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : resetStep === 3 ? (
                                <div className="relative p-6 sm:p-8 animate-slideInRight">
                                    <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1.5 transition-colors"><X size={18} /></button>
                                    <div className="flex flex-col items-center">
                                        <div className="flex flex-col items-center justify-center mb-6">
                                            <div className="h-14 w-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4">
                                                <img src="/logo.png" alt="HUB Logo" className="h-10 w-10 object-contain" />
                                            </div>
                                            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Nhập mã xác nhận</h2>
                                            <p className="text-sm text-gray-500 text-center leading-relaxed px-2">
                                                Mã xác minh gồm 6 chữ số đã được gửi đến email <br />
                                                <strong className="text-[#003375] font-bold">{session?.user.email}</strong>
                                            </p>
                                        </div>

                                        <div className="flex justify-center gap-2 sm:gap-3 mb-2 w-full px-1">
                                            {[...Array(6)].map((_, index) => (
                                                <input
                                                    key={index}
                                                    id={`otp-input-${index}`}
                                                    type="text"
                                                    maxLength={1}
                                                    value={otpInput[index] || ''}
                                                    onChange={(e) => {
                                                        const value = e.target.value.replace(/[^0-9]/g, '');
                                                        let newOtp = otpInput.split('');
                                                        newOtp[index] = value;
                                                        setOtpInput(newOtp.join(''));
                                                        setOtpError('');

                                                        if (value && index < 5) {
                                                            document.getElementById(`otp-input-${index + 1}`)?.focus();
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Backspace' && !otpInput[index] && index > 0) {
                                                            document.getElementById(`otp-input-${index - 1}`)?.focus();
                                                        }
                                                    }}
                                                    className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black text-[#003375] bg-white border-2 border-gray-200 rounded-xl focus:bg-blue-50/50 focus:ring-0 focus:border-[#003375] outline-none transition-all shadow-sm"
                                                    autoFocus={index === 0}
                                                />
                                            ))}
                                        </div>
                                        
                                        <div className="h-6 mt-1 mb-4 w-full">
                                            {otpError && <p className="text-xs text-red-600 font-bold animate-shake text-center">{otpError}</p>}
                                        </div>

                                        <button 
                                            onClick={verifyOtpAndReset} 
                                            disabled={otpInput.length !== 6} 
                                            className="w-full py-3.5 bg-[#003375] text-white font-bold rounded-xl hover:bg-[#002855] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md hover:shadow-lg mb-6 flex items-center justify-center gap-2 active:scale-[0.98]"
                                        >
                                            Xác nhận xóa vĩnh viễn
                                        </button>

                                        <div className="flex flex-col items-center gap-5 w-full border-t border-gray-100 pt-5">
                                            <p className="text-sm text-gray-500">
                                                Bạn chưa nhận được mã?{' '}
                                                <button 
                                                    onClick={sendOtpEmail} 
                                                    disabled={isSendingOtp || resendCountdown > 0}
                                                    className="text-[#003375] font-bold hover:underline transition-all disabled:opacity-50 disabled:no-underline disabled:text-gray-400"
                                                >
                                                    {isSendingOtp 
                                                        ? 'Đang gửi lại...' 
                                                        : resendCountdown > 0 
                                                            ? `Gửi lại mã sau ${Math.floor(resendCountdown / 60)}:${String(resendCountdown % 60).padStart(2, '0')}` 
                                                            : 'Gửi lại mã'
                                                    }
                                                </button>
                                            </p>
                                            
                                            <button 
                                                onClick={() => {
                                                    setResetStep(2); 
                                                    setOtpInput('');
                                                    setOtpError('');
                                                }} 
                                                className="text-sm text-gray-500 font-semibold hover:text-gray-900 transition-colors flex items-center gap-1.5"
                                            >
                                                <ArrowLeft size={16} /> Quay lại
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 sm:p-12 animate-scaleIn flex flex-col items-center justify-center text-center">
                                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-bounce">
                                        <span className="text-5xl">👋</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-[#003375] mb-4">Tạm biệt bạn nhé!</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed mb-8 px-2">
                                        Dữ liệu của bạn trên hệ thống đã được xóa sạch hoàn toàn. <br/><br/>
                                        Cảm ơn bạn đã tin tưởng và đồng hành cùng <strong>HUB Planner</strong>. Chúc bạn luôn thành công và rạng rỡ trên con đường học tập tại giảng đường đại học!
                                    </p>
                                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 bg-gray-50 px-4 py-2 rounded-full">
                                        <Loader2 className="animate-spin text-[#003375]" size={14} />
                                        Đang đưa bạn về trang chủ...
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}

                {showAccountSettings && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn border border-gray-200">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900 text-base">Cài đặt thông tin</h3>
                                <button onClick={() => setShowAccountSettings(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
                            </div>
                            <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {profileError && (
                                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                                        {profileError}
                                    </div>
                                )}
                                
                                <div>
                                    <h4 className="text-xs font-black text-[#003375] uppercase tracking-wider mb-3 border-b border-gray-100 pb-1">1. Thông tin hiển thị</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Tên hiển thị (Góc phải)</label>
                                            <input type="text" value={draftFullName} onChange={(e) => setDraftFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm" placeholder="Nhập tên..." />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">Màu Avatar</label>
                                            <div className="flex gap-3">
                                                {avatarColors.map((color) => (
                                                    <button
                                                        key={color}
                                                        type="button"
                                                        onClick={() => setDraftAvatarUrl(color)}
                                                        className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${draftAvatarUrl === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-xs font-black text-[#003375] uppercase tracking-wider mb-3 border-b border-gray-100 pb-1">2. Thông tin lộ trình</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Tên sinh viên (Tùy chọn)</label>
                                            <input type="text" value={draftStudentName} onChange={(e) => setDraftStudentName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm" placeholder="Ví dụ: Nguyễn Văn A..." />
                                        </div>
                                        
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Chương trình đào tạo <span className="text-red-500">*</span></label>
                                            <select 
                                                value={draftProgram?.id || ''} 
                                                onChange={(e) => {
                                                    const prog = ACADEMIC_PROGRAMS.find(p => p.id === e.target.value) || null;
                                                    setDraftProgram(prog);
                                                    setDraftCohort('');
                                                    setDraftMajor(null);
                                                    setDraftSpecialization(null);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-sm bg-white"
                                            >
                                                <option value="" disabled>Chọn chương trình</option>
                                                {ACADEMIC_PROGRAMS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>

                                        <div className="flex gap-3">
                                            <div className="space-y-1.5 flex-1">
                                                <label className="text-xs font-bold text-gray-500">Khóa <span className="text-red-500">*</span></label>
                                                <select 
                                                    value={draftCohort} 
                                                    onChange={(e) => {
                                                        setDraftCohort(e.target.value);
                                                        setDraftMajor(null);
                                                        setDraftSpecialization(null);
                                                    }}
                                                    disabled={!draftProgram}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                                >
                                                    <option value="" disabled>Chọn khóa</option>
                                                    {draftProgram && (COHORT_OPTIONS[draftProgram.id] || []).map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5 flex-[2]">
                                                <label className="text-xs font-bold text-gray-500">Ngành học <span className="text-red-500">*</span></label>
                                                <select 
                                                    value={draftMajor?.code || ''} 
                                                    onChange={(e) => {
                                                        const majors = draftProgram && draftCohort ? getMajors(draftProgram.id, draftCohort) : [];
                                                        const maj = majors.find(m => m.code === e.target.value) || null;
                                                        setDraftMajor(maj);
                                                        if (maj && maj.specializations.length === 1) {
                                                            setDraftSpecialization(maj.specializations[0]);
                                                        } else {
                                                            setDraftSpecialization(null);
                                                        }
                                                    }}
                                                    disabled={!draftCohort}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                                >
                                                    <option value="" disabled>Chọn ngành</option>
                                                    {draftProgram && draftCohort && getMajors(draftProgram.id, draftCohort).map(m => (
                                                        <option key={m.code} value={m.code}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {draftMajor && draftMajor.specializations.length > 1 && (
                                            <div className="space-y-1.5 animate-fadeIn">
                                                <label className="text-xs font-bold text-gray-500">Chuyên ngành <span className="text-red-500">*</span></label>
                                                <select 
                                                    value={draftSpecialization?.name || ''} 
                                                    onChange={(e) => {
                                                        const spec = draftMajor.specializations.find(s => s.name === e.target.value) || null;
                                                        setDraftSpecialization(spec);
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-sm bg-white border-blue-200 ring-2 ring-blue-50"
                                                >
                                                    <option value="" disabled>Chọn chuyên ngành</option>
                                                    {draftMajor.specializations.map(s => (
                                                        <option key={s.name} value={s.name}>{s.name} ({s.credits} TC)</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2 shrink-0">
                                <button onClick={() => setShowAccountSettings(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">Hủy</button>
                                <button 
                                    onClick={handleSaveProfile} 
                                    disabled={profileSaving || !draftProgram || !draftCohort || !draftMajor || !draftSpecialization} 
                                    className="flex-[2] py-2 rounded-lg bg-[#003375] text-white font-bold text-sm hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {profileSaving ? <Loader2 className="animate-spin" size={14} /> : null} Lưu thông tin
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loadingRole) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#F8FAFC]">
                <Loader2 className="animate-spin text-[#003375] mb-4" size={40} />
                <p className="text-sm font-bold text-[#003375] animate-pulse">Đang đồng bộ tài khoản...</p>
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/login" element={<LoginScreen />} />
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/*" element={renderProtectedApp()} />
        </Routes>
    );
};

export default App;