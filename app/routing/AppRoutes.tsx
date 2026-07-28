import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { UserData } from '../../types';
import { SupportNoticeModal } from '../../components/SupportNoticeModal';
import {
    LoginScreen,
    MobileHandbook,
    Onboarding,
    PrivacyPolicy,
    TermsOfUse,
} from './lazyScreens';

interface AppRoutesProps {
    data: UserData;
    isLoaded: boolean;
    mobileLayout: boolean;
    mobileScreen: boolean;
    canSkipOnboarding: boolean;
    onCompleteOnboarding: (data: Partial<UserData>) => void;
    protectedApp: ReactNode;
}

export const AppRoutes = ({
    data,
    isLoaded,
    mobileLayout,
    mobileScreen,
    canSkipOnboarding,
    onCompleteOnboarding,
    protectedApp,
}: AppRoutesProps) => {
    const defaultPath = mobileLayout ? '/mobile-home' : '/dashboard';
    const useMobilePolicyPage = mobileLayout || mobileScreen;

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
                <Route path="/login" element={<LoginScreen />} />
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
