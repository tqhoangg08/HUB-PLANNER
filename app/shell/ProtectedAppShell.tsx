import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import type { AppSession } from '../../utils/privateApi';
import type { ManagedStudent } from '../../hooks/useManagedStudentView';
import { FloatingSupportTab } from '../../components/FloatingSupportTab';
import { PasswordSetupModal } from '../../components/PasswordSetupModal';
import { DesktopLayout } from '../../layouts/DesktopLayout';
import { MobileAppLayout } from '../../layouts/MobileAppLayout';
import { PasswordSetupSchemaWarning } from '../auth/PasswordSetupSchemaWarning';
import { AppParticles } from '../presentation/AppParticles';

interface ProtectedAppShellProps {
    children: ReactNode;
    overlays: ReactNode;
    mobileLayout: boolean;
    mobileScreen: boolean;
    mobileBrowser: boolean;
    session: AppSession | null;
    isGuest: boolean;
    isAdmin: boolean;
    isAuditor: boolean;
    viewingUser: ManagedStudent | null;
    displayName: string;
    studentId: string;
    avatarUrl: string;
    avatarSeed: string;
    adminSearchMssv: string;
    isSearchingUser: boolean;
    userMenuOpen: boolean;
    showInstallButton: boolean;
    passwordSetupSchemaMissing: boolean;
    isPrivilegedUser: boolean;
    requiresPasswordSetup: boolean;
    setAdminSearchMssv: Dispatch<SetStateAction<string>>;
    onAdminSearchUser: (event: FormEvent) => void;
    onRequestDeleteAccount: () => void;
    onLogout: () => void;
    setGuideOpen: (open: boolean) => void;
    setActivityLogOpen: (open: boolean) => void;
    setUserMenuOpen: (open: boolean) => void;
    setAccountSettingsOpen: (open: boolean) => void;
    onMenuLogout: () => void;
    onNavigate: (path: string) => void;
    onInstallApp: () => void;
    onPasswordSetupComplete: () => void;
}

export const ProtectedAppShell = ({
    children,
    overlays,
    mobileLayout,
    mobileScreen,
    mobileBrowser,
    session,
    isGuest,
    isAdmin,
    isAuditor,
    viewingUser,
    displayName,
    studentId,
    avatarUrl,
    avatarSeed,
    adminSearchMssv,
    isSearchingUser,
    userMenuOpen,
    showInstallButton,
    passwordSetupSchemaMissing,
    isPrivilegedUser,
    requiresPasswordSetup,
    setAdminSearchMssv,
    onAdminSearchUser,
    onRequestDeleteAccount,
    onLogout,
    setGuideOpen,
    setActivityLogOpen,
    setUserMenuOpen,
    setAccountSettingsOpen,
    onMenuLogout,
    onNavigate,
    onInstallApp,
    onPasswordSetupComplete,
}: ProtectedAppShellProps) => {
    const layout = mobileLayout ? (
        <MobileAppLayout
            session={session}
            displayName={displayName}
            studentId={studentId}
            avatarUrl={avatarUrl}
            avatarSeed={avatarSeed}
            isUserMenuOpen={userMenuOpen}
            setIsUserMenuOpen={setUserMenuOpen}
            setShowAccountSettings={setAccountSettingsOpen}
            handleRequestReset={onRequestDeleteAccount}
            handleMenuLogout={onMenuLogout}
        >
            {children}
        </MobileAppLayout>
    ) : (
        <DesktopLayout
            session={session}
            isGuest={isGuest}
            isAdmin={isAdmin}
            isAuditor={isAuditor}
            viewingUser={viewingUser}
            displayName={displayName}
            studentId={studentId}
            avatarUrl={avatarUrl}
            avatarSeed={avatarSeed}
            adminSearchMssv={adminSearchMssv}
            isSearchingUser={isSearchingUser}
            isMobileBrowser={mobileBrowser}
            setAdminSearchMssv={setAdminSearchMssv}
            handleAdminSearchUser={onAdminSearchUser}
            handleRequestReset={onRequestDeleteAccount}
            handleLogout={onLogout}
            setShowGuide={setGuideOpen}
            setShowActivityLog={setActivityLogOpen}
            setIsUserMenuOpen={setUserMenuOpen}
            isUserMenuOpen={userMenuOpen}
            setShowAccountSettings={setAccountSettingsOpen}
            handleMenuLogout={onMenuLogout}
            navigate={onNavigate}
            onInstallApp={onInstallApp}
            showInstallButton={showInstallButton}
        >
            {children}
        </DesktopLayout>
    );

    return (
        <div
            className={
                mobileBrowser
                    ? 'app-shell mobile-browser-shell min-h-[100lvh] bg-[#F8FAFC] font-sans text-gray-800 relative overflow-x-hidden overflow-y-visible'
                    : 'app-shell h-[100dvh] bg-[#F8FAFC] font-sans text-gray-800 flex flex-col relative overflow-hidden'
            }
        >
            <AppParticles />
            {layout}
            {overlays}

            <FloatingSupportTab
                currentUserId={session?.user?.id || null}
                isGuest={isGuest}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                isMobileLayout={mobileLayout || mobileScreen}
            />

            <PasswordSetupSchemaWarning
                open={passwordSetupSchemaMissing && !isPrivilegedUser}
            />

            {requiresPasswordSetup && (
                <PasswordSetupModal
                    email={session?.user?.email}
                    userId={session?.user?.id}
                    onComplete={onPasswordSetupComplete}
                />
            )}
        </div>
    );
};
