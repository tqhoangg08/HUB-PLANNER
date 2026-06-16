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
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, AlertTriangle, Zap, Download, Search, HelpCircle, LogOut, Shield, Clock, Facebook, Phone, Mail, Calendar, ChevronDown, Users, Award, MessageSquarePlus, Heart, Info, User, ShieldAlert, ChevronLeft, ArrowUp, ArrowDown, ListFilter, Trash2, Crown, BarChart2, TrendingUp, HeartCrack, ArrowLeft, RefreshCw, ClipboardList, Share, PlusSquare, Lock, Eye, EyeOff } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';
import { useUserRole } from './hooks/useUserRole';
import { supabase } from './utils/supabase';
import { Link, Navigate, Route, Routes, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { ImportGuideModal } from './components/ImportGuideModal';
import { UserGuideModal } from './components/UserGuideModal';
import ProfilePage from './pages/ProfilePage';
import ProfileSearchPage from './pages/ProfileSearchPage';
import NotificationBell from './components/NotificationBell';
import ScheduleBoard from './components/ScheduleBoard';
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";
import { AdminReports } from './components/AdminReports';
import { AdminEventCandidates } from './components/AdminEventCandidates';
import { AIAdvisor } from './components/AIAdvisor';
import { MobileAIAdvisor } from './components/MobileAIAdvisor';
import { ACADEMIC_PROGRAMS, Program, Major, Specialization, getMajors } from './utils/programs';
import { DesktopLayout } from './layouts/DesktopLayout';
import { MobileAppLayout } from './layouts/MobileAppLayout';
import { MobileHome } from './components/MobileHome';
import { MobileLearning } from './components/MobileLearning';
import { MobileEvents } from './components/MobileEvents';
import { MobileLostFound } from './components/MobileLostFound';
import { MobileProfile } from './components/MobileProfile';
import { PasswordSetupModal } from './components/PasswordSetupModal';
import { DataIncidentNoticeModal } from './components/DataIncidentNoticeModal';
import { MobileHandbook } from './components/MobileHandbook';
import { showAlert, showConfirm } from './utils/appNotifications';
import { clearLocalStoragePreservingDevicePreferences } from './utils/devicePreferences';
import {
    isPushSupported,
    setActivePushNotificationUser,
    subscribeToDeviceNotifications,
    unbindDeviceNotificationsForCurrentUser,
} from './utils/pushNotifications';
import { fetchProfilePrivate, updateProfilePrivate, upsertProfilePrivate } from './utils/profilePrivate';
import { apiUrl } from './utils/api';
import { calculateCumulativeStats } from './utils/calculations';
import { logActivity, logActivityQuietly } from './utils/activityLogger';
import { AVATAR_COLOR_OPTIONS, getAvatarColorClass, getSafeAvatarColor, isAvatarImageUrl } from './utils/avatarColors';
import { recordPolicyConsent } from './utils/policyConsent';
import { TurnstileBox } from './components/TurnstileBox';
import { verifyTurnstileOnly } from './utils/protectedSubmit';

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

const fetchLegacyProfileData = async (userId: string) => {
    const { data, error } = await supabase
        .from(STUDENT_PROFILE_TABLE)
        .select('data')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        if (!isMissingLegacyProfileColumn(error, 'data')) console.warn('Không thể đọc profiles.data legacy:', error);
        return null;
    }

    return (data as any)?.data || null;
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

const resizeAvatarImage = (file: File) => new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) {
            reject(new Error('Không thể xử lý ảnh avatar.'));
            return;
        }

        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
        const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Không thể nén ảnh avatar.'));
                return;
            }
            resolve(blob);
        }, 'image/webp', 0.78);
    };

    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('File ảnh không hợp lệ.'));
    };

    image.src = objectUrl;
});

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Không thể đọc ảnh avatar.'));
    reader.readAsDataURL(blob);
});

const COHORT_OPTIONS: Record<string, string[]> = {
    'standard': ['K38', 'K39', 'K40', 'K41'],
    'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
    'special': ['CTDBK1', 'CTDBK2']
};

const DEFAULT_TRANSCRIPT_SEMESTER_NAME = 'Học kỳ 1 Năm học 2025-2026';
const isValidTranscriptSemesterName = (name?: string) => /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test((name || '').trim());
const parseTranscriptSemesterName = (name?: string) => {
    const match = (name || '').trim().match(/^Học kỳ (1|2) Năm học (\d{4})-\d{4}$/);
    if (!match) return null;
    return { term: Number(match[1]), year: Number(match[2]) };
};
const getFollowingTranscriptSemesterName = ({ term, year }: { term: number; year: number }) => {
    const nextTerm = term === 1 ? 2 : 1;
    const nextYear = term === 1 ? year : year + 1;
    return `Học kỳ ${nextTerm} Năm học ${nextYear}-${nextYear + 1}`;
};
const getNextTranscriptSemesterName = (semesters: Semester[]) => {
    const selectedSemesters = semesters
        .map(semester => parseTranscriptSemesterName(semester.name))
        .filter((semester): semester is { term: number; year: number } => Boolean(semester));

    if (selectedSemesters.length === 0) {
        return DEFAULT_TRANSCRIPT_SEMESTER_NAME;
    }

    const latestSemester = selectedSemesters.reduce((latest, current) => {
        const latestWeight = latest.year * 2 + latest.term;
        const currentWeight = current.year * 2 + current.term;
        return currentWeight > latestWeight ? current : latest;
    });

    return getFollowingTranscriptSemesterName(latestSemester);
};

const createInitialSemester = (): Semester => ({
    id: 'y1_hk1',
    name: DEFAULT_TRANSCRIPT_SEMESTER_NAME,
    subjects: [],
    trainingScore: null
});

const INITIAL_DATA: UserData = {
    studentName: '',
    cohort: '',
    programName: '',
    majorName: '',
    specializationName: '',
    totalCreditsRequired: 125,
    hasOnboarded: false,
    semesters: [createInitialSemester()],
    targetGPA: 3.2,
};

const REMOTE_SAVE_DEBOUNCE_MS = 8000;
const hasMeaningfulStudyData = (value?: Partial<UserData> | null): boolean => {
    if (!value) return false;
    return Boolean(
        value.studentName?.trim() ||
        value.cohort?.trim() ||
        value.programName?.trim() ||
        value.majorName?.trim() ||
        value.specializationName?.trim() ||
        value.semesters?.some(semester =>
            semester.subjects?.length > 0 ||
            semester.trainingScore !== null ||
            Boolean(semester.name?.trim() && semester.name.trim() !== DEFAULT_TRANSCRIPT_SEMESTER_NAME)
        )
    );
};

const hasCompleteRequiredStudyProfile = (value?: Partial<UserData> | null): boolean => {
    if (!value) return false;
    return Boolean(
        value.studentName?.trim() &&
        value.programName?.trim() &&
        value.cohort?.trim() &&
        value.majorName?.trim() &&
        value.specializationName?.trim()
    );
};

const normalizeSemesterName = (name?: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    if (/^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(trimmed)) return trimmed;

    const compactMatch = trimmed.match(/^Học kỳ\s+(1|2|3|Hè)\s+(\d{4})-(\d{4})$/i);
    if (compactMatch) {
        return `Học kỳ ${compactMatch[1]} Năm học ${compactMatch[2]}-${compactMatch[3]}`;
    }

    return trimmed;
};

const normalizeLoadedUserData = (value?: Partial<UserData> | null): UserData => {
    const loadedData = { ...INITIAL_DATA, ...(value || {}) };
    const usedSemesterNames = new Set<string>();
    loadedData.semesters = (loadedData.semesters || []).map((semester) => ({
        ...semester,
        name: normalizeSemesterName(semester.name),
        subjects: Array.isArray(semester.subjects) ? semester.subjects : [],
    })).reduce<Semester[]>((semesters, semester) => {
        const hasSemesterData = semester.subjects.length > 0 || semester.trainingScore !== null;
        const hasValidName = isValidTranscriptSemesterName(semester.name);

        if (!hasSemesterData && !hasValidName) return semesters;

        let nextSemester = semester;
        if (!hasValidName) {
            nextSemester = {
                ...semester,
                name: getNextTranscriptSemesterName(semesters),
            };
        }

        if (usedSemesterNames.has(nextSemester.name)) {
            nextSemester = {
                ...nextSemester,
                name: getNextTranscriptSemesterName(semesters),
            };
        }

        usedSemesterNames.add(nextSemester.name);
        semesters.push(nextSemester);
        return semesters;
    }, []);
    if (loadedData.semesters.length === 0) {
        loadedData.semesters = [createInitialSemester()];
    }
    const hasExistingStudyData = hasMeaningfulStudyData(loadedData);

    return {
        ...loadedData,
        hasOnboarded: loadedData.hasOnboarded || hasExistingStudyData,
    };
};

const isLocalPreviewHost = (hostname: string) => (
    ['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
);

const shouldForceMobileAppPreview = () => (
    isLocalPreviewHost(window.location.hostname) &&
    new URLSearchParams(window.location.search).get('appPreview') === '1'
);

const App: React.FC = () => {
    const { isAdmin, isAuditor, isCTV, session, loading: loadingRole } = useUserRole();
    console.log("Kiểm tra quyền hiện tại:", { isAdmin, isAuditor, isCTV });
    const navigate = useNavigate();
    const location = useLocation();
    const isExamStudyRoute = false;

    const isGuest = !session;
    const [forceGuestOnboarding, setForceGuestOnboarding] = useState(false);
    const [passwordSetAt, setPasswordSetAt] = useState<string | null | undefined>(undefined);
    const [passwordSetupSchemaMissing, setPasswordSetupSchemaMissing] = useState(false);

    // ==========================================
    // ✨ PWA MODE & RESPONSIVE DETECTOR
    // ==========================================
    const [isAppMode, setIsAppMode] = useState(false);
    const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 768);
    const [forceMobileAppPreview, setForceMobileAppPreview] = useState(() => shouldForceMobileAppPreview());
    const [isDataIncidentNoticeDone, setIsDataIncidentNoticeDone] = useState(false);
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
        const checkIfAppMode = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            const isIOSStandalone = (window.navigator as any).standalone === true;
            setIsAppMode(isStandalone || isIOSStandalone);
        };
        const handleResize = () => setIsMobileScreen(window.innerWidth < 768);

        checkIfAppMode();
        window.matchMedia('(display-mode: standalone)').addEventListener('change', checkIfAppMode);
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isLocalPreviewHost(window.location.hostname)) {
            localStorage.removeItem('hub_mobile_app_preview');
            setForceMobileAppPreview(false);
            return;
        }

        if (shouldForceMobileAppPreview()) {
            setForceMobileAppPreview(true);
        } else {
            localStorage.removeItem('hub_mobile_app_preview');
            setForceMobileAppPreview(false);
        }
    }, [location.search]);

    const useMobileLayout = (isAppMode && isMobileScreen) || forceMobileAppPreview;
    const isMobileBrowser = isMobileScreen && !isAppMode && !forceMobileAppPreview;

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
    const html = document.documentElement;
    const body = document.body;

    const isIOSDevice =
        /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
        ((window.navigator as any).platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    const applyClasses = () => {
        html.classList.toggle('mobile-browser', isMobileBrowser);
        body.classList.toggle('mobile-browser', isMobileBrowser);

        html.classList.toggle('mobile-standalone', (isAppMode && isMobileScreen) || forceMobileAppPreview);
        body.classList.toggle('mobile-standalone', (isAppMode && isMobileScreen) || forceMobileAppPreview);

        html.classList.toggle('platform-ios', isIOSDevice);
        body.classList.toggle('platform-ios', isIOSDevice);
    };

    const applyViewportVars = () => {
        const visualViewport = window.visualViewport;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportOffsetTop = visualViewport?.offsetTop ?? 0;

        const bottomGap = Math.max(
            0,
            window.innerHeight - viewportHeight - viewportOffsetTop
        );

        html.style.setProperty('--app-vh', `${viewportHeight * 0.01}px`);
        html.style.setProperty('--app-bottom-gap', `${bottomGap}px`);
    };

    applyClasses();
    applyViewportVars();

    window.addEventListener('resize', applyViewportVars);
    window.addEventListener('orientationchange', applyViewportVars);
    window.visualViewport?.addEventListener('resize', applyViewportVars);
    window.visualViewport?.addEventListener('scroll', applyViewportVars);

    return () => {
        window.removeEventListener('resize', applyViewportVars);
        window.removeEventListener('orientationchange', applyViewportVars);
        window.visualViewport?.removeEventListener('resize', applyViewportVars);
        window.visualViewport?.removeEventListener('scroll', applyViewportVars);

        html.classList.remove('mobile-browser', 'mobile-standalone', 'platform-ios');
        body.classList.remove('mobile-browser', 'mobile-standalone', 'platform-ios');

        html.style.removeProperty('--app-vh');
        html.style.removeProperty('--app-bottom-gap');
    };
}, [isMobileBrowser, isAppMode, isMobileScreen, forceMobileAppPreview]);

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

    const [data, setData] = useState<UserData>(INITIAL_DATA);
    const [adminSearchMssv, setAdminSearchMssv] = useState('');
    const [viewingUser, setViewingUser] = useState<{ id: string, mssv: string, name: string } | null>(null);
    const [isSearchingUser, setIsSearchingUser] = useState(false);
    const dataRef = useRef<UserData>(INITIAL_DATA);
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
    const [gradeImportTurnstileToken, setGradeImportTurnstileToken] = useState('');
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
    const [draftBio, setDraftBio] = useState('');
    const [draftClassName, setDraftClassName] = useState('');
    const [defaultClassName, setDefaultClassName] = useState('');
    const [draftProfileTags, setDraftProfileTags] = useState('');
    const [draftPublicProfileEnabled, setDraftPublicProfileEnabled] = useState(false);
    const [draftShowProfileStats, setDraftShowProfileStats] = useState(false);
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);
    const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
    const [draftAvatarPreview, setDraftAvatarPreview] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [showPasswordChange, setShowPasswordChange] = useState(false);
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

    const userRolePref: 'guest' | 'school' | 'admin' = session ? (isAdmin ? 'admin' : 'school') : 'guest';

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
            const targetId = ((isAdmin || isAuditor) && viewingUser) ? viewingUser.id : session.user.id;
            return `${STORAGE_KEY}:${targetId}`;
        }
        return STORAGE_KEY;
    }, [session?.user?.id, isGuest, isAdmin, viewingUser]);

    const saveTimeoutRef = useRef<number | null>(null);
    const lastPrivateSaveRef = useRef<{ ownerId: string | null; signature: string | null }>({
        ownerId: null,
        signature: null,
    });

    const getStorageDirtyKey = useCallback((key: string) => `${key}:dirty`, []);
    const commitDataUpdate = useCallback((updater: (previousData: UserData) => UserData) => {
        const nextData = updater(dataRef.current);
        dataRef.current = nextData;
        setData(nextData);
    }, []);

    const loadDataIntoState = useCallback((nextData: UserData) => {
        dataRef.current = nextData;
        setData(nextData);
    }, []);

    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useEffect(() => {
        if (!session?.user?.id) return;
        Object.keys(localStorage)
            .filter(key => key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:`))
            .forEach(key => localStorage.removeItem(key));
    }, [session?.user?.id]);

    const saveStudyDataToRemote = useCallback(async (dataToSave: UserData) => {
        if ((userRolePref !== 'school' && userRolePref !== 'admin') || !session?.user?.id || !supabase) return false;

        const targetUserId = ((isAdmin || isAuditor) && viewingUser) ? viewingUser.id : session.user.id;
        if (dataOwnerIdRef.current !== targetUserId) return false;
        if (!hasMeaningfulStudyData(dataToSave)) return false;

        const privateDataSignature = JSON.stringify(dataToSave);
        if (
            lastPrivateSaveRef.current.ownerId === targetUserId &&
            lastPrivateSaveRef.current.signature === privateDataSignature
        ) {
            localStorage.removeItem(getStorageDirtyKey(storageKey));
            return true;
        }

        if (isAdmin && viewingUser) {
            await updateProfilePrivate(targetUserId, {
                data: dataToSave,
                updated_at: new Date().toISOString()
            });

            const { error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .update({
                    updated_at: new Date().toISOString()
                })
                .eq('id', targetUserId);

            if (error) console.error("Lỗi Admin update data user:", error);
        } else if (!isAuditor) {
            const userEmail = session.user.email || '';
            const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
            const nameToSave = profileFullName || metaName;

            const { error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .update({
                    full_name: nameToSave,
                    avatar_url: profileAvatarUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', session.user.id);

            if (error) console.error("Lỗi update hồ sơ công khai:", error);

            await upsertProfilePrivate({
                user_id: session.user.id,
                email: userEmail,
                data: dataToSave,
                updated_at: new Date().toISOString(),
            });

            if (!error && !profileFullName && nameToSave) {
                setProfileFullName(nameToSave);
            }
        } else {
            return false;
        }

        lastPrivateSaveRef.current = { ownerId: targetUserId, signature: privateDataSignature };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
        return true;
    }, [getStorageDirtyKey, isAdmin, isAuditor, profileAvatarUrl, profileFullName, session?.user?.email, session?.user?.id, session?.user?.user_metadata, storageKey, userRolePref, viewingUser]);

    useEffect(() => {
        let isActive = true;
        setIsLoaded(false);
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        lastPrivateSaveRef.current = { ownerId: null, signature: null };

        const loadData = async () => {
            if ((userRolePref === 'school' || userRolePref === 'admin') && session?.user?.id && supabase) {

                if ((isAdmin || isAuditor) && viewingUser) {
                    let privateData: Record<string, any> | null | undefined = null;
                    try {
                        privateData = (await fetchProfilePrivate(viewingUser.id))?.data;
                    } catch (error) {
                        console.warn('Không thể đọc dữ liệu học tập private:', error);
                    }
                    const legacyData = privateData ? null : await fetchLegacyProfileData(viewingUser.id);

                    if (!isActive) return;

                    if (privateData || legacyData) {
                        const remoteData = normalizeLoadedUserData(privateData || legacyData);
                        loadDataIntoState(remoteData);
                        lastPrivateSaveRef.current = { ownerId: viewingUser.id, signature: JSON.stringify(remoteData) };
                    } else {
                        loadDataIntoState(INITIAL_DATA);
                    }

                    dataOwnerIdRef.current = viewingUser.id;
                    setIsLoaded(true);
                    return;
                }

                const { data: profileData } = await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .select('full_name, avatar_url, bio, class_name, profile_tags, show_profile_stats')
                    .eq('id', session.user.id)
                    .maybeSingle();
                let privateData: Record<string, any> | null | undefined = null;
                try {
                    privateData = (await fetchProfilePrivate(session.user.id))?.data;
                } catch (error) {
                    console.warn('Không thể đọc dữ liệu học tập private:', error);
                }
                const legacyData = privateData ? null : await fetchLegacyProfileData(session.user.id);

                if (!isActive) return;

                const remoteData = hasMeaningfulStudyData(privateData || legacyData)
                    ? normalizeLoadedUserData(privateData || legacyData)
                    : null;

                if (remoteData) {
                    loadDataIntoState(remoteData);
                    lastPrivateSaveRef.current = { ownerId: session.user.id, signature: JSON.stringify(remoteData) };
                    setProfileFullName(profileData?.full_name || '');
                    setProfileAvatarUrl(profileData?.avatar_url || '');
                    dataOwnerIdRef.current = session.user.id;
                    setIsLoaded(true);
                    return;
                }

                const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
                const metaAvatar = session.user.user_metadata.avatar_url || session.user.user_metadata.picture || '';
                setProfileFullName(metaName);
                setProfileAvatarUrl(metaAvatar);

                loadDataIntoState(INITIAL_DATA);
                dataOwnerIdRef.current = session.user.id;
                setIsLoaded(true);
                return;
            }

            if (userRolePref !== 'school' && userRolePref !== 'admin') {
                setProfileFullName('');
                setProfileAvatarUrl('');
            }
            loadDataIntoState(INITIAL_DATA);
            dataOwnerIdRef.current = 'guest';
            setIsLoaded(true);
        };

        loadData();
        return () => { isActive = false; };
    }, [storageKey, session?.user?.id, userRolePref, isAdmin, viewingUser, isGuest, loadDataIntoState]);

    useEffect(() => {
        if (!isLoaded) return;
        if ((userRolePref !== 'school' && userRolePref !== 'admin') || !session?.user?.id || !supabase) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            try {
                await saveStudyDataToRemote(data);
            } catch (privateError) {
                console.error("Lỗi lưu profile_private_data:", privateError);
            }
            return;

            const targetUserId = ((isAdmin || isAuditor) && viewingUser) ? viewingUser.id : session.user.id;

if (dataOwnerIdRef.current !== targetUserId) return;

const privateDataSignature = JSON.stringify(data);
if (!hasMeaningfulStudyData(data)) {
    return;
}

if (
    lastPrivateSaveRef.current.ownerId === targetUserId &&
    lastPrivateSaveRef.current.signature === privateDataSignature
) {
    return;
}

if (isAdmin && viewingUser) {
    try {
        await updateProfilePrivate(targetUserId, { data });
        lastPrivateSaveRef.current = { ownerId: targetUserId, signature: privateDataSignature };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
    } catch (privateError) {
        console.error("Lá»—i Admin update data user private:", privateError);
    }
    // Admin được quyền lưu
    const { error } = await supabase
        .from(STUDENT_PROFILE_TABLE)
        .update({
            updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);

    if (error) console.error("Lỗi Admin update data user:", error);
}
else if (!isAuditor) { // <--- THÊM ĐIỀU KIỆN NÀY ĐỂ KHÓA AUDITOR LẠI
    // User thường mới được tự động save (Auditor thì bị chặn lại không cho save)
    const userEmail = session.user.email || '';
    const metaName = session.user.user_metadata.full_name || session.user.user_metadata.name || '';
    const nameToSave = profileFullName || metaName;

    const { error } = await supabase
        .from(STUDENT_PROFILE_TABLE)
        .update({
            full_name: nameToSave,
            avatar_url: profileAvatarUrl,
            updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

    try {
        await upsertProfilePrivate({
            user_id: session.user.id,
            email: userEmail,
            data,
            updated_at: new Date().toISOString(),
        });
        lastPrivateSaveRef.current = { ownerId: targetUserId, signature: privateDataSignature };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
    } catch (privateError) {
        console.error("Lỗi lưu profile_private_data:", privateError);
    }

    if (!error && !profileFullName && nameToSave) {
        setProfileFullName(nameToSave);
    }
}
        }, REMOTE_SAVE_DEBOUNCE_MS);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [data, getStorageDirtyKey, isLoaded, saveStudyDataToRemote, session?.user?.id, userRolePref, profileFullName, profileAvatarUrl, isAdmin, viewingUser, storageKey]);

    useEffect(() => {
        if (!isLoaded || !session?.user?.id || viewingUser || !hasMeaningfulStudyData(data)) return;

        const flushPendingSave = () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            void saveStudyDataToRemote(data).catch(error => {
                console.error('Lỗi flush dữ liệu học tập:', error);
            });
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushPendingSave();
        };

        window.addEventListener('pagehide', flushPendingSave);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pagehide', flushPendingSave);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [data, isLoaded, saveStudyDataToRemote, session?.user?.id, viewingUser]);

    const lastLocationPathRef = useRef(location.pathname);
    useEffect(() => {
        if (lastLocationPathRef.current === location.pathname) return;
        lastLocationPathRef.current = location.pathname;
        if (!isLoaded || !session?.user?.id || viewingUser || !hasMeaningfulStudyData(data)) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        void saveStudyDataToRemote(data).catch(error => {
            console.error('Lỗi lưu dữ liệu khi chuyển trang:', error);
        });
    }, [data, isLoaded, location.pathname, saveStudyDataToRemote, session?.user?.id, viewingUser]);

    useEffect(() => {
        if (showAccountSettings) {
            setDraftFullName(profileFullName);
            setDraftAvatarUrl(profileAvatarUrl);
            const loadPublicProfileDraft = async () => {
                if (!session?.user?.id || !supabase) return;
                const studentCode = (session.user.email || '').split('@')[0] || '';
                const { data: publicProfile } = await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .select('bio, class_name, profile_tags, public_profile_enabled, show_profile_stats, class_name_overridden')
                    .eq('id', session.user.id)
                    .maybeSingle();
                const officialClassName = await fetchDefaultClassName(studentCode);
                setDefaultClassName(officialClassName);
                setDraftBio((publicProfile as any)?.bio || '');
                setDraftClassName((publicProfile as any)?.class_name || officialClassName || '');
                setDraftProfileTags(Array.isArray((publicProfile as any)?.profile_tags) ? (publicProfile as any).profile_tags.join(', ') : '');
                setDraftPublicProfileEnabled(Boolean((publicProfile as any)?.public_profile_enabled));
                setDraftShowProfileStats(Boolean((publicProfile as any)?.show_profile_stats));
            };
            void loadPublicProfileDraft();
            setDraftAvatarFile(null);
            setDraftAvatarPreview('');
            setProfileError(null);
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

            setDraftStudentName(data.studentName || '');

            const prog = ACADEMIC_PROGRAMS.find(p => p.name === data.programName) || null;
            setDraftProgram(prog);
            setDraftCohort(data.cohort || '');

            if (prog && data.cohort) {
                const maj = findMajorFromSavedProfile(prog, data.cohort, data.majorName, data.specializationName);
                setDraftMajor(maj);

                if (maj) {
                    setDraftSpecialization(findSpecializationFromSavedProfile(maj, data.specializationName));
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
            loadDataIntoState(INITIAL_DATA);
            dataOwnerIdRef.current = null;
            lastPrivateSaveRef.current = { ownerId: null, signature: null };
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

    const fetchDefaultClassName = async (studentCode: string) => {
        const normalizedCode = studentCode.trim();
        if (!normalizedCode || !supabase) return '';

        try {
            const { data: orderedData, error: orderedError } = await supabase
                .from('v_drl_ranking')
                .select('class_name, semester_id')
                .eq('student_code', normalizedCode)
                .not('class_name', 'is', null)
                .order('semester_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!orderedError && orderedData?.class_name) {
                return String(orderedData.class_name).trim();
            }
        } catch (error) {
            console.warn('Không thể đọc lớp mặc định theo semester_id:', error);
        }

        try {
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('v_drl_ranking')
                .select('class_name')
                .eq('student_code', normalizedCode)
                .not('class_name', 'is', null)
                .limit(1)
                .maybeSingle();

            if (!fallbackError && fallbackData?.class_name) {
                return String(fallbackData.class_name).trim();
            }
        } catch (error) {
            console.warn('Không thể đọc lớp mặc định:', error);
        }

        return '';
    };

    const findMajorFromSavedProfile = (
        program: Program,
        cohort: string,
        savedMajorName?: string,
        savedSpecializationName?: string,
    ) => {
        const majors = getMajors(program.id, cohort);
        const normalize = (value?: string) => (value || '').trim().toLowerCase();
        const majorKey = normalize(savedMajorName);
        const specializationKey = normalize(savedSpecializationName);

        return (
            majors.find(major => normalize(major.name) === majorKey) ||
            majors.find(major => major.specializations.some(spec => normalize(spec.name) === specializationKey)) ||
            null
        );
    };

    const findSpecializationFromSavedProfile = (
        major: Major,
        savedSpecializationName?: string,
    ) => {
        const normalize = (value?: string) => (value || '').trim().toLowerCase();
        const specializationKey = normalize(savedSpecializationName);

        return (
            major.specializations.find(spec => normalize(spec.name) === specializationKey) ||
            (major.specializations.length === 1 ? major.specializations[0] : null)
        );
    };

    const handleSaveProfile = async () => {
        if (!session?.user?.id || !supabase) return;
        setProfileSaving(true);
        setProfileError(null);

        if (!draftStudentName.trim() || !draftProgram || !draftCohort || !draftMajor || !draftSpecialization) {
            setProfileError('Vui lòng cập nhật đầy đủ tên, hệ đào tạo, khóa, ngành và chuyên ngành.');
            setProfileSaving(false);
            return;
        }

        let avatarUrlToSave = draftAvatarUrl.trim();

        if (draftAvatarFile) {
            try {
                const avatarBlob = await resizeAvatarImage(draftAvatarFile);
                const base64 = await blobToBase64(avatarBlob);
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        action: 'upload-avatar',
                        contentType: avatarBlob.type || 'image/webp',
                        size: avatarBlob.size,
                        base64,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !payload.publicUrl) {
                    throw new Error(payload.error || 'Không thể tải ảnh avatar lên R2.');
                }

                avatarUrlToSave = payload.publicUrl;
            } catch (error: any) {
                setProfileError(error.message || 'Không thể tải ảnh lên. Vui lòng thử lại.');
                setProfileSaving(false);
                return;
            }
        } else if (avatarUrlToSave.startsWith('#')) {
            avatarUrlToSave = getSafeAvatarColor(avatarUrlToSave);
        }

        const userEmail = session.user.email || '';
        const studentCode = userEmail.split('@')[0];
        const officialClassName = defaultClassName || await fetchDefaultClassName(studentCode);
        const classNameInput = draftClassName.trim();
        const classNameToSave = classNameInput || officialClassName || null;
        const classNameOverridden = Boolean(classNameInput && (!officialClassName || classNameInput !== officialClassName));
        const validPublicSemesters = data.semesters.filter((sem: any) => /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(sem.name) && Array.isArray(sem.subjects) && sem.subjects.length > 0);
        const publicStats = calculateCumulativeStats(validPublicSemesters as any);
        const profileTags = draftProfileTags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
            .slice(0, 6);

        const shouldPublishStats = draftPublicProfileEnabled && draftShowProfileStats;
        const profileUpdatePayload = {
            full_name: draftFullName.trim(),
            avatar_url: avatarUrlToSave,
            bio: draftBio.trim() || null,
            class_name: classNameToSave,
            class_name_overridden: classNameOverridden,
            profile_tags: profileTags,
            public_profile_enabled: draftPublicProfileEnabled,
            show_profile_stats: shouldPublishStats,
            public_gpa: shouldPublishStats ? Number(publicStats.rawGPA4.toFixed(2)) : null,
            public_completed_semesters: shouldPublishStats ? validPublicSemesters.length : null,
            public_credits: shouldPublishStats ? publicStats.passedCredits : null,
            updated_at: new Date().toISOString(),
        };

        console.debug('Profile update payload:', profileUpdatePayload);

        const { error } = await supabase
            .from(STUDENT_PROFILE_TABLE)
            .update(profileUpdatePayload)
            .eq('id', session.user.id);

        if (error) {
            console.error('Không thể lưu thông tin hồ sơ:', error);
            setProfileError([error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ') || 'Không thể lưu thông tin. Vui lòng thử lại.');
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

        const nextData = {
            ...data,
            studentName: draftStudentName.trim(),
            programName: draftProgram?.name || data.programName,
            cohort: draftCohort || data.cohort,
            majorName: draftMajor?.name || data.majorName,
            specializationName: draftSpecialization?.name || data.specializationName,
            totalCreditsRequired: draftSpecialization?.credits || data.totalCreditsRequired
        };

        try {
            await upsertProfilePrivate({
                user_id: session.user.id,
                email: userEmail,
                data: nextData,
                updated_at: new Date().toISOString(),
            });
        } catch (privateError: any) {
            console.error('Không thể lưu dữ liệu học tập riêng tư:', privateError);
            setProfileError(privateError?.message || 'Không thể lưu dữ liệu học tập riêng tư. Vui lòng thử lại.');
            setProfileSaving(false);
            return;
        }

        commitDataUpdate(prev => ({
            ...prev,
            studentName: draftStudentName.trim(),
            programName: draftProgram?.name || prev.programName,
            cohort: draftCohort || prev.cohort,
            majorName: draftMajor?.name || prev.majorName,
            specializationName: draftSpecialization?.name || prev.specializationName,
            totalCreditsRequired: draftSpecialization?.credits || prev.totalCreditsRequired
        }));

        setProfileRefreshKey(prev => prev + 1);
        setProfileSaving(false);
        setShowAccountSettings(false);
    };

    const validateAccountPasswordChange = () => {
        if (isAccountPasswordOtpMode && accountPasswordOtp.length !== 6) return 'Nhập mã OTP gồm 6 chữ số.';
        if (!isAccountPasswordOtpMode && !currentPassword) return 'Nhập mật khẩu cũ để xác nhận.';
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

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            const email = session.user.email;
            if (isAccountPasswordOtpMode) {
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setIsAccountPasswordOtpMode(false);
            setPasswordChangeNotice('Đã cập nhật mật khẩu thành công.');
        } catch (error: any) {
            setPasswordChangeError(error.message || 'Không thể cập nhật mật khẩu lúc này.');
        } finally {
            setPasswordChangeLoading(false);
        }
    };

    const handleForgotAccountPassword = async () => {
        if (!session?.user?.email || !supabase) return;
        const email = session.user.email;
        const storedCooldown = getStoredOtpCooldown(email, 'forgot_password');

        if (storedCooldown > 0) {
            setShowPasswordChange(true);
            setIsAccountPasswordOtpMode(true);
            setAccountPasswordOtpCooldownRemaining(storedCooldown);
            setPasswordChangeError(null);
            setPasswordChangeNotice(`M\u00e3 OTP \u0111\u00e3 \u0111\u01b0\u1ee3c g\u1eedi \u0111\u1ebfn ${email}. B\u1ea1n c\u00f3 th\u1ec3 g\u1eedi l\u1ea1i sau ${formatOtpCooldown(storedCooldown)}.`);
            return;
        }

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send-otp', purpose: 'forgot_password', email }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 429 && payload.retryAfterSeconds) {
                    const retryAfterSeconds = Number(payload.retryAfterSeconds);
                    storeOtpCooldown(email, 'forgot_password', retryAfterSeconds);
                    setAccountPasswordOtpCooldownRemaining(retryAfterSeconds);
                    setShowPasswordChange(true);
                    setIsAccountPasswordOtpMode(true);
                    setPasswordChangeNotice(`M\u00e3 OTP \u0111\u00e3 \u0111\u01b0\u1ee3c g\u1eedi \u0111\u1ebfn ${email}. B\u1ea1n c\u00f3 th\u1ec3 g\u1eedi l\u1ea1i sau ${formatOtpCooldown(retryAfterSeconds)}.`);
                    return;
                }
                throw new Error(payload.error || 'Kh\u00f4ng th\u1ec3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u.');
            }

            const cooldownSeconds = Number(payload.retryAfterSeconds || payload.expiresInSeconds || OTP_RESEND_COOLDOWN_SECONDS);
            storeOtpCooldown(email, 'forgot_password', cooldownSeconds);
            setAccountPasswordOtpCooldownRemaining(cooldownSeconds);
            setShowPasswordChange(true);
            setIsAccountPasswordOtpMode(true);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setPasswordChangeNotice(`\u0110\u00e3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u \u0111\u1ebfn ${email}.`);
        } catch (error: any) {
            setPasswordChangeError(error.message || 'Kh\u00f4ng th\u1ec3 g\u1eedi m\u00e3 OTP \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u.');
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

    const avatarColors = AVATAR_COLOR_OPTIONS;
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

    const saveSemestersNow = async (semesters: Semester[]) => {
        const nextData = { ...dataRef.current, semesters };
        dataRef.current = nextData;
        setData(nextData);
        let saved = await saveStudyDataToRemote(nextData);

        if (!saved && session?.user?.id && !viewingUser && !isAuditor) {
            await upsertProfilePrivate({
                user_id: session.user.id,
                email: session.user.email || '',
                data: nextData,
                updated_at: new Date().toISOString(),
            });
            saved = true;
        }

        if (!saved) {
            throw new Error('Không thể lưu bảng điểm lúc này.');
        }

        lastPrivateSaveRef.current = { ownerId: session?.user?.id || null, signature: JSON.stringify(nextData) };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
    };

    const handleOnboardingComplete = async (onboardingData: Partial<UserData>) => {
        const nextData = {
            ...dataRef.current,
            ...onboardingData,
            hasOnboarded: true
        };
        dataRef.current = nextData;
        setData(nextData);

        if (session?.user?.id && !viewingUser && !isAuditor) {
            try {
                let saved = await saveStudyDataToRemote(nextData);
                if (!saved) {
                    await upsertProfilePrivate({
                        user_id: session.user.id,
                        email: session.user.email || '',
                        data: nextData,
                        updated_at: new Date().toISOString(),
                    });
                    saved = true;
                }
                if (saved) {
                    lastPrivateSaveRef.current = { ownerId: session.user.id, signature: JSON.stringify(nextData) };
                }
            } catch (error) {
                console.error('Không thể lưu onboarding profile:', error);
            }
        }
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
            await verifyTurnstileOnly(gradeImportTurnstileToken);
            setGradeImportTurnstileToken('');
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
                if (result.error) {
                    alert(`Không nhập được bảng điểm.\n\n${result.error}\n\nDebug đã lưu ở localStorage: hub_last_transcript_import_debug`);
                    return;
                }
                alert('Không nhập được bảng điểm.\n\nParser trả về 0 môn nhưng không có lỗi chi tiết. Debug đã lưu ở localStorage: hub_last_transcript_import_debug');
                return;
            }

            commitDataUpdate(prev => {
                const newData = { ...prev, ...result.studentInfo };

                let startYear = result.yearRanges.length > 0
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

                return { ...newData, semesters: reconstructSemesters };
            });
            const firstYear = result.yearRanges.length > 0 ? Math.min(...result.yearRanges.map(y => y.start)) : '...';
            alert(`Đã nhập thành công ${importedSubjectCount} môn và sắp xếp lại lộ trình học tập từ năm ${firstYear}`);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : '';
            alert(message ? `Không nhập được bảng điểm.\n\n${message}` : "Lỗi khi đọc file PDF.");
        } finally {
            setIsImporting(false);
            setShowImportLoadingToast(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const renderProtectedApp = () => {
        const isPrivilegedUser = isAdmin || isAuditor || isCTV;
        const requiresPasswordSetup = Boolean(session?.user && !isPrivilegedUser && passwordSetAt === null);
        const requiresRequiredProfileSetup = Boolean(session?.user && !isPrivilegedUser && !hasCompleteRequiredStudyProfile(data));

        if (!isLoaded) return null;

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

        if ((session && (!data.hasOnboarded || requiresRequiredProfileSetup)) || forceGuestOnboarding) {
            return <Onboarding initialData={data} onComplete={(onboardingData) => {
                void handleOnboardingComplete(onboardingData);
                setForceGuestOnboarding(false);
            }} />;
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
                            onRequireOnboarding={() => setForceGuestOnboarding(true)}
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
                <Route path="/handbook/:tab?" element={<Handbook />} />

                <Route path="/profile/:id" element={<ProfilePage refreshKey={profileRefreshKey} onEditProfile={() => setShowAccountSettings(true)} />} />
                <Route path="/profiles/search" element={<ProfileSearchPage />} />

                <Route path="/admin-reports" element={(isAdmin || isAuditor) ? <AdminReports /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/activity" element={isAdmin ? <ActivityLogModal /> : <Navigate to="/dashboard" replace />} />
                <Route path="/admin/event-candidates" element={(isAdmin || isAuditor) ? <AdminEventCandidates /> : <Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        );

        const mobileRoutes = (
            <Routes>
                <Route path="/" element={<Navigate to="/mobile-home" replace />} />
                <Route path="/mobile-home" element={<MobileHome data={data} displayName={displayName} avatarUrl={profileAvatarUrl} avatarSeed={avatarSeed} isGuest={isGuest} showSecurityNotice={!session} onRequireOnboarding={() => setForceGuestOnboarding(true)} />} />
                <Route path="/learning" element={<MobileLearning data={data} onSetSemesters={(sems) => commitDataUpdate(prev => ({ ...prev, semesters: sems }))} onSaveSemesters={saveSemestersNow} isGuest={isGuest} onRequireOnboarding={() => setForceGuestOnboarding(true)} onTargetChange={(newTarget) => commitDataUpdate(prev => ({ ...prev, targetGPA: newTarget }))} showSecurityNotice={!session} onUpdateSemester={updateSemester} onRemoveSemester={removeSemester} onAddSemester={addSemester} onExportPDF={handleExportPDF} onImportPDF={() => { playClick(); setShowImportGuide(true); }} isImporting={isImporting} fileInputRef={fileInputRef} onFileUpload={handleFileUpload} viewUserId={viewingUser?.id} isManagementUser={isAdmin || isAuditor} />} />
                <Route path="/events" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/events/edit/:eventId" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/events/:eventId" element={<MobileEvents viewUserId={viewingUser?.id} />} />
                <Route path="/lost-found" element={<MobileLostFound />} />
                <Route path="/handbook/:tab?" element={<MobileHandbook />} />
                <Route path="/handbook" element={<MobileHandbook />} />
                <Route path="/terms" element={<MobileHandbook forcedTab="terms" />} />
                <Route path="/privacy" element={<MobileHandbook forcedTab="privacy" />} />
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
    <div className="desktop-ai-hint fixed bottom-[85px] right-6 z-50 flex flex-col items-end pointer-events-none">
                        <div
                            className={`relative w-60 bg-white text-gray-800 text-sm font-medium p-3 rounded-2xl shadow-xl border border-blue-100 transition-all duration-500 ease-in-out transform origin-bottom-right ${
                                showBubble ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4'
                            }`}
                        >
                            <p>✨ Tèn ten! Trợ lý AI HUB Planner đã sẵn sàng hỗ trợ bạn học tập rồi nè! Thử ngay nha 💖</p>
                            <div className="absolute -bottom-2 right-4 w-4 h-4 bg-white transform rotate-45 border-b border-r border-blue-100"></div>
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

                {/* MODAL ACCOUNT SETTINGS (Giữ nguyên) */}
                {showAccountSettings && (
                    <div
                        className={`fixed inset-0 bg-black/60 z-[100000] flex animate-fadeIn ${
                            useMobileLayout || isMobileScreen
                                ? 'items-end justify-center p-0'
                                : 'items-center justify-center p-4'
                        }`}
                        onClick={() => setShowAccountSettings(false)}
                    >
                        <div
                            className={`account-settings-sheet bg-white shadow-2xl w-full overflow-hidden border border-gray-200 ${
                                useMobileLayout || isMobileScreen
                                    ? 'max-h-[80vh] max-w-[430px] rounded-t-3xl animate-slideUp flex flex-col'
                                    : 'max-w-md rounded-xl animate-scaleIn'
                            }`}
                            onClick={(event) => event.stopPropagation()}
                        >
                            {(useMobileLayout || isMobileScreen) && (
                                <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-gray-200 shrink-0" />
                            )}
                            <div className={`account-settings-header ${useMobileLayout || isMobileScreen ? 'px-4 pt-3 pb-3 bg-white' : 'p-4 bg-gray-50'} border-b border-gray-100 flex justify-between items-center shrink-0`}>
                                <h3 className={`${useMobileLayout || isMobileScreen ? 'flex items-center gap-2 text-base font-black text-[#0D1B3E]' : 'font-bold text-gray-900 text-base'}`}>
                                    {(useMobileLayout || isMobileScreen) && <User size={18} className="text-[#003375]" />}
                                    Cài đặt thông tin
                                </h3>
                                <button onClick={() => setShowAccountSettings(false)} className={`${useMobileLayout || isMobileScreen ? 'bg-gray-100 p-2 rounded-full active:scale-95' : 'p-1.5 hover:bg-gray-200 rounded-lg'} text-gray-500 transition-colors`}><X size={useMobileLayout || isMobileScreen ? 16 : 18} /></button>
                            </div>
                            <div className={`account-settings-body ${useMobileLayout || isMobileScreen ? 'flex-1 min-h-0 p-4 space-y-5' : 'p-5 space-y-6 max-h-[70vh]'} overflow-y-auto custom-scrollbar`}>
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
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Bio cá nhân</label>
                                            <textarea value={draftBio} onChange={(e) => setDraftBio(e.target.value)} rows={3} maxLength={220} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm resize-none" placeholder="VD: Sinh viên năm 3, đam mê công nghệ..." />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Lớp</label>
                                            <input type="text" value={draftClassName} onChange={(e) => setDraftClassName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm" placeholder={defaultClassName ? `Mặc định: ${defaultClassName}` : 'VD: DH22KTA'} />
                                            <p className="text-[11px] text-gray-500">Nếu để trống, hệ thống sẽ dùng lớp mặc định theo MSSV khi có dữ liệu.</p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500">Tag hồ sơ, cách nhau bằng dấu phẩy</label>
                                            <input type="text" value={draftProfileTags} onChange={(e) => setDraftProfileTags(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] focus:border-[#003375] outline-none transition-shadow text-sm" placeholder="VD: Khoa Kế toán, CLB Tin học" />
                                        </div>
                                        <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                                            <input type="checkbox" checked={draftPublicProfileEnabled} onChange={(e) => {
                                                setDraftPublicProfileEnabled(e.target.checked);
                                                if (!e.target.checked) setDraftShowProfileStats(false);
                                            }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375]" />
                                            <span>
                                                <span className="block font-bold text-amber-900">Công khai hồ sơ để người khác tìm thấy</span>
                                                <span className="text-xs text-amber-800">Khi bật, tên hiển thị, MSSV, lớp, bio, avatar và tag hồ sơ có thể xuất hiện trong trang tìm kiếm và trang hồ sơ công khai.</span>
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm">
                                            <input type="checkbox" checked={draftShowProfileStats} disabled={!draftPublicProfileEnabled} onChange={(e) => setDraftShowProfileStats(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375] disabled:opacity-50" />
                                            <span>
                                                <span className="block font-bold text-[#003375]">Hiển thị thành tích học tập trên hồ sơ công khai</span>
                                                <span className="text-xs text-gray-600">Chỉ bật được sau khi bạn bật hồ sơ công khai. Công khai GPA tích lũy, số học kỳ hoàn thành và tín chỉ tích lũy; dữ liệu chi tiết từng môn vẫn riêng tư.</span>
                                            </span>
                                        </label>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">Màu Avatar</label>
                                            <div className="flex gap-3">
                                                {avatarColors.map((color) => (
                                                    <button
                                                        key={color}
                                                        type="button"
                                                        onClick={() => {
                                                            setDraftAvatarUrl(color);
                                                            setDraftAvatarFile(null);
                                                            if (draftAvatarPreview) {
                                                                URL.revokeObjectURL(draftAvatarPreview);
                                                                setDraftAvatarPreview('');
                                                            }
                                                        }}
                                                        className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${getAvatarColorClass(color)} ${draftAvatarUrl === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">Ảnh Avatar</label>
                                            <div className="flex items-center gap-3">
                                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                                                    {draftAvatarPreview ? (
                                                        <img src={draftAvatarPreview} alt="Avatar xem trước" className="h-full w-full object-cover" />
                                                    ) : isAvatarImageUrl(draftAvatarUrl) ? (
                                                        <img src={draftAvatarUrl} alt="Avatar hiện tại" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className={`flex h-full w-full items-center justify-center text-sm font-black text-white ${getAvatarColorClass(draftAvatarUrl)}`}>
                                                            {avatarSeed}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <input
                                                        id="avatar-upload"
                                                        type="file"
                                                        accept="image/png,image/jpeg,image/webp"
                                                        className="hidden"
                                                        onChange={(event) => {
                                                            const file = event.target.files?.[0];
                                                            if (!file) return;
                                                            if (!file.type.startsWith('image/')) {
                                                                setProfileError('Vui lòng chọn đúng file ảnh.');
                                                                return;
                                                            }
                                                            if (draftAvatarPreview) URL.revokeObjectURL(draftAvatarPreview);
                                                            setDraftAvatarFile(file);
                                                            setDraftAvatarUrl('');
                                                            setDraftAvatarPreview(URL.createObjectURL(file));
                                                        }}
                                                    />
                                                    <label
                                                        htmlFor="avatar-upload"
                                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-[#003375] transition-colors hover:bg-blue-50"
                                                    >
                                                        Tải ảnh lên
                                                    </label>
                                                    <p className="mt-1 text-[11px] font-medium leading-4 text-gray-400">
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-1">
                                        <h4 className="text-xs font-black text-[#003375] uppercase tracking-wider">2. Bảo mật tài khoản</h4>
                                        <button
                                            type="button"
                                            onClick={handleForgotAccountPassword}
                                            disabled={passwordChangeLoading || accountPasswordOtpCooldownRemaining > 0}
                                            className="text-xs font-black text-[#003375] hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                                        >
                                            {accountPasswordOtpCooldownRemaining > 0
                                                ? `Gửi lại sau ${formatOtpCooldown(accountPasswordOtpCooldownRemaining)}`
                                                : isAccountPasswordOtpMode ? 'Gửi lại mã OTP' : 'Quên mật khẩu?'}
                                        </button>
                                    </div>

                                    {passwordChangeError && (
                                        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
                                            {passwordChangeError}
                                        </div>
                                    )}
                                    {passwordChangeNotice && (
                                        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-[#003375]">
                                            {passwordChangeNotice}
                                        </div>
                                    )}

                                    {!showPasswordChange ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                playClick();
                                                setShowPasswordChange(true);
                                                setIsAccountPasswordOtpMode(false);
                                                setAccountPasswordOtp('');
                                                setPasswordChangeError(null);
                                                setPasswordChangeNotice(null);
                                            }}
                                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#003375]"
                                        >
                                            <Lock size={16} />
                                            Cài lại mật khẩu
                                        </button>
                                    ) : (
                                        <form onSubmit={handleChangeAccountPassword} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-gray-500">{isAccountPasswordOtpMode ? 'M\u00e3 OTP' : 'M\u1eadt kh\u1ea9u c\u0169'}</label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                    <input
                                                        type={isAccountPasswordOtpMode ? 'text' : showCurrentPassword ? 'text' : 'password'}
                                                        value={isAccountPasswordOtpMode ? accountPasswordOtp : currentPassword}
                                                        onChange={(event) => {
                                                            if (isAccountPasswordOtpMode) {
                                                                setAccountPasswordOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                                                            } else {
                                                                setCurrentPassword(event.target.value);
                                                            }
                                                        }}
                                                        className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                                                        placeholder={isAccountPasswordOtpMode ? 'Nh\u1eadp 6 ch\u1eef s\u1ed1' : 'Nh\u1eadp m\u1eadt kh\u1ea9u hi\u1ec7n t\u1ea1i'}
                                                        autoComplete={isAccountPasswordOtpMode ? 'one-time-code' : 'current-password'}
                                                    />
                                                    {!isAccountPasswordOtpMode && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowCurrentPassword(prev => !prev)}
                                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#003375]"
                                                            aria-label={showCurrentPassword ? '\u1ea8n m\u1eadt kh\u1ea9u c\u0169' : 'Hi\u1ec7n m\u1eadt kh\u1ea9u c\u0169'}
                                                        >
                                                            {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-gray-500">Mật khẩu mới</label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                    <input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(event) => setNewPassword(event.target.value)}
                                                        className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                                                        placeholder="Ít nhất 8 ký tự"
                                                        autoComplete="new-password"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNewPassword(prev => !prev)}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#003375]"
                                                        aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                                                    >
                                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-gray-500">Nhập lại mật khẩu mới</label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                    <input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        value={confirmNewPassword}
                                                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                                                        className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                                                        placeholder="Nhập lại mật khẩu mới"
                                                        autoComplete="new-password"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowPasswordChange(false);
                                                        setCurrentPassword('');
                                                        setAccountPasswordOtp('');
                                                        setNewPassword('');
                                                        setConfirmNewPassword('');
                                                        setIsAccountPasswordOtpMode(false);
                                                        setPasswordChangeError(null);
                                                        setPasswordChangeNotice(null);
                                                    }}
                                                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                                                >
                                                    Hủy
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={passwordChangeLoading}
                                                    className="flex-[1.4] rounded-lg bg-[#003375] px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-[#002855] disabled:cursor-not-allowed disabled:bg-gray-300"
                                                >
                                                    {passwordChangeLoading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>

                                <div>
                                    <h4 className="text-xs font-black text-[#003375] uppercase tracking-wider mb-3 border-b border-gray-100 pb-1">3. Thông tin lộ trình</h4>
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

                            <div className={`account-settings-footer ${useMobileLayout || isMobileScreen ? 'px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-white' : 'p-4 bg-gray-50'} border-t border-gray-100 flex gap-2 shrink-0`}>
                                <button onClick={() => setShowAccountSettings(false)} className={`${useMobileLayout || isMobileScreen ? 'py-3 rounded-xl' : 'py-2 rounded-lg'} flex-1 border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors`}>Hủy</button>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={profileSaving || !draftProgram || !draftCohort || !draftMajor || !draftSpecialization}
                                    className={`${useMobileLayout || isMobileScreen ? 'py-3 rounded-xl shadow-md' : 'py-2 rounded-lg'} flex-[2] bg-[#003375] text-white font-bold text-sm hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {profileSaving ? <Loader2 className="animate-spin" size={14} /> : null} Lưu thông tin
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ✨ BẢNG HƯỚNG DẪN CÀI ĐẶT TRÊN MÁY APPLE (IOS/MAC) */}
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

    if (loadingRole) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#F8FAFC]">
                <Loader2 className="animate-spin text-[#003375] mb-4" size={40} />
                <p className="text-sm font-bold text-[#003375] animate-pulse">Đang đồng bộ tài khoản...</p>
            </div>
        );
    }

    return (
        <>
            <Routes>
                <Route path="/privacy" element={(useMobileLayout || isMobileScreen) ? <MobileHandbook forcedTab="privacy" /> : <PrivacyPolicy />} />
                <Route path="/terms" element={(useMobileLayout || isMobileScreen) ? <MobileHandbook forcedTab="terms" /> : <TermsOfUse />} />
                <Route path="/login" element={<LoginScreen />} />

                <Route path="/" element={<Navigate to={useMobileLayout ? "/mobile-home" : "/dashboard"} replace />} />
                <Route path="/*" element={renderProtectedApp()} />
            </Routes>
            <DataIncidentNoticeModal onDone={() => setIsDataIncidentNoticeDone(true)} />
        </>
    );
};

export default App;
