import { useCallback, useEffect, useState } from 'react';
import type { AppSession } from '../utils/privateApi';
import { signOutBetterAuth } from '../utils/privateApi';
import { logActivity } from '../utils/activityLogger';
import { playClick } from '../utils/audio';
import { clearLocalStoragePreservingDevicePreferences } from '../utils/devicePreferences';
import {
    setActivePushNotificationUser,
    unbindDeviceNotificationsForCurrentUser,
} from '../utils/pushNotifications';

export const SCHOOL_EMAIL_DOMAIN = 'st.buh.edu.vn';

interface UseSessionAccessControlOptions {
    session: AppSession | null;
    isAdmin: boolean;
    isAuditor: boolean;
    isCTV: boolean;
    pathname: string;
    search: string;
    resetStudyData: () => void;
    setProfileFullName: (value: string) => void;
    setProfileAvatarUrl: (value: string) => void;
    clearViewingUser: () => void;
    resetDeleteAccountModal: () => void;
    closeUserMenu: () => void;
    navigateToLogin: () => void;
}

export const useSessionAccessControl = ({
    session,
    isAdmin,
    isAuditor,
    isCTV,
    pathname,
    search,
    resetStudyData,
    setProfileFullName,
    setProfileAvatarUrl,
    clearViewingUser,
    resetDeleteAccountModal,
    closeUserMenu,
    navigateToLogin,
}: UseSessionAccessControlOptions) => {
    const sessionUserId = session?.user?.id || null;
    const sessionEmail = session?.user?.email || '';
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [deniedEmail, setDeniedEmail] = useState('');

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.get('error')) {
            setIsAccessDenied(true);
            setDeniedEmail('Ngoài hệ thống HUB (VD: @gmail.com)');
            window.history.replaceState({}, document.title, pathname);
            return;
        }

        if (!sessionEmail || isAdmin || isAuditor || isCTV) {
            setIsAccessDenied(false);
            setDeniedEmail('');
            return;
        }

        const emailDomain = sessionEmail.split('@')[1];
        const denied = emailDomain !== SCHOOL_EMAIL_DOMAIN;
        setIsAccessDenied(denied);
        setDeniedEmail(denied ? sessionEmail : '');
    }, [isAdmin, isAuditor, isCTV, pathname, search, sessionEmail]);

    const performLogout = useCallback(async (recordPrivilegedActivity: boolean) => {
        setActivePushNotificationUser(null);

        try {
            await unbindDeviceNotificationsForCurrentUser(sessionUserId);
        } catch (error) {
            console.error('Lỗi gỡ liên kết thông báo thiết bị:', error);
        }

        if (recordPrivilegedActivity && session && (isAdmin || isAuditor)) {
            try {
                await logActivity({
                    action: 'logout',
                    session,
                    userRole: isAdmin ? 'admin' : 'auditor',
                    pagePath: pathname,
                });
            } catch (error) {
                console.error('Lỗi ghi nhận hoạt động đăng xuất:', error);
            }
        }

        try {
            await signOutBetterAuth();
        } catch (error) {
            console.error('Lỗi khi đăng xuất:', error);
        }

        clearLocalStoragePreservingDevicePreferences();
        sessionStorage.clear();
        resetStudyData();
        setProfileFullName('');
        setProfileAvatarUrl('');
        clearViewingUser();
        resetDeleteAccountModal();
        setIsAccessDenied(false);
        setDeniedEmail('');
        navigateToLogin();
    }, [
        clearViewingUser,
        isAdmin,
        isAuditor,
        navigateToLogin,
        pathname,
        resetDeleteAccountModal,
        resetStudyData,
        session,
        sessionUserId,
        setProfileAvatarUrl,
        setProfileFullName,
    ]);

    const handleLogout = useCallback(async () => {
        playClick();
        if (!window.confirm('Đăng xuất khỏi hệ thống?')) return;
        await performLogout(true);
    }, [performLogout]);

    const handleMenuLogout = useCallback(async () => {
        closeUserMenu();
        await handleLogout();
    }, [closeUserMenu, handleLogout]);

    const handleDeniedAccessLogout = useCallback(async () => {
        playClick();
        await performLogout(false);
    }, [performLogout]);

    return {
        isAccessDenied,
        deniedEmail,
        handleLogout,
        handleMenuLogout,
        handleDeniedAccessLogout,
    };
};
