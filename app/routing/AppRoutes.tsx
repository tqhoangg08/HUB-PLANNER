import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { UserData } from '../../types';
import type { AuthRefresh } from '../../hooks/useUserRole';
import { SupportNoticeModal } from '../../components/SupportNoticeModal';
import { AuthMaintenanceScreen } from '../../components/AuthMaintenanceScreen';
import { AUTH_MAINTENANCE_MODE, PASSWORD_RECOVERY_ENABLED } from '../../utils/rescueMode';
import {
    LoginScreen,
    MobileHandbook,
    Onboarding,
    PrivacyPolicy,
    PublicRankings,
    RecoveryAccountScreen,
    RecoveryForgotPasswordScreen,
    RecoveryResetPasswordScreen,
    RegistrationPasswordScreen,
    StaffPasswordActivationScreen,
    TermsOfUse,
} from './lazyScreens';

interface AppRoutesProps {
    data: UserData;
    isLoaded: boolean;
    mobileLayout: boolean;
    mobileScreen: boolean;
    canSkipOnboarding: boolean;
    onRefreshAuth: AuthRefresh;
    onCompleteOnboarding: (data: Partial<UserData>) => void;
    protectedApp: ReactNode;
}

export const AppRoutes = ({
    data,
    isLoaded,
    mobileLayout,
    mobileScreen,
    canSkipOnboarding,
    onRefreshAuth,
    onCompleteOnboarding,
    protectedApp,
}: AppRoutesProps) => {
    const defaultPath = mobileLayout ? '/mobile-home' : '/dashboard';
    const useMobilePolicyPage = mobileLayout || mobileScreen;

    if (AUTH_MAINTENANCE_MODE) {
        return (
            <Routes>
                <Route
                    path="/privacy"
                    element={useMobilePolicyPage
                        ? <MobileHandbook forcedTab="privacy" />
                        : <PrivacyPolicy />}
                />
                <Route
                    path="/terms"
                    element={useMobilePolicyPage
                        ? <MobileHandbook forcedTab="terms" />
                        : <TermsOfUse />}
                />
                <Route path="/" element={<Navigate to={defaultPath} replace />} />
                <Route path="/login" element={<LoginScreen onRefreshAuth={onRefreshAuth} />} />
                <Route path="/staff/login" element={<Navigate to="/login" replace />} />
                <Route path="/staff/activate" element={<StaffPasswordActivationScreen />} />
                <Route path="/staff/reset-password" element={<RecoveryResetPasswordScreen returnTo="/staff/login?password-reset=success" />} />
                <Route path="/complete-registration" element={<RegistrationPasswordScreen />} />
                <Route
                    path="/forgot-password"
                    element={PASSWORD_RECOVERY_ENABLED
                        ? <RecoveryForgotPasswordScreen />
                        : <Navigate to="/login" replace />}
                />
                <Route
                    path="/reset-password"
                    element={PASSWORD_RECOVERY_ENABLED
                        ? <RecoveryResetPasswordScreen />
                        : <Navigate to="/login" replace />}
                />
                <Route path="/account" element={<RecoveryAccountScreen />} />
                <Route path="/onboarding" element={<AuthMaintenanceScreen />} />
                <Route path="/learning" element={<AuthMaintenanceScreen />} />
                <Route path="/schedule/:studentCode" element={<AuthMaintenanceScreen />} />
                <Route path="/events/edit/:eventId" element={<AuthMaintenanceScreen />} />
                <Route path="/rankings" element={<PublicRankings />} />
                <Route path="/support/*" element={<AuthMaintenanceScreen />} />
                <Route path="/handbook/*" element={<AuthMaintenanceScreen />} />
                <Route path="/profile/*" element={<AuthMaintenanceScreen />} />
                <Route path="/profiles/*" element={<AuthMaintenanceScreen />} />
                <Route path="/admin/*" element={<AuthMaintenanceScreen />} />
                <Route path="/*" element={protectedApp} />
            </Routes>
        );
    }

    return (
        <>
            <Routes>
                <Route
                    path="/privacy"
                    element={useMobilePolicyPage
                        ? <MobileHandbook forcedTab="privacy" />
                        : <PrivacyPolicy />}
                />
                <Route
                    path="/terms"
                    element={useMobilePolicyPage
                        ? <MobileHandbook forcedTab="terms" />
                        : <TermsOfUse />}
                />
                <Route path="/login" element={<LoginScreen onRefreshAuth={onRefreshAuth} />} />
                <Route path="/staff/login" element={<Navigate to="/login" replace />} />
                <Route path="/staff/activate" element={<StaffPasswordActivationScreen />} />
                <Route path="/staff/reset-password" element={<RecoveryResetPasswordScreen returnTo="/staff/login?password-reset=success" />} />
                <Route path="/complete-registration" element={<RegistrationPasswordScreen />} />
                <Route
                    path="/forgot-password"
                    element={PASSWORD_RECOVERY_ENABLED
                        ? <RecoveryForgotPasswordScreen />
                        : <Navigate to="/login" replace />}
                />
                <Route
                    path="/reset-password"
                    element={PASSWORD_RECOVERY_ENABLED
                        ? <RecoveryResetPasswordScreen />
                        : <Navigate to="/login" replace />}
                />
                <Route path="/account" element={<RecoveryAccountScreen />} />
                <Route
                    path="/onboarding"
                    element={isLoaded ? (
                        canSkipOnboarding
                            ? <Navigate to={defaultPath} replace />
                            : (
                                <Onboarding
                                    initialData={data}
                                    onComplete={onCompleteOnboarding}
                                />
                            )
                    ) : null}
                />
                <Route path="/" element={<Navigate to={defaultPath} replace />} />
                <Route path="/*" element={protectedApp} />
            </Routes>
            <SupportNoticeModal />
        </>
    );
};
