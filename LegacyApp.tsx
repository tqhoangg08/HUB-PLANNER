import React, { useMemo, useState, useCallback } from 'react';
import { useUserRole } from './hooks/useUserRole';
import { useAppMode } from './hooks/useAppMode';
import { useStudyData } from './hooks/useStudyData';
import { useAccountProfileDraft } from './hooks/useAccountProfileDraft';
import { useAccountPassword } from './hooks/useAccountPassword';
import { useTranscriptTransfer } from './hooks/useTranscriptTransfer';
import { useDeleteAccount } from './hooks/useDeleteAccount';
import { useSessionLifecycle } from './hooks/useSessionLifecycle';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useAiHintBubble } from './hooks/useAiHintBubble';
import { useManagedStudentView } from './hooks/useManagedStudentView';
import { useSessionAccessControl } from './hooks/useSessionAccessControl';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import NotificationBell from './components/NotificationBell';
import { RouteLoadingFallback } from './app/routing/RouteLoadingFallback';
import { RouteErrorBoundary } from './app/routing/RouteErrorBoundary';
import { AppRoutes } from './app/routing/AppRoutes';
import { ProtectedAppRoutes } from './app/routing/ProtectedAppRoutes';
import { AuthGate } from './app/auth/AuthGate';
import { AccessDeniedScreen } from './app/auth/AccessDeniedScreen';
import { ProtectedAppOverlays } from './app/shell/ProtectedAppOverlays';
import { ProtectedAppShell } from './app/shell/ProtectedAppShell';
import { hasCompleteRequiredStudyProfile } from './features/study-data/model';
import { useStudyActions } from './hooks/useStudyActions';

const LegacyApp: React.FC = () => {
    const {
        isAdmin,
        isAuditor,
        isCTV,
        session,
        loading: loadingRole,
        refreshAuth,
    } = useUserRole();
    const navigate = useNavigate();
    const location = useLocation();
    const isGuest = !session;

    const {
        isAppMode,
        isMobileScreen,
        useMobileLayout,
        isMobileBrowser,
    } = useAppMode(location.search);
    const {
        passwordSetAt,
        setPasswordSetAt,
        passwordSetupSchemaMissing,
    } = useSessionLifecycle({
        session,
        isAdmin,
        isAuditor,
        loadingRole,
        pathname: location.pathname,
    });

    const {
        handleInstallApp,
        showIOSInstructions,
        dismissIOSInstructions,
    } = usePwaInstall({
        pathname: location.pathname,
        search: location.search,
    });

    const showBubble = useAiHintBubble();

    const {
        adminSearchMssv,
        setAdminSearchMssv,
        viewingUser,
        isSearchingUser,
        handleAdminSearchUser,
        clearViewingUser,
    } = useManagedStudentView();
    const [showGuide, setShowGuide] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showAccountSettings, setShowAccountSettings] = useState(false);
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
    const studyActions = useStudyActions({ commitDataUpdate });
    const transcriptTransfer = useTranscriptTransfer({
        data,
        commitDataUpdate,
    });
    const accountProfileDraft = useAccountProfileDraft({
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
    const { profileRefreshKey } = accountProfileDraft;
    const accountPassword = useAccountPassword({
        settingsOpen: showAccountSettings,
        session,
        setPasswordSetAt,
    });
    const navigateToLogin = useCallback(() => {
        navigate('/login', { replace: true });
    }, [navigate]);
    const deleteAccount = useDeleteAccount({
        session,
        onCloseUserMenu: () => setIsUserMenuOpen(false),
        onNavigateToLogin: navigateToLogin,
    });
    const {
        requestDeleteAccount: handleRequestReset,
        resetDeleteAccountModal,
    } = deleteAccount;
    const {
        isAccessDenied,
        deniedEmail,
        handleLogout,
        handleMenuLogout,
        handleDeniedAccessLogout,
    } = useSessionAccessControl({
        session,
        isAdmin,
        isAuditor,
        isCTV,
        pathname: location.pathname,
        search: location.search,
        resetStudyData,
        setProfileFullName,
        setProfileAvatarUrl,
        clearViewingUser,
        resetDeleteAccountModal,
        closeUserMenu: () => setIsUserMenuOpen(false),
        navigateToLogin,
    });

    const displayName = useMemo(() => {
        if (profileFullName.trim()) return profileFullName.trim();
        return session?.user?.email ?? 'HUB User';
    }, [profileFullName, session?.user?.email]);

    const avatarSeed = useMemo(() => {
        if (displayName.trim()) return displayName.trim()[0].toUpperCase();
        return 'H';
    }, [displayName]);

    const studentId = session?.user?.email?.split('@')[0] ?? '';

    const renderProtectedApp = () => {
        const isPrivilegedUser = isAdmin || isAuditor || isCTV;
        const requiresPasswordSetup = Boolean(session?.user && !isPrivilegedUser && passwordSetAt === null);
        const requiresRequiredProfileSetup = Boolean(session?.user && !isPrivilegedUser && !hasCompleteRequiredStudyProfile(data));

        if (!isLoaded) return <RouteLoadingFallback />;

        if (isAccessDenied && !isAdmin && !isAuditor && !isCTV) {
            return (
                <AccessDeniedScreen
                    deniedEmail={deniedEmail}
                    onLogout={handleDeniedAccessLogout}
                />
            );
        }

        if (session && requiresRequiredProfileSetup) {
            return <Navigate to="/onboarding" replace />;
        }

        const currentRoutes = (
            <ProtectedAppRoutes
                mobileLayout={useMobileLayout}
                data={data}
                studyActions={studyActions}
                saveSemestersNow={saveSemestersNow}
                transcript={transcriptTransfer}
                isGuest={isGuest}
                hasSession={Boolean(session)}
                sessionUserId={session?.user.id || null}
                sessionStudentCode={studentId}
                viewingUserId={viewingUser?.id}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                displayName={displayName}
                profileAvatarUrl={profileAvatarUrl}
                avatarSeed={avatarSeed}
                profileRefreshKey={profileRefreshKey}
                showInstallButton={!isAppMode}
                onRequireOnboarding={() => navigate('/onboarding')}
                setAccountSettingsOpen={setShowAccountSettings}
                onRequestDeleteAccount={handleRequestReset}
                onInstallApp={handleInstallApp}
            />
        );

        const commonOverlays = (
            <ProtectedAppOverlays
                data={data}
                userId={session?.user.id}
                email={session?.user.email}
                mobileScreen={isMobileScreen}
                mobileLayout={useMobileLayout}
                showAiHint={showBubble}
                showGuide={showGuide}
                showActivityLog={showActivityLog}
                accountSettingsOpen={showAccountSettings}
                showIOSInstructions={showIOSInstructions}
                avatarSeed={avatarSeed}
                transcript={transcriptTransfer}
                deleteAccount={deleteAccount}
                accountProfile={accountProfileDraft}
                accountPassword={accountPassword}
                onCloseGuide={() => setShowGuide(false)}
                onCloseActivityLog={() => setShowActivityLog(false)}
                onCloseAccountSettings={() => setShowAccountSettings(false)}
                onCloseIOSInstructions={dismissIOSInstructions}
            />
        );

        return (
            <ProtectedAppShell
                mobileLayout={useMobileLayout}
                mobileScreen={isMobileScreen}
                mobileBrowser={isMobileBrowser}
                session={session}
                isGuest={isGuest}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                viewingUser={viewingUser}
                displayName={displayName}
                studentId={studentId}
                avatarUrl={profileAvatarUrl}
                avatarSeed={avatarSeed}
                adminSearchMssv={adminSearchMssv}
                isSearchingUser={isSearchingUser}
                userMenuOpen={isUserMenuOpen}
                showInstallButton={!isAppMode}
                passwordSetupSchemaMissing={passwordSetupSchemaMissing}
                isPrivilegedUser={isPrivilegedUser}
                requiresPasswordSetup={requiresPasswordSetup}
                setAdminSearchMssv={setAdminSearchMssv}
                onAdminSearchUser={handleAdminSearchUser}
                onRequestDeleteAccount={handleRequestReset}
                onLogout={handleLogout}
                setGuideOpen={setShowGuide}
                setActivityLogOpen={setShowActivityLog}
                setUserMenuOpen={setIsUserMenuOpen}
                setAccountSettingsOpen={setShowAccountSettings}
                onMenuLogout={handleMenuLogout}
                onNavigate={navigate}
                onInstallApp={handleInstallApp}
                onPasswordSetupComplete={() => setPasswordSetAt(new Date().toISOString())}
                overlays={commonOverlays}
            >
                {currentRoutes}
            </ProtectedAppShell>
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
                        onRefreshAuth={refreshAuth}
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

export default LegacyApp;
