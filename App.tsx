import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { UserData, Semester, STORAGE_KEY } from './types';
// 👇 Chỉ import Dashboard, không còn SemesterTable nữa
import { Dashboard } from './components/Dashboard'; 
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
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download, Search, HelpCircle, BookOpen, LogOut, Shield, Clock, Facebook, Phone, Mail, Calendar, ChevronDown, Users, Award, MessageSquarePlus, Heart, Info } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams, NavLink, useLocation } from 'react-router-dom';
import { ImportGuideModal } from './components/ImportGuideModal';
import { UserGuideModal } from './components/UserGuideModal';
import ProfilePage from './pages/ProfilePage';
import UserSearch from './components/UserSearch';
import NotificationBell from './components/NotificationBell';
import ScheduleBoard from './components/ScheduleBoard';
import { LandingPage } from './components/LandingPage';

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
    const navigate = useNavigate();
    const location = useLocation();

    // --- STATE CHO MENU CẨM NANG ---
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

    const [userRolePref, setUserRolePref] = useState<'unknown' | 'student' | 'admin' | 'school'>(() => {
        const savedRole = localStorage.getItem('user_role_preference');
        return (savedRole === 'student' || savedRole === 'admin' || savedRole === 'school') ? savedRole : 'unknown';
    });

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
                dataOwnerIdRef.current = session?.user?.id || null;
            } else {
                // 👇 CÚ CHỐT: Xóa sạch dữ liệu Admin trên màn hình về 0.0 TRƯỚC KHI tải dữ liệu sinh viên
                setData(INITIAL_DATA);
                dataOwnerIdRef.current = userProfile.id; // Khóa Auto-save lập tức
                
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
        if (userRolePref === 'school' && session?.user?.id) {
            const targetId = (isAdmin && viewingUser) ? viewingUser.id : session.user.id;
            return `${STORAGE_KEY}:${targetId}`;
        }
        return STORAGE_KEY;
    }, [session?.user?.id, userRolePref, isAdmin, viewingUser]);

    const saveTimeoutRef = useRef<number | null>(null);

useEffect(() => {
        let isActive = true;
        setIsLoaded(false);
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);

        const loadData = async () => {
            if (userRolePref === 'school' && session?.user?.id && supabase) {
                
                // 1. NẾU ADMIN ĐANG XEM SINH VIÊN KHÁC (CẤM ĐỌC LOCALSTORAGE)
                if (isAdmin && viewingUser) {
                    const { data: profileData } = await supabase
                        .from(STUDENT_PROFILE_TABLE)
                        .select('data')
                        .eq('id', viewingUser.id)
                        .maybeSingle();

                    if (!isActive) return;

                    // Nếu trên Database có điểm thì lấy, nếu bạn đã xóa (null) thì lập tức ép về 0.0
                    if (profileData && profileData.data) {
                        setData({ ...INITIAL_DATA, ...profileData.data });
                    } else {
                        setData(INITIAL_DATA); 
                    }
                    
                    dataOwnerIdRef.current = viewingUser.id;
                    setIsLoaded(true);
                    return; // Dừng tại đây, tuyệt đối không chạy xuống dưới
                }

                // 2. NẾU LÀ BẠN ĐANG TỰ XEM CHÍNH MÌNH (LOAD BÌNH THƯỜNG)
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

                // Nếu bạn tự xem bạn mà DB trống, lúc này mới cho phép lấy từ LocalStorage
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

            // Logic cho khách vãng lai (Guest)
            if (userRolePref !== 'school') { setProfileFullName(''); setProfileAvatarUrl(''); }
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
    }, [storageKey, session?.user?.id, userRolePref, isAdmin, viewingUser]);

useEffect(() => {
        if (isLoaded && !viewingUser) {
            localStorage.setItem(storageKey, JSON.stringify(data));
        }
    }, [data, isLoaded, storageKey, viewingUser]);

useEffect(() => {
        if (!isLoaded) return;
        if (userRolePref !== 'school' || !session?.user?.id || !supabase) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            const targetUserId = (isAdmin && viewingUser) ? viewingUser.id : session.user.id;

            // 👇 BỨC TƯỜNG LỬA CHỐNG GHI ĐÈ NHẦM 👇
            // Chỉ cho phép Auto-save chạy nếu data hiện tại thực sự là của targetUserId
            if (dataOwnerIdRef.current !== targetUserId) return;

            if (isAdmin && viewingUser) {
                // Admin đang soi và sửa data của sinh viên -> Update im lặng vào DB sinh viên
                await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .update({
                        data: data,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', targetUserId);
                return;
            }

            // Lưu bình thường cho chính bản thân Admin
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

    // 👇 CÁC HÀM XỬ LÝ BẢNG ĐIỂM 👇
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
        if (!window.confirm("CẢNH BÁO CỰC MẠNH: Hành động này sẽ xóa VĨNH VIỄN toàn bộ dữ liệu trên máy và máy chủ. Bạn có chắc chắn không?")) {
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
                await supabase.auth.signOut();
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
                <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F8FAFC] animate-fadeIn">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-md text-center">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Shield className="text-red-500" size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                        <p className="text-gray-500 mb-6 text-sm">
                            Hệ thống phát hiện bạn đang sử dụng tài khoản email: <br /> <strong className="text-gray-800">{session?.user.email}</strong>
                        </p>
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-8 text-left border border-red-100">
                            <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} /> Yêu cầu bắt buộc:</p>
                            <p>Vui lòng đăng nhập bằng email sinh viên trường ĐH Ngân hàng TP.HCM có đuôi tên miền là <strong>@{SCHOOL_DOMAIN}</strong></p>
                        </div>
                        <button onClick={handleSchoolLogout} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 shadow-sm">
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
                            
                            <div className="flex items-center gap-3 shrink-0 sm:hidden">
                                {(userRolePref === 'school' && session?.user?.id) && (
                                    <NotificationBell currentUserId={session.user.id} />
                                )}
                                
                                {userRolePref === 'school' && (
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
                                )}
                                
                                {userRolePref !== 'admin' && userRolePref !== 'school' && (
                                    <button onClick={handleLogout} className="text-gray-400 hover:text-[#003375] transition-colors" title="Thoát">
                                        <Shield size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {(userRolePref === 'school' || userRolePref === 'student') && (
                            <div className="hidden md:block flex-1 max-w-sm">
                                <UserSearch />
                            </div>
                        )}

                        <nav className="flex items-center justify-between sm:justify-end flex-1 gap-1 sm:gap-6 sm:h-full p-1.5 sm:p-0 sm:px-2 bg-gray-50 sm:bg-transparent rounded-full sm:rounded-none border border-gray-100 sm:border-none w-full sm:w-auto overflow-x-auto sm:overflow-visible no-scrollbar sm:mask-edges relative">
                            
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

 <div className="hidden sm:flex items-center gap-3 shrink-0 lg:pl-4 lg:border-l border-gray-200">
        {isAdmin && (
        <form onSubmit={handleAdminSearchUser} className="flex items-center gap-2 mr-2 bg-purple-50 p-1 rounded-lg border border-purple-200 shadow-inner">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Admin: Tìm MSSV..." 
                    value={adminSearchMssv}
                    onChange={(e) => setAdminSearchMssv(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs w-40 rounded-md border border-purple-200 outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-400" />
            </div>
{viewingUser ? (
                <button type="button" onClick={() => { 
                    setViewingUser(null); 
                    setAdminSearchMssv(''); 
                    setData(INITIAL_DATA); // 👈 THÊM DÒNG NÀY ĐỂ ÉP RESET VỀ ĐIỂM ADMIN
                    playClick(); 
                }} className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-md hover:bg-red-600 transition-colors whitespace-nowrap">
                    Thoát Xem
                </button>
            ) : (
                <button type="submit" disabled={isSearchingUser} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-md hover:bg-purple-700 transition-colors whitespace-nowrap">
                    {isSearchingUser ? '...' : 'Xem'}
                </button>
            )}
        </form>
    )}
    <button onClick={() => { playClick(); setShowGuide(true); }} className="text-gray-400 hover:text-gray-900 transition-colors hidden sm:block" title="Hướng dẫn">
                                <HelpCircle size={18} />
                            </button>
                            
                            {(userRolePref === 'school' && session?.user?.id) && (
                                <NotificationBell currentUserId={session.user.id} />
                            )}
                            
                            {userRolePref === 'admin' ? (
                                <div className="flex items-center gap-3 border-l border-gray-200 pl-3">
                                    {isAdmin && (
                                        <button onClick={() => { playClick(); setShowActivityLog(true); }} className="text-gray-400 hover:text-[#003375] transition-colors" title="Lịch sử hoạt động">
                                            <Clock size={18} />
                                        </button>
                                    )}
                                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 transition-colors" title="Đăng xuất">
                                        <LogOut size={18} />
                                    </button>
                                </div>
                            ) : userRolePref === 'school' ? (
                                <div className="relative flex items-center gap-3">
                                    <div className="hidden lg:flex flex-col items-end justify-center">
                                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide leading-none">{displayName}</span>
                                        <span className="text-[10px] text-gray-400 font-medium leading-none mt-1">{studentId}</span>
                                    </div>
                                    <button onClick={() => setIsUserMenuOpen(prev => !prev)} className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
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
                                            <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Cài đặt hiển thị</button>
                                            <button type="button" onClick={() => { setIsUserMenuOpen(false); resetData(); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                            <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                        </div>
                                    )}
                                </div>
) : (
                                // 👇 NÚT LÀM MỚI VÀ NÚT THOÁT CHO TÀI KHOẢN ẨN DANH 👇
                                <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                                    <button onClick={resetData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa dữ liệu dùng thử">
                                        <RotateCcw size={16} />
                                        <span className="text-xs font-bold hidden md:block">Reset dữ liệu</span>
                                    </button>
                                    <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-[#003375] hover:bg-blue-50 transition-colors" title="Thoát chế độ ẩn danh">
                                        <LogOut size={16} />
                                        <span className="text-xs font-bold hidden md:block">Thoát</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10">
<main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 sm:pt-3 min-h-full flex flex-col">                        <div className="flex-1">
                            <Routes>
                                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                
                                {/* 👇 ROUTE DASHBOARD ĐÃ ĐƯỢC DỌN DẸP SẠCH SẼ VÀ KẾT NỐI HÀM 👇 */}
                                <Route path="/dashboard" element={
                                    <div className="animate-fadeIn">
                                        <Dashboard
                                            data={data}
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

                {/* {(userRolePref === 'student' || userRolePref === 'school') && (
                    <AIAdvisor data={data} />
                )} */}

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
                
                {showAccountSettings && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn border border-gray-200">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900 text-base">Cài đặt tài khoản</h3>
                                <button onClick={() => setShowAccountSettings(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
                            </div>
                            <div className="p-5 space-y-5">
                                {profileError && (
                                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                                        {profileError}
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Tên hiển thị</label>
                                    <input type="text" value={draftFullName} onChange={(e) => setDraftFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm" placeholder="Nhập tên..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Màu Avatar</label>
                                    <div className="flex gap-3">
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
                                                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${draftAvatarUrl === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2">
                                <button onClick={() => setShowAccountSettings(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">Hủy</button>
                                <button onClick={handleSaveProfile} disabled={profileSaving} className="flex-1 py-2 rounded-lg bg-[#003375] text-white font-bold text-sm hover:bg-[#002855] transition-colors flex items-center justify-center gap-2">
                                    {profileSaving ? <Loader2 className="animate-spin" size={14} /> : null} Lưu thay đổi
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
            <Route path="/role" element={<RoleSelection onSelect={handleRoleSelect} />} />
            <Route path="/guest" element={<GuestWrapper userRolePref={userRolePref} setRolePreference={setRolePreference}>{renderProtectedApp()}</GuestWrapper>} />
            
            {/* 👇 ĐÃ SỬA LẠI LOGIC CHỖ NÀY 👇 */}
            <Route path="/" element={
                (session || userRolePref === 'student') 
                    ? <Navigate to="/dashboard" replace /> 
                    : <LandingPage />
            } />
            {/* 👆 ĐÃ SỬA LẠI LOGIC CHỖ NÀY 👆 */}

            <Route path="/*" element={(session || userRolePref === 'student') ? renderProtectedApp() : <Navigate to="/" replace />} />
        </Routes>
    );
};

export default App;