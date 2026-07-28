import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { UserData, Semester } from './types';
import { ActivityLogModal } from './components/ActivityLogModal';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, AlertTriangle, Zap, Download, Search, HelpCircle, LogOut, Shield, Clock, Facebook, Phone, Mail, Calendar, ChevronDown, Users, Award, MessageSquarePlus, Heart, Info, User, ShieldAlert, ChevronLeft, ArrowUp, ArrowDown, ListFilter, Trash2, Crown, BarChart2, TrendingUp, HeartCrack, ArrowLeft, RefreshCw, ClipboardList, Share, PlusSquare } from 'lucide-react';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { useAppMode } from './hooks/useAppMode';
import { useStudyData } from './hooks/useStudyData';
import { useAccountProfileDraft } from './hooks/useAccountProfileDraft';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { ImportGuideModal } from './components/ImportGuideModal';
import { TranscriptImportPreviewModal } from './components/TranscriptImportPreviewModal';
import { UserGuideModal } from './components/UserGuideModal';
import NotificationBell from './components/NotificationBell';
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";
import { AIAdvisor } from './components/AIAdvisor';
import { FloatingSupportTab } from './components/FloatingSupportTab';
import { MobileAIAdvisor } from './components/MobileAIAdvisor';
import { ACADEMIC_PROGRAMS, getMajors } from './utils/programs';
import { DesktopLayout } from './layouts/DesktopLayout';
import { MobileAppLayout } from './layouts/MobileAppLayout';
import { PasswordSetupModal } from './components/PasswordSetupModal';
import { AccountPasswordOtpModal } from './components/account/AccountPasswordOtpModal';
import { AccountPasswordPanel } from './components/account/AccountPasswordPanel';
import { AccountAcademicProfileFields } from './components/account/AccountAcademicProfileFields';
import { AccountPublicProfileFields } from './components/account/AccountPublicProfileFields';
import { AccountSettingsModal } from './components/account/AccountSettingsModal';
import { showAlert, showConfirm } from './utils/appNotifications';
import { clearLocalStoragePreservingDevicePreferences } from './utils/devicePreferences';
import {
    isPushSupported,
    setActivePushNotificationUser,
    subscribeToDeviceNotifications,
    unbindDeviceNotificationsForCurrentUser,
} from './utils/pushNotifications';
import { fetchProfilePrivate, updateProfilePrivate, upsertProfilePrivate } from './utils/profilePrivate';
import { apiHeaders, apiUrl } from './utils/api';
import { logActivity, logActivityQuietly } from './utils/activityLogger';
import { recordPolicyConsent } from './utils/policyConsent';
import { TurnstileBox } from './components/TurnstileBox';
import { ProtectedSubmitError, verifyTurnstileOnly } from './utils/protectedSubmit';
import { logWebError } from './utils/logWebError';
import { promptSendParserDebugFile } from './utils/parserDebugTicket';
import {
    AdminEventCandidates,
    AdminReports,
    AdminSupportTickets,
    Dashboard,
    EventsBoard,
    Handbook,
    LostFoundBoard,
    MobileEvents,
    MobileHandbook,
    MobileHome,
    MobileLearning,
    MobileLostFound,
    MobileProfile,
    ProfilePage,
    ProfileSearchPage,
    ScheduleBoard,
    SupportTickets,
} from './app/routing/lazyScreens';
import { RouteLoadingFallback } from './app/routing/RouteLoadingFallback';
import { RouteErrorBoundary } from './app/routing/RouteErrorBoundary';
import { AppRoutes } from './app/routing/AppRoutes';
import { AuthGate } from './app/auth/AuthGate';
import {
    getNextTranscriptSemesterName,
    hasCompleteRequiredStudyProfile,
} from './features/study-data/model';

let globalDeferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
});
const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const STUDENT_PROFILE_TABLE = 'profiles';
const OTP_RESEND_COOLDOWN_SECONDS = 10 * 60;
const PUSH_DEVICE_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;

const isMissingLegacyProfileColumn = (error: any, columnName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''}`;
    return message.includes(columnName) || error?.code === '42703' || error?.code === 'PGRST204';
};

const normalizeOtpEmail = (email: string) => email.trim().toLowerCase();
const otpCooldownKey = (email: string, purpose: 'register' | 'forgot_password') =>
    `hubplanner:otp-cooldown:${purpose}:${normalizeOtpEmail(email)}`;
const getStoredOtpCooldown = (email: string, purpose: 'register' | 'forgot_password') => {
    const until = Number(localStorage.getItem(otpCooldownKey(email, purpose)) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
};
const storeOtpCooldown = (email: string, purpose: 'register' | 'forgot_password', seconds = OTP_RESEND_COOLDOWN_SECONDS) => {
    localStorage.setItem(otpCooldownKey(email, purpose), String(Date.now() + seconds * 1000));
};
const formatOtpCooldown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const COHORT_OPTIONS: Record<string, string[]> = {
    'standard': ['K38', 'K39', 'K40', 'K41'],
    'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
    'special': ['CTDBK1', 'CTDBK2']
};

const App: React.FC = () => {
    const { isAdmin, isAuditor, isCTV, session, loading: loadingRole } = useUserRole();
    console.log("Kiểm tra quyền hiện tại:", { isAdmin, isAuditor, isCTV });
    const navigate = useNavigate();
    const location = useLocation();
    const isExamStudyRoute = false;

    const isGuest = !session;
    const [passwordSetAt, setPasswordSetAt] = useState<string | null | undefined>(undefined);
    const [passwordSetupSchemaMissing, setPasswordSetupSchemaMissing] = useState(false);

    const {
        isAppMode,
        isMobileScreen,
        useMobileLayout,
        isMobileBrowser,
    } = useAppMode(location.search);
    const lastLoggedUserIdRef = useRef<string | null>(null);
    const lastPushDeviceSyncRef = useRef<{ userId: string | null; syncedAt: number }>({ userId: null, syncedAt: 0 });

    useEffect(() => {
        if (!session?.user?.id) return;
        const pendingRaw = localStorage.getItem('hubplanner:pending-registration-consent');
        if (!pendingRaw) return;

        let pending: any = null;
        try {
            pending = JSON.parse(pendingRaw);
        } catch {
            localStorage.removeItem('hubplanner:pending-registration-consent');
            return;
        }

        const policies = Array.isArray(pending?.policies) ? pending.policies : [];
        if (!policies.length) {
            localStorage.removeItem('hubplanner:pending-registration-consent');
            return;
        }

        Promise.all(policies.map((policyType: string) => (
            recordPolicyConsent(policyType, pending?.context || 'oauth_registration')
        ))).finally(() => {
            localStorage.removeItem('hubplanner:pending-registration-consent');
        });
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.user?.id) {
            lastLoggedUserIdRef.current = null;
            return;
        }

        const currentSession = session;
        const currentUserId = currentSession.user.id;
        if (!currentUserId) {
            lastLoggedUserIdRef.current = null;
            return;
        }

        if (lastLoggedUserIdRef.current === currentUserId || loadingRole || !(isAdmin || isAuditor)) return;

        lastLoggedUserIdRef.current = currentUserId;
        logActivityQuietly({
            action: 'login',
            session: currentSession,
            userRole: isAdmin ? 'admin' : 'auditor',
            pagePath: location.pathname,
            metadata: {
                authProvider: currentSession.user.app_metadata?.provider || 'unknown',
            },
        });
    }, [session?.user?.id, loadingRole, isAdmin, isAuditor, location.pathname]);

    useEffect(() => {
        setActivePushNotificationUser(session?.user?.id || null);

        return () => {
            setActivePushNotificationUser(null);
        };
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.user?.id || !isPushSupported() || Notification.permission !== 'granted') return;

        const syncPushDevice = (force = false) => {
            const now = Date.now();
            const lastSync = lastPushDeviceSyncRef.current;
            if (!force && lastSync.userId === session.user.id && now - lastSync.syncedAt < PUSH_DEVICE_SYNC_MIN_INTERVAL_MS) {
                return;
            }

            lastPushDeviceSyncRef.current = { userId: session.user.id, syncedAt: now };
            subscribeToDeviceNotifications(session.user.id).catch((error) => {
                console.error('Không thể đồng bộ thiết bị nhận thông báo:', error);
            });
        };

        syncPushDevice(true);

        const handleVisibilityChange = () => {
            if (!document.hidden) syncPushDevice();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [session?.user?.id]);

    useEffect(() => {
        let isMounted = true;

        const loadPasswordStatus = async () => {
            setPasswordSetupSchemaMissing(false);
            if (!session?.user?.id || !supabase) {
                if (isMounted) setPasswordSetAt(undefined);
                return;
            }

            let profilePasswordSetAt: string | null | undefined;
            let privateProfileMissing = false;

            try {
                const privateProfile = await fetchProfilePrivate(session.user.id);
                profilePasswordSetAt = privateProfile?.password_set_at;
                privateProfileMissing = !privateProfile;
            } catch (error: any) {
                console.warn('Không thể kiểm tra trạng thái mật khẩu private:', error);
                privateProfileMissing = true;
            }

            if (!isMounted) return;

            if (false as boolean) {
                const error = { message: '', details: '', code: '' } as any;
                const message = `${error.message || ''} ${error.details || ''}`;
                const missingPasswordStatusColumn =
                    message.includes('password_set_at') ||
                    (error as any).code === '42703' ||
                    (error as any).code === 'PGRST204';
                console.warn('Không thể kiểm tra trạng thái mật khẩu:', error);
                setPasswordSetupSchemaMissing(missingPasswordStatusColumn);
                setPasswordSetAt(undefined);
                return;
            }

            const authProvider = String((session.user.app_metadata as any)?.provider || '').toLowerCase();
            const identityProviders = Array.isArray((session.user as any)?.identities)
                ? (session.user as any).identities.map((identity: any) => String(identity?.provider || '').toLowerCase())
                : [];
            const isGoogleAuthSession = authProvider === 'google' || identityProviders.includes('google');

            if (!profilePasswordSetAt && !isGoogleAuthSession) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('password_set_at')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (!isMounted) return;

                if (error) {
                    if (!isMissingLegacyProfileColumn(error, 'password_set_at')) {
                        console.warn('Không thể kiểm tra trạng thái mật khẩu legacy:', error);
                    }
                } else {
                    profilePasswordSetAt = (data as any)?.password_set_at;
                }
            }

            const metadataPasswordSet = !isGoogleAuthSession && Boolean((session.user.user_metadata as any)?.password_set_at);
            if (!profilePasswordSetAt && metadataPasswordSet) {
                const markedAt = new Date().toISOString();
                setPasswordSetAt(markedAt);
                const syncPrivate = privateProfileMissing
                    ? upsertProfilePrivate({ user_id: session.user.id, email: session.user.email, password_set_at: markedAt, updated_at: markedAt })
                    : updateProfilePrivate(session.user.id, { password_set_at: markedAt, updated_at: markedAt });
                syncPrivate
                    .catch((updateError) => {
                        if (updateError) console.warn('Không thể đồng bộ trạng thái mật khẩu:', updateError);
                    });
                return;
            }

            setPasswordSetAt(profilePasswordSetAt ?? null);
        };

        loadPasswordStatus();

        return () => {
            isMounted = false;
        };
    }, [session?.user?.id]);

    // ==========================================
    // ✨ LÕI XỬ LÝ CÀI ĐẶT APP (PWA INSTALL)
    // ==========================================
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    useEffect(() => {
        // Nhận diện thiết bị Apple
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod|macintosh/.test(userAgent) && 'ontouchend' in document;
        setIsIOS(isIOSDevice);

        // Bắt sự kiện cài đặt tự động (Chrome, Edge, Android...)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleInstallApp = async () => {
        playClick();
        const promptToUse = deferredPrompt || globalDeferredPrompt;
        if (isIOS) {
            setShowIOSInstructions(true);
        } else if (promptToUse) {
            promptToUse.prompt();
            const { outcome } = await promptToUse.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                globalDeferredPrompt = null;
            }
        } else {
          await showAlert({
              title: 'Không thể cài tự động',
              message: 'Trình duyệt không hỗ trợ cài tự động, hoặc HUB Planner đã được cài trên thiết bị này rồi.',
              variant: 'info',
              confirmText: 'Đã hiểu',
          });
        }
    };
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('install') === 'true') {
            // Đợi 1 giây để giao diện load xong, sau đó nảy bảng cài đặt lên
            const timer = setTimeout(() => {
                handleInstallApp();

                // (Tuỳ chọn) Dọn dẹp URL cho đẹp, xóa chữ ?install=true đi sau khi đã hiện bảng
                window.history.replaceState({}, document.title, location.pathname);
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [location, handleInstallApp]);
    // ==========================================

    // ==========================================
    // LOGIC BONG BÓNG CHAT
    // ==========================================
    const [showBubble, setShowBubble] = useState(false);

    useEffect(() => {
        const initialTimeout = setTimeout(() => setShowBubble(true), 2000);
        const interval = setInterval(() => {
            setShowBubble(true);
            setTimeout(() => {
                setShowBubble(false);
            }, 5000);
        }, 10000);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, []);

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
            else if (location.pathname.includes('/handbook') || isHandbookMenuOpen || location.pathname.includes('/admin-reports')) activeIndex = 4;

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

    const [adminSearchMssv, setAdminSearchMssv] = useState('');
    const [viewingUser, setViewingUser] = useState<{ id: string, mssv: string, name: string } | null>(null);
    const [isSearchingUser, setIsSearchingUser] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportGuide, setShowImportGuide] = useState(false);
    const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
    const [gradeImportTurnstileToken, setGradeImportTurnstileToken] = useState('');
    const [pendingTranscriptImport, setPendingTranscriptImport] = useState<{
        semesters: Semester[];
        importedSubjectCount: number;
        onImportedSemesters?: (semesters: Semester[]) => void;
    } | null>(null);
    const [isConfirmingTranscriptImport, setIsConfirmingTranscriptImport] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showAccountSettings, setShowAccountSettings] = useState(false);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [deniedEmail, setDeniedEmail] = useState<string>('');
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [profileFullName, setProfileFullName] = useState('');
    const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
    const {
        data,
        isLoaded,
        commitDataUpdate,
        resetStudyData,
        saveSemestersNow,
        completeOnboarding,
    } = useStudyData({
        session,
        isAdmin,
        isAuditor,
        viewingUser,
        pathname: location.pathname,
        profileFullName,
        profileAvatarUrl,
        setProfileFullName,
        setProfileAvatarUrl,
    });
    const {
        draftFullName,
        setDraftFullName,
        draftAvatarUrl,
        setDraftAvatarUrl,
        draftBio,
        setDraftBio,
        draftClassName,
        setDraftClassName,
        defaultClassName,
        draftProfileTags,
        setDraftProfileTags,
        draftPublicProfileEnabled,
        setDraftPublicProfileEnabled,
        draftShowProfileStats,
        setDraftShowProfileStats,
        profileRefreshKey,
        setDraftAvatarFile,
        draftAvatarPreview,
        setDraftAvatarPreview,
        profileSaving,
        profileError,
        setProfileError,
        draftStudentName,
        setDraftStudentName,
        draftProgram,
        setDraftProgram,
        draftCohort,
        setDraftCohort,
        draftMajor,
        setDraftMajor,
        draftSpecialization,
        setDraftSpecialization,
        saveProfile,
    } = useAccountProfileDraft({
        open: showAccountSettings,
        session,
        data,
        profileFullName,
        profileAvatarUrl,
        commitDataUpdate,
        setProfileFullName,
        setProfileAvatarUrl,
        onSaved: () => setShowAccountSettings(false),
    });
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [showAccountPasswordOtpModal, setShowAccountPasswordOtpModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [accountPasswordOtp, setAccountPasswordOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isAccountPasswordOtpMode, setIsAccountPasswordOtpMode] = useState(false);
    const [accountPasswordOtpCooldownRemaining, setAccountPasswordOtpCooldownRemaining] = useState(0);
    const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
    const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
    const [passwordChangeNotice, setPasswordChangeNotice] = useState<string | null>(null);
    const [accountPasswordTurnstileToken, setAccountPasswordTurnstileToken] = useState('');

    const handleAdminSearchUser = async (event?: React.FormEvent) => {
        event?.preventDefault();
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
                alert('Không tìm thấy sinh viên có MSSV này trong hệ thống!');
                setViewingUser(null);
                resetStudyData(session?.user?.id || null);
            } else {
                resetStudyData(userProfile.id);
                setViewingUser({
                    id: userProfile.id,
                    mssv: userProfile.student_code,
                    name: userProfile.full_name || 'Chưa cập nhật tên',
                });
                alert(`Đã chuyển sang xem dữ liệu của sinh viên: ${userProfile.student_code}`);
            }
        } catch (error) {
            console.error(error);
            alert('Lỗi khi tìm kiếm sinh viên!');
        } finally {
            setIsSearchingUser(false);
        }
    };

    const [showResetModal, setShowResetModal] = useState(false);
    const [resetStep, setResetStep] = useState<1 | 2 | 3 | 4>(1);
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const [deleteTurnstileToken, setDeleteTurnstileToken] = useState('');

    const resetDeleteAccountModal = useCallback(() => {
        setShowResetModal(false);
        setResetStep(1);
        setGeneratedOtp('');
        setOtpInput('');
        setOtpError('');
        setResendCountdown(0);
        setDeleteTurnstileToken('');
    }, []);

    useEffect(() => {
        if (!session?.user?.id && showResetModal) {
            resetDeleteAccountModal();
        }
    }, [session?.user?.id, showResetModal, resetDeleteAccountModal]);

    // ==========================================
    // ✨ THUẬT TOÁN CAPTCHA NÂNG CAO ✨
    // ==========================================
    const [captchaQuestion, setCaptchaQuestion] = useState('');
    const [captchaAnswer, setCaptchaAnswer] = useState<number | null>(null);
    const [userCaptchaInput, setUserCaptchaInput] = useState('');

    const generateCaptcha = useCallback(() => {
        const patterns = [
            () => {
                const n1 = Math.floor(Math.random() * 50) + 10;
                const n2 = Math.floor(Math.random() * 50) + 1;
                return { q: `${n1} + ${n2}`, a: n1 + n2 };
            },
            () => {
                const n1 = Math.floor(Math.random() * 50) + 30;
                const n2 = Math.floor(Math.random() * 20) + 1;
                return { q: `${n1} - ${n2}`, a: n1 - n2 };
            },
            () => {
                const n1 = Math.floor(Math.random() * 9) + 2;
                const n2 = Math.floor(Math.random() * 9) + 2;
                return { q: `${n1} × ${n2}`, a: n1 * n2 };
            },
            () => {
                const n1 = Math.floor(Math.random() * 20) + 1;
                const n2 = Math.floor(Math.random() * 20) + 1;
                const n3 = Math.floor(Math.random() * 10) + 1;
                return { q: `${n1} + ${n2} + ${n3}`, a: n1 + n2 + n3 };
            },
            () => {
                const n1 = Math.floor(Math.random() * 30) + 20;
                const n2 = Math.floor(Math.random() * 15) + 1;
                const n3 = Math.floor(Math.random() * 20) + 1;
                return { q: `${n1} - ${n2} + ${n3}`, a: n1 - n2 + n3 };
            }
        ];

        const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];
        const { q, a } = selectedPattern();

        setCaptchaQuestion(q);
        setCaptchaAnswer(a);
        setUserCaptchaInput('');
        setOtpError('');
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (resendCountdown > 0) {
            timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    // ✨ FIX LỖI TS 1: Ép kiểu any cho fileInputRef để tương thích với tất cả interface con
    const fileInputRef = useRef<any>(null);

    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: true, zIndex: 0 },
        fpsLimit: 60,
        particles: {
            number: { value: 18, density: { enable: true, area: 900 } },
            color: { value: ["#FFC0CB", "#FF69B4", "#FFD700", "#FFFF00"] },
            shape: { type: "circle" },
            opacity: { value: { min: 0.12, max: 0.36 }, animation: { enable: true, speed: 0.35 } },
            size: { value: { min: 2, max: 4 } },
            move: { enable: true, speed: { min: 0.6, max: 1.3 }, direction: "bottom-right", random: true, straight: false, outModes: "out" },
            wobble: { enable: true, distance: 3, speed: 3 }
        },
        detectRetina: true,
    }), []);

    useEffect(() => {
        if (showAccountSettings) {
            setShowPasswordChange(false);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setShowCurrentPassword(false);
            setShowNewPassword(false);
            setIsAccountPasswordOtpMode(false);
            setPasswordChangeError(null);
            setPasswordChangeNotice(null);
            setAccountPasswordTurnstileToken('');
        }
    }, [showAccountSettings]);

    useEffect(() => {
        const email = session?.user?.email;
        if (!email) {
            setAccountPasswordOtpCooldownRemaining(0);
            return;
        }

        const syncCooldown = () => {
            setAccountPasswordOtpCooldownRemaining(getStoredOtpCooldown(email, 'forgot_password'));
        };

        syncCooldown();
        const timer = window.setInterval(syncCooldown, 1000);
        return () => window.clearInterval(timer);
    }, [session?.user?.email]);

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

            if (isGuest || isAdmin || isAuditor || isCTV || !session?.user?.email) return;

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
                setActivePushNotificationUser(null);
                await unbindDeviceNotificationsForCurrentUser(session?.user?.id);
                if (session && (isAdmin || isAuditor)) {
                    await logActivity({
                        action: 'logout',
                        session,
                        userRole: isAdmin ? 'admin' : 'auditor',
                        pagePath: location.pathname,
                    });
                }
            } catch (e) {
                console.error("Lỗi gỡ liên kết thông báo thiết bị:", e);
            }

            try {
                if (supabase) await supabase.auth.signOut();
            } catch (e) {
                console.error("Lỗi khi đăng xuất Supabase:", e);
            }

            clearLocalStoragePreservingDevicePreferences();
            sessionStorage.clear();
            resetStudyData();
            setProfileFullName('');
            setProfileAvatarUrl('');
            setViewingUser(null);
            resetDeleteAccountModal();

            navigate('/login', { replace: true });
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
            setDeleteTurnstileToken('');
            setIsUserMenuOpen(false);
        }
    };

    const handleVerifyCaptchaAndSendOtp = () => {
        playClick();
        if (parseInt(userCaptchaInput) !== captchaAnswer) {
            setOtpError('Kết quả phép tính không đúng! Hệ thống đã đổi câu hỏi bảo mật mới.');
            setDeleteTurnstileToken('');
            return;
        }
        setOtpError('');
        sendOtpEmail();
    };

    const handleVerifyTurnstileAndSendOtp = async () => {
        playClick();
        if (!deleteTurnstileToken) {
            setOtpError('Vui long xac minh ban khong phai robot.');
            return;
        }
        setOtpError('');
        setIsSendingOtp(true);
        try {
            await verifyTurnstileOnly(deleteTurnstileToken);
            await sendOtpEmail();
        } catch (error: any) {
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: { purpose: 'delete_data' },
            });
            setOtpError(error.message || 'Xac minh bao mat khong thanh cong. Vui long thu lai.');
            setDeleteTurnstileToken('');
            setIsSendingOtp(false);
        }
    };

    const sendOtpEmail = async () => {
        setIsSendingOtp(true);
        setOtpError('');
        try {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedOtp(otp);

            const expireTime = new Date(Date.now() + 15 * 60 * 1000);
            const timeString = expireTime.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Ho_Chi_Minh',
            });

            const { data, error } = await supabase.functions.invoke('send-otp-email', {
                body: {
                    email: session?.user?.email,
                    passcode: otp,
                    time: timeString,
                    expiresAt: expireTime.toISOString(),
                    purpose: 'delete_data'
                }
            });

            if (error || !data || data.error) {
                throw new Error("Lỗi từ máy chủ Backend");
            }

            setResetStep(3);
            setOtpInput('');
            setResendCountdown(300);

        } catch (error) {
            console.error('Lỗi gửi mail:', error);
            setOtpError('Hệ thống mail đang bận. Vui lòng thử lại sau.');
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: {
                    purpose: 'delete_data',
                    email: session?.user?.email,
                },
            });
            setDeleteTurnstileToken('');
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
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ action: 'delete-account' }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'Không thể xóa tài khoản.');
            }

            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
            console.error("Lỗi khi reset:", error);
            await logWebError({
                source: 'auth',
                action: 'delete_data',
                error,
            });
        } finally {
            try {
                setActivePushNotificationUser(null);
                await unbindDeviceNotificationsForCurrentUser(session?.user?.id);
            } catch(e) {}

            try {
                if (supabase) await supabase.auth.signOut();
            } catch(e) {}

            clearLocalStoragePreservingDevicePreferences();
            sessionStorage.clear();

            navigate('/login', { replace: true });
        }
    };

    const validateAccountPasswordChange = () => {
        if (isAccountPasswordOtpMode && accountPasswordOtp.length !== 6) return 'Nhập mã OTP gồm 6 chữ số.';
        if (!isAccountPasswordOtpMode && !currentPassword) return 'Nhập mật khẩu cũ để xác nhận.';
        if (!isAccountPasswordOtpMode && !accountPasswordTurnstileToken) return 'Vui lòng xác minh bạn không phải robot.';
        if (newPassword.length < 8) return 'Mật khẩu mới cần ít nhất 8 ký tự.';
        if (newPassword !== confirmNewPassword) return 'Mật khẩu mới và nhập lại mật khẩu mới chưa trùng khớp.';
        if (!isAccountPasswordOtpMode && currentPassword === newPassword) return 'Mật khẩu mới cần khác mật khẩu cũ.';
        return null;
    };

    const handleChangeAccountPassword = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!session?.user?.email || !supabase) return;

        const invalid = validateAccountPasswordChange();
        if (invalid) {
            setPasswordChangeError(invalid);
            setPasswordChangeNotice(null);
            return;
        }

        if (!isAccountPasswordOtpMode && !accountPasswordTurnstileToken) {
            setPasswordChangeError('Vui lòng xác minh bạn không phải robot.');
            setPasswordChangeNotice(null);
            return;
        }

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            const email = session.user.email;
            if (isAccountPasswordOtpMode) {
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: apiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        action: 'verify-otp',
                        purpose: 'forgot_password',
                        email,
                        otp: accountPasswordOtp,
                        password: newPassword,
                        confirmPassword: confirmNewPassword,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'Mã OTP không chính xác hoặc đã hết hạn.');
            } else {
                await verifyTurnstileOnly(accountPasswordTurnstileToken);
                const { error: verifyError } = await supabase.auth.signInWithPassword({
                    email,
                    password: currentPassword,
                });
                if (verifyError) throw new Error('Mật khẩu cũ không chính xác.');

                const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
                if (updateError) throw updateError;
            }

            try {
                await supabase.rpc('mark_password_set');
            } catch {
                await updateProfilePrivate(session.user.id, { password_set_at: new Date().toISOString() });
            }
            await updateProfilePrivate(session.user.id, { password_set_at: new Date().toISOString() });

            setPasswordSetAt(new Date().toISOString());
            localStorage.removeItem(otpCooldownKey(session.user.email, 'forgot_password'));
            setAccountPasswordOtpCooldownRemaining(0);
            setShowAccountPasswordOtpModal(false);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setIsAccountPasswordOtpMode(false);
            setAccountPasswordTurnstileToken('');
            setPasswordChangeNotice('Đã cập nhật mật khẩu thành công.');
        } catch (error: any) {
            setPasswordChangeError(error.message || 'Không thể cập nhật mật khẩu lúc này.');
            await logWebError({
                source: 'auth',
                action: 'reset_password',
                error,
                metadata: {
                    mode: isAccountPasswordOtpMode ? 'otp' : 'current_password',
                    email: session.user.email,
                },
            });
            if (!isAccountPasswordOtpMode) setAccountPasswordTurnstileToken('');
        } finally {
            setPasswordChangeLoading(false);
        }
    };

    const handleForgotAccountPassword = async () => {
        if (!session?.user?.email || !supabase) return;
        const email = session.user.email;
        const storedCooldown = getStoredOtpCooldown(email, 'forgot_password');

        if (storedCooldown > 0) {
            setShowAccountPasswordOtpModal(true);
            setIsAccountPasswordOtpMode(true);
            setAccountPasswordOtpCooldownRemaining(storedCooldown);
            setPasswordChangeError(null);
            setPasswordChangeNotice(`M\u00e3 OTP \u0111\u00e3 \u0111\u01b0\u1ee3c g\u1eedi \u0111\u1ebfn ${email}. B\u1ea1n c\u00f3 th\u1ec3 g\u1eedi l\u1ea1i sau ${formatOtpCooldown(storedCooldown)}.`);
            return;
        }

        if (!accountPasswordTurnstileToken) {
            setPasswordChangeError('Vui lòng xác minh bạn không phải robot.');
            setPasswordChangeNotice(null);
            return;
        }

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: apiHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'send-otp',
                    purpose: 'forgot_password',
                    email,
                    turnstileToken: accountPasswordTurnstileToken,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 429 && payload.retryAfterSeconds) {
                    const retryAfterSeconds = Number(payload.retryAfterSeconds);
                    storeOtpCooldown(email, 'forgot_password', retryAfterSeconds);
                    setAccountPasswordOtpCooldownRemaining(retryAfterSeconds);
                    setShowAccountPasswordOtpModal(true);
                    setIsAccountPasswordOtpMode(true);
                    setPasswordChangeNotice(`M\u00e3 OTP \u0111\u00e3 \u0111\u01b0\u1ee3c g\u1eedi \u0111\u1ebfn ${email}. B\u1ea1n c\u00f3 th\u1ec3 g\u1eedi l\u1ea1i sau ${formatOtpCooldown(retryAfterSeconds)}.`);
                    return;
                }
                throw new Error(payload.error || 'Kh\u00f4ng th\u1ec3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u.');
            }

            const cooldownSeconds = Number(payload.retryAfterSeconds || payload.expiresInSeconds || OTP_RESEND_COOLDOWN_SECONDS);
            storeOtpCooldown(email, 'forgot_password', cooldownSeconds);
            setAccountPasswordOtpCooldownRemaining(cooldownSeconds);
            setShowAccountPasswordOtpModal(true);
            setIsAccountPasswordOtpMode(true);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setPasswordChangeNotice(`\u0110\u00e3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u \u0111\u1ebfn ${email}.`);
        } catch (error: any) {
            setPasswordChangeError(error.message || 'Kh\u00f4ng th\u1ec3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u.');
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: {
                    purpose: 'forgot_password',
                    email,
                },
            });
            setAccountPasswordTurnstileToken('');
        } finally {
            setPasswordChangeLoading(false);
        }
    };

    const displayName = useMemo(() => {
        if (profileFullName.trim()) return profileFullName.trim();
        return session?.user?.email ?? 'HUB User';
    }, [profileFullName, session?.user?.email]);

    const avatarSeed = useMemo(() => {
        if (displayName.trim()) return displayName.trim()[0].toUpperCase();
        return 'H';
    }, [displayName]);

    const studentId = session?.user?.email?.split('@')[0] ?? '';

    const addSemester = () => {
        playClick();
        commitDataUpdate(prev => {
            const newSem: Semester = {
                id: Date.now().toString(),
                name: getNextTranscriptSemesterName(prev.semesters),
                subjects: [],
                trainingScore: null
            };
            return { ...prev, semesters: [...prev.semesters, newSem] };
        });
    };

    const updateSemester = (index: number, updatedSem: Semester) => {
        commitDataUpdate(prev => {
            const newSemesters = [...prev.semesters];
            if (index < 0 || index >= newSemesters.length) return prev;
            newSemesters[index] = updatedSem;
            return { ...prev, semesters: newSemesters };
        });
    };

    const removeSemester = (index: number) => {
        playClick();
        if (window.confirm("Bạn có chắc muốn xóa học kỳ này không?")) {
            commitDataUpdate(prev => ({
                ...prev,
                semesters: prev.semesters.filter((_, i) => i !== index)
            }));
        }
    };

    const handleExportPDF = async () => {
        playClick();
        const { exportTranscriptToPdf } = await import('./utils/pdfExport');
        await exportTranscriptToPdf(data);
    };

    const handleFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
        onImportedSemesters?: (semesters: Semester[]) => void,
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setShowImportGuide(false);
        setIsImporting(true);
        setShowImportLoadingToast(true);

        try {
            await verifyTurnstileOnly(gradeImportTurnstileToken);
            setGradeImportTurnstileToken('');
            const { parseHubPdf } = await import('./utils/pdfImport');
            const result = await parseHubPdf(file);
            const importedSubjectCount = result.semesters.reduce((total, semester) => total + semester.subjects.length, 0);
            if (importedSubjectCount === 0) {
                try {
                    localStorage.setItem('hub_last_transcript_import_debug', JSON.stringify({
                        at: new Date().toISOString(),
                        stage: 'app-zero-subjects',
                        error: result.error || null,
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                        debug: result.debug || null
                    }));
                } catch {
                    // ignore storage errors
                }
                const errorLogId = await logWebError({
                    source: 'parser',
                    action: 'import_transcript',
                    error: result.error || 'Transcript parser returned zero subjects',
                    metadata: {
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                    },
                    level: 'warn',
                });
                if (result.error) {
                    await promptSendParserDebugFile({
                        kind: 'transcript',
                        file,
                        errorLogId,
                        parserMessage: result.error,
                        metadata: {
                            semesterCount: result.semesters.length,
                            yearRangeCount: result.yearRanges.length,
                        },
                    });
                    return;
                }
                await promptSendParserDebugFile({
                    kind: 'transcript',
                    file,
                    errorLogId,
                    parserMessage: 'Transcript parser returned zero subjects',
                    metadata: {
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                    },
                });
                return;
            }

            const startYear = result.yearRanges.length > 0
                ? Math.min(...result.yearRanges.map(y => y.start))
                : new Date().getFullYear();
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

            setPendingTranscriptImport({
                semesters: reconstructSemesters,
                importedSubjectCount,
                onImportedSemesters,
            });
        } catch (error) {
            console.error(error);
            if (error instanceof ProtectedSubmitError) {
                alert(error.message);
                return;
            }
            const errorLogId = await logWebError({
                source: 'parser',
                action: 'import_transcript',
                error,
                metadata: {
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                },
            });
            const message = error instanceof Error ? error.message : '';
            await promptSendParserDebugFile({
                kind: 'transcript',
                file,
                errorLogId,
                parserMessage: message || 'Lỗi khi đọc file PDF.',
            });
        } finally {
            setIsImporting(false);
            setShowImportLoadingToast(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleConfirmTranscriptImport = async () => {
        if (!pendingTranscriptImport) return;
        const subjectCount = pendingTranscriptImport.semesters.reduce(
            (total, semester) => total + semester.subjects.length,
            0,
        );
        if (subjectCount === 0) {
            await showAlert('Danh sách xem trước đang trống. Vui lòng giữ lại ít nhất một môn học.');
            return;
        }

        setIsConfirmingTranscriptImport(true);
        try {
            if (pendingTranscriptImport.onImportedSemesters) {
                pendingTranscriptImport.onImportedSemesters(pendingTranscriptImport.semesters);
            } else {
                commitDataUpdate(prev => ({
                    ...prev,
                    semesters: pendingTranscriptImport.semesters,
                }));
            }
            setPendingTranscriptImport(null);
            await showAlert(
                `Đã đưa ${subjectCount} môn vào bảng điểm. Dữ liệu cũ đã được thay thế.\n\n`
                + 'Khuyến khích bạn rà soát lại các học kỳ, tên môn, số tín chỉ và điểm số. '
                + 'Nếu đang ở chế độ chỉnh sửa, chỉ bấm "Lưu bảng điểm" khi mọi thông tin đã chính xác.',
            );
        } finally {
            setIsConfirmingTranscriptImport(false);
        }
    };

    const renderProtectedApp = () => {
        const isPrivilegedUser = isAdmin || isAuditor || isCTV;
        const requiresPasswordSetup = Boolean(session?.user && !isPrivilegedUser && passwordSetAt === null);
        const requiresRequiredProfileSetup = Boolean(session?.user && !isPrivilegedUser && !hasCompleteRequiredStudyProfile(data));

        if (!isLoaded) return <RouteLoadingFallback />;

        if (isAccessDenied && !isAdmin && !isAuditor && !isCTV) {
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
                                setActivePushNotificationUser(null);
                                await unbindDeviceNotificationsForCurrentUser(session?.user?.id).catch(() => undefined);
                                await supabase?.auth.signOut();
                                setIsAccessDenied(false);
                                navigate('/login', { replace: true });
                            }}
                            className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                            <LogOut size={18} /> Đăng xuất & Thử lại
                        </button>
                    </div>
                </div>
            )
        }

        if (session && requiresRequiredProfileSetup) {
            return <Navigate to="/onboarding" replace />;
        }

        // ✨ FIX LỖI TS 2: Ép kiểu component MobileProfile để tránh bị TS soi lỗi thiếu props
        const MobileProfileComponent = MobileProfile as any;

        const desktopRoutes = (
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={
                    <div className="animate-fadeIn">
                        <Dashboard
                            data={data}
                            onSetSemesters={(sems) => commitDataUpdate(prev => ({ ...prev, semesters: sems }))}
                            onSaveSemesters={saveSemestersNow}
                            isGuest={isGuest}
                            currentUserId={session?.user?.id || null}
                            onRequireOnboarding={() => navigate('/onboarding')}
                            onTargetChange={(newTarget) => commitDataUpdate(prev => ({ ...prev, targetGPA: newTarget }))}
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
                <Route path="/schedule/:studentCode" element={<ScheduleBoard viewUserId={viewingUser?.id} />} />
                <Route path="/events" element={<EventsBoard viewUserId={viewingUser?.id} />} />
                <Route path="/events/edit/:eventId" element={<EventsBoard viewUserId={viewingUser?.id} />} />
                <Route path="/events/:eventId" element={<EventsBoard viewUserId={viewingUser?.id} />} />
                <Route path="/lost-found" element={<LostFoundBoard />} />
                <Route path="/support" element={<SupportTickets />} />
                <Route path="/support/new" element={<SupportTickets />} />
                <Route path="/support/:ticketId" element={<SupportTickets />} />
                <Route path="/handbook/:tab?" element={<Handbook />} />

                <Route path="/profile/:id" element={<ProfilePage refreshKey={profileRefreshKey} onEditProfile={() => setShowAccountSettings(true)} />} />
                <Route path="/profiles/search" element={<ProfileSearchPage />} />

                <Route path="/admin-reports" element={(isAdmin || isAuditor) ? <AdminReports /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/support" element={(isAdmin || isAuditor) ? <AdminSupportTickets /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/support/:ticketId" element={(isAdmin || isAuditor) ? <AdminSupportTickets /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/activity" element={isAdmin ? <ActivityLogModal /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/event-candidates" element={(isAdmin || isAuditor) ? <AdminEventCandidates /> : <Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        );

        const mobileRoutes = (
            <Routes>
                <Route path="/" element={<Navigate to="/mobile-home" replace />} />
                <Route path="/mobile-home" element={<MobileHome data={data} displayName={displayName} avatarUrl={profileAvatarUrl} avatarSeed={avatarSeed} isGuest={isGuest} showSecurityNotice={!session} onRequireOnboarding={() => navigate('/onboarding')} />} />
                <Route path="/learning" element={<MobileLearning data={data} onSetSemesters={(sems) => commitDataUpdate(prev => ({ ...prev, semesters: sems }))} onSaveSemesters={saveSemestersNow} isGuest={isGuest} onRequireOnboarding={() => navigate('/onboarding')} onTargetChange={(newTarget) => commitDataUpdate(prev => ({ ...prev, targetGPA: newTarget }))} showSecurityNotice={!session} onUpdateSemester={updateSemester} onRemoveSemester={removeSemester} onAddSemester={addSemester} onExportPDF={handleExportPDF} onImportPDF={() => { playClick(); setShowImportGuide(true); }} isImporting={isImporting} fileInputRef={fileInputRef} onFileUpload={handleFileUpload} viewUserId={viewingUser?.id} isManagementUser={isAdmin || isAuditor} />} />
                <Route path="/events" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/events/edit/:eventId" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/events/:eventId" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/lost-found" element={<MobileLostFound />} />
                <Route path="/support" element={<SupportTickets />} />
                <Route path="/support/new" element={<SupportTickets />} />
                <Route path="/support/:ticketId" element={<SupportTickets />} />
                <Route path="/handbook/:tab?" element={<MobileHandbook />} />
                <Route path="/handbook" element={<MobileHandbook />} />
                <Route path="/terms" element={<MobileHandbook forcedTab="terms" />} />
                <Route path="/privacy" element={<MobileHandbook forcedTab="privacy" />} />
                <Route path="/admin-reports" element={(isAdmin || isAuditor) ? <AdminReports /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/support" element={(isAdmin || isAuditor) ? <AdminSupportTickets /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/support/:ticketId" element={(isAdmin || isAuditor) ? <AdminSupportTickets /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/activity" element={isAdmin ? <ActivityLogModal /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/event-candidates" element={(isAdmin || isAuditor) ? <AdminEventCandidates /> : <Navigate to="/mobile-home" replace />} />

                <Route path="/profile/:id" element={
                    <MobileProfileComponent
                        setShowAccountSettings={setShowAccountSettings}
                        handleRequestReset={handleRequestReset}
                        onInstallApp={handleInstallApp}
                        showInstallButton={!isAppMode}
                    />
                } />
                <Route path="/profiles/search" element={<ProfileSearchPage />} />

                <Route path="/dashboard" element={<Navigate to="/mobile-home" replace />} />
                <Route path="*" element={<Navigate to="/mobile-home" replace />} />
            </Routes>
        );

        const commonModals = (
            <>
                {!isExamStudyRoute && !useMobileLayout && !isMobileScreen && (
    <div className="desktop-ai-hint fixed bottom-[86px] right-6 z-50 flex flex-col items-end pointer-events-none">
                        <div
                            className={`relative w-44 bg-white/95 text-gray-700 text-xs font-bold p-2.5 rounded-xl shadow-lg border border-blue-100 transition-all duration-500 ease-in-out transform origin-bottom-right ${
                                showBubble ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4'
                            }`}
                        >
                            <p>Trợ lý AI sẵn sàng hỗ trợ học tập.</p>
                            <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-white transform rotate-45 border-b border-r border-blue-100"></div>
                        </div>
                    </div>
                )}

                {!isExamStudyRoute && (isMobileScreen ? (
    <MobileAIAdvisor data={data} userId={session?.user?.id} />
) : (
    <AIAdvisor data={data} userId={session?.user?.id} />
))}

                {showImportLoadingToast && (
                    <div className="fixed bottom-6 right-6 bg-white shadow-xl p-4 rounded-xl border border-gray-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-xs">
                        <Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" />
                        <p className="text-sm font-medium text-gray-700 leading-snug">
                            Đang xử lý PDF của bạn, vui lòng đợi giây lát...
                        </p>
                    </div>
                )}

                {pendingTranscriptImport && (
                    <TranscriptImportPreviewModal
                        semesters={pendingTranscriptImport.semesters}
                        isSaving={isConfirmingTranscriptImport}
                        onChange={semesters => setPendingTranscriptImport(current => (
                            current ? { ...current, semesters } : current
                        ))}
                        onCancel={() => setPendingTranscriptImport(null)}
                        onConfirm={handleConfirmTranscriptImport}
                    />
                )}

                {showImportGuide && (
                    <ImportGuideModal
                        onClose={() => setShowImportGuide(false)}
                        securitySlot={<TurnstileBox token={gradeImportTurnstileToken} onTokenChange={setGradeImportTurnstileToken} />}
                        canSelectFile={Boolean(gradeImportTurnstileToken)}
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

                {/* MODAL XÁC NHẬN OTP ĐỂ XÓA TÀI KHOẢN */}
                {showResetModal && (
                    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fadeIn">
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
                                        <button onClick={() => { playClick(); setResetStep(2); setDeleteTurnstileToken(''); }} className="w-full py-3 bg-transparent text-gray-500 font-bold rounded-xl hover:bg-gray-50 hover:text-red-600 transition-all text-sm">
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
                                        <h3 className="text-xl font-bold text-red-700">Cảnh báo xóa tài khoản</h3>
                                        <p className="text-sm text-red-600/80 font-medium mt-1">Tài khoản và toàn bộ dữ liệu sẽ bị xóa vĩnh viễn.</p>
                                    </div>

                                    <div className="p-6">
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-600 text-center leading-relaxed">
                                                Để đảm bảo an toàn, chúng tôi sẽ gửi một mã xác nhận đến email:
                                            </p>
                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center font-bold text-[#003375]">
                                                {session?.user.email}
                                            </div>

                                            <div className="mt-4 flex flex-col gap-2">
                                                <label className="text-sm font-bold text-gray-700 text-center">
                                                    Xac minh bao mat
                                                </label>
                                                <TurnstileBox token={deleteTurnstileToken} onTokenChange={setDeleteTurnstileToken} />
                                            </div>

                                            {otpError && <p className="text-xs text-red-500 text-center font-bold">{otpError}</p>}

                                            <div className="flex flex-col gap-2 mt-4">
                                                <button onClick={handleVerifyTurnstileAndSendOtp} disabled={isSendingOtp || !deleteTurnstileToken} className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-md">
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
                                            Xác nhận xóa tài khoản
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
                                                    setDeleteTurnstileToken('');
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

                <AccountSettingsModal
                    open={showAccountSettings}
                    mobile={useMobileLayout || isMobileScreen}
                    error={profileError}
                    saving={profileSaving}
                    canSave={Boolean(draftProgram && draftCohort && draftMajor && draftSpecialization)}
                    onClose={() => setShowAccountSettings(false)}
                    onSave={saveProfile}
                >
                                <AccountPublicProfileFields
                                    fullName={draftFullName}
                                    bio={draftBio}
                                    className={draftClassName}
                                    defaultClassName={defaultClassName}
                                    profileTags={draftProfileTags}
                                    publicProfileEnabled={draftPublicProfileEnabled}
                                    showProfileStats={draftShowProfileStats}
                                    avatarUrl={draftAvatarUrl}
                                    avatarPreview={draftAvatarPreview}
                                    avatarSeed={avatarSeed}
                                    onFullNameChange={setDraftFullName}
                                    onBioChange={setDraftBio}
                                    onClassNameChange={setDraftClassName}
                                    onProfileTagsChange={setDraftProfileTags}
                                    onPublicProfileEnabledChange={(enabled) => {
                                        setDraftPublicProfileEnabled(enabled);
                                        if (!enabled) setDraftShowProfileStats(false);
                                    }}
                                    onShowProfileStatsChange={setDraftShowProfileStats}
                                    onAvatarColorChange={(color) => {
                                        setDraftAvatarUrl(color);
                                        setDraftAvatarFile(null);
                                        if (draftAvatarPreview) {
                                            URL.revokeObjectURL(draftAvatarPreview);
                                            setDraftAvatarPreview('');
                                        }
                                    }}
                                    onAvatarFileSelect={(file) => {
                                        if (draftAvatarPreview) URL.revokeObjectURL(draftAvatarPreview);
                                        setDraftAvatarFile(file);
                                        setDraftAvatarUrl('');
                                        setDraftAvatarPreview(URL.createObjectURL(file));
                                    }}
                                    onInvalidAvatarFile={() => {
                                        setProfileError('Vui lòng chọn đúng file ảnh.');
                                    }}
                                />

                                <AccountPasswordPanel
                                    error={passwordChangeError}
                                    notice={passwordChangeNotice}
                                    turnstileToken={accountPasswordTurnstileToken}
                                    showPasswordChange={showPasswordChange}
                                    otpMode={isAccountPasswordOtpMode}
                                    cooldownRemaining={accountPasswordOtpCooldownRemaining}
                                    loading={passwordChangeLoading}
                                    currentPassword={currentPassword}
                                    otp={accountPasswordOtp}
                                    newPassword={newPassword}
                                    confirmNewPassword={confirmNewPassword}
                                    showCurrentPassword={showCurrentPassword}
                                    showNewPassword={showNewPassword}
                                    onTurnstileTokenChange={setAccountPasswordTurnstileToken}
                                    onForgotPassword={handleForgotAccountPassword}
                                    onStartPasswordChange={() => {
                                        playClick();
                                        setShowPasswordChange(true);
                                        setIsAccountPasswordOtpMode(false);
                                        setAccountPasswordOtp('');
                                        setPasswordChangeError(null);
                                        setPasswordChangeNotice(null);
                                    }}
                                    onCurrentPasswordChange={setCurrentPassword}
                                    onOtpChange={setAccountPasswordOtp}
                                    onNewPasswordChange={setNewPassword}
                                    onConfirmNewPasswordChange={setConfirmNewPassword}
                                    onToggleCurrentPasswordVisibility={() => setShowCurrentPassword(previous => !previous)}
                                    onToggleNewPasswordVisibility={() => setShowNewPassword(previous => !previous)}
                                    onCancelPasswordChange={() => {
                                        setShowPasswordChange(false);
                                        setCurrentPassword('');
                                        setAccountPasswordOtp('');
                                        setNewPassword('');
                                        setConfirmNewPassword('');
                                        setIsAccountPasswordOtpMode(false);
                                        setAccountPasswordTurnstileToken('');
                                        setPasswordChangeError(null);
                                        setPasswordChangeNotice(null);
                                    }}
                                    onSubmit={handleChangeAccountPassword}
                                />

                                <AccountAcademicProfileFields
                                    studentName={draftStudentName}
                                    selectedProgram={draftProgram}
                                    selectedCohort={draftCohort}
                                    selectedMajor={draftMajor}
                                    selectedSpecialization={draftSpecialization}
                                    programs={ACADEMIC_PROGRAMS}
                                    cohortOptions={draftProgram ? COHORT_OPTIONS[draftProgram.id] || [] : []}
                                    majorOptions={draftProgram && draftCohort ? getMajors(draftProgram.id, draftCohort) : []}
                                    onStudentNameChange={setDraftStudentName}
                                    onProgramChange={(programId) => {
                                        const program = ACADEMIC_PROGRAMS.find(item => item.id === programId) || null;
                                        setDraftProgram(program);
                                        setDraftCohort('');
                                        setDraftMajor(null);
                                        setDraftSpecialization(null);
                                    }}
                                    onCohortChange={(cohort) => {
                                        setDraftCohort(cohort);
                                        setDraftMajor(null);
                                        setDraftSpecialization(null);
                                    }}
                                    onMajorChange={(majorCode) => {
                                        const majors = draftProgram && draftCohort
                                            ? getMajors(draftProgram.id, draftCohort)
                                            : [];
                                        const major = majors.find(item => item.code === majorCode) || null;
                                        setDraftMajor(major);
                                        setDraftSpecialization(
                                            major?.specializations.length === 1
                                                ? major.specializations[0]
                                                : null,
                                        );
                                    }}
                                    onSpecializationChange={(specializationName) => {
                                        setDraftSpecialization(
                                            draftMajor?.specializations.find(
                                                item => item.name === specializationName,
                                            ) || null,
                                        );
                                    }}
                                />
                </AccountSettingsModal>

                <AccountPasswordOtpModal
                    open={showAccountSettings && showAccountPasswordOtpModal}
                    email={session?.user?.email}
                    error={passwordChangeError}
                    notice={passwordChangeNotice}
                    otp={accountPasswordOtp}
                    newPassword={newPassword}
                    confirmNewPassword={confirmNewPassword}
                    showNewPassword={showNewPassword}
                    cooldownRemaining={accountPasswordOtpCooldownRemaining}
                    loading={passwordChangeLoading}
                    onClose={() => setShowAccountPasswordOtpModal(false)}
                    onResendOtp={handleForgotAccountPassword}
                    onOtpChange={setAccountPasswordOtp}
                    onNewPasswordChange={setNewPassword}
                    onConfirmNewPasswordChange={setConfirmNewPassword}
                    onToggleNewPasswordVisibility={() => setShowNewPassword(previous => !previous)}
                    onSubmit={handleChangeAccountPassword}
                />

                {showIOSInstructions && (
                    <div className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center sm:items-center p-4 animate-fadeIn" onClick={() => setShowIOSInstructions(false)}>
                        <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative animate-slideUp sm:animate-scaleIn shadow-2xl" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setShowIOSInstructions(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
                                <X size={20} />
                            </button>

                            <div className="w-16 h-16 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-4">
                                <Download size={32} />
                            </div>

                            <h3 className="text-xl font-black text-center text-[#003375] mb-2">Cài đặt HUB Planner</h3>
                            <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                                Trình duyệt của Apple không cho phép cài đặt tự động. Bạn vui lòng làm theo 2 bước cực nhanh sau:
                            </p>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-blue-500">
                                        <Share size={20} />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700">
                                        <strong>Bước 1:</strong> Nhấn vào biểu tượng <span className="text-blue-500 font-bold">Chia sẻ (Share)</span> ở thanh công cụ trình duyệt.
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-gray-800">
                                        <PlusSquare size={20} />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700">
                                        <strong>Bước 2:</strong> Cuộn xuống và chọn <span className="font-bold text-gray-900">Thêm vào MH chính</span>.
                                    </p>
                                </div>
                            </div>

                            <button onClick={() => setShowIOSInstructions(false)} className="w-full bg-[#003375] text-white font-bold py-4 rounded-2xl mt-6 active:scale-95 transition-transform shadow-md">
                                Đã hiểu
                            </button>
                        </div>
                    </div>
                )}
            </>
        );

        // ==========================================
        // RENDER CHÍNH CỦA APP
        // ==========================================
        // ✨ FIX LỖI TS 3: Ép kiểu any cho LayoutComponent để TS không soi prop thừa
        const LayoutComponent = (useMobileLayout ? MobileAppLayout : DesktopLayout) as any;
        const currentRoutes = useMobileLayout ? mobileRoutes : desktopRoutes;

       return (
    <div
        className={
            isMobileBrowser
    ? "app-shell mobile-browser-shell min-h-[100lvh] bg-[#F8FAFC] font-sans text-gray-800 relative overflow-x-hidden overflow-y-visible"
    : "app-shell h-[100dvh] bg-[#F8FAFC] font-sans text-gray-800 flex flex-col relative overflow-hidden"
        }
    >
        <Particles id="app-particles" init={particlesInit} options={particlesOptions} className="absolute inset-0 z-0 pointer-events-none" />

                <LayoutComponent
                    // ✨ TRUYỀN HÀM XỬ LÝ CÀI ĐẶT APP XUỐNG CHO GIAO DIỆN
                    onInstallApp={handleInstallApp}
                    showInstallButton={!isAppMode}

                    session={session} isGuest={isGuest} isAdmin={isAdmin} isAuditor={isAuditor} viewingUser={viewingUser}
                    displayName={displayName} studentId={studentId} avatarUrl={profileAvatarUrl} avatarSeed={avatarSeed}
                    adminSearchMssv={adminSearchMssv} isSearchingUser={isSearchingUser} setAdminSearchMssv={setAdminSearchMssv}
                    handleAdminSearchUser={handleAdminSearchUser} handleRequestReset={handleRequestReset} handleLogout={handleLogout}
                    setShowGuide={setShowGuide} setShowActivityLog={setShowActivityLog} setIsUserMenuOpen={setIsUserMenuOpen}
                    isUserMenuOpen={isUserMenuOpen} setShowAccountSettings={setShowAccountSettings} handleMenuLogout={handleMenuLogout} navigate={navigate}
                    isMobileBrowser={isMobileBrowser}
                >
                    {currentRoutes}
                </LayoutComponent>

                {commonModals}
                <FloatingSupportTab
                    currentUserId={session?.user?.id || null}
                    isGuest={isGuest}
                    isAdmin={isAdmin}
                    isAuditor={isAuditor}
                    isMobileLayout={useMobileLayout || isMobileScreen}
                />
                {passwordSetupSchemaMissing && !isPrivilegedUser && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4">
                        <div className="w-full max-w-md rounded-[24px] border border-amber-200 bg-white p-6 shadow-2xl sm:p-8">
                            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                                <AlertTriangle size={28} />
                            </div>
                            <h2 className="text-2xl font-black tracking-normal text-slate-950">Cần cập nhật Database</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Hệ thống cần cột <strong className="font-black text-slate-900">profiles.password_set_at</strong> để nhận biết tài khoản nào chưa có mật khẩu riêng và bắt buộc cập nhật mật khẩu. Vui lòng chạy migration <strong className="font-black text-slate-900">20260501090000_add_password_setup_tracking.sql</strong> trước khi cho sinh viên dùng tiếp.
                            </p>
                        </div>
                    </div>
                )}
                {requiresPasswordSetup && (
                    <PasswordSetupModal
                        email={session?.user?.email}
                        onComplete={() => setPasswordSetAt(new Date().toISOString())}
                    />
                )}
            </div>
        );
    };

    return (
        <AuthGate loading={loadingRole}>
            <RouteErrorBoundary resetKey={location.pathname}>
                <React.Suspense fallback={<RouteLoadingFallback />}>
                    <AppRoutes
                        data={data}
                        isLoaded={isLoaded}
                        mobileLayout={useMobileLayout}
                        mobileScreen={isMobileScreen}
                        canSkipOnboarding={Boolean(
                            session?.user
                            && (
                                isAdmin
                                || isAuditor
                                || isCTV
                                || hasCompleteRequiredStudyProfile(data)
                            )
                        )}
                        onCompleteOnboarding={(onboardingData) => {
                            void completeOnboarding(onboardingData);
                            navigate(useMobileLayout ? '/mobile-home' : '/dashboard', { replace: true });
                        }}
                        protectedApp={renderProtectedApp()}
                    />
                </React.Suspense>
            </RouteErrorBoundary>
        </AuthGate>
    );
};

export default App;
