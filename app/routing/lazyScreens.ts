import { lazy } from 'react';

export const Dashboard = lazy(() =>
    import('../../components/Dashboard').then(module => ({ default: module.Dashboard }))
);
export const Onboarding = lazy(() =>
    import('../../components/Onboarding').then(module => ({ default: module.Onboarding }))
);
export const Handbook = lazy(() =>
    import('../../components/Handbook').then(module => ({ default: module.Handbook }))
);
export const EventsBoard = lazy(() =>
    import('../../components/EventsBoard').then(module => ({ default: module.EventsBoard }))
);
export const LostFoundBoard = lazy(() =>
    import('../../components/LostFoundBoard').then(module => ({ default: module.LostFoundBoard }))
);
export const LoginScreen = lazy(() =>
    import('../../components/LoginScreen').then(module => ({ default: module.LoginScreen }))
);
export const RecoveryLoginScreen = lazy(() =>
    import('../../components/RecoveryLoginScreen').then(module => ({ default: module.RecoveryLoginScreen }))
);
export const RecoveryAccountScreen = lazy(() =>
    import('../../components/RecoveryAccountScreen').then(module => ({ default: module.RecoveryAccountScreen }))
);
export const RecoveryForgotPasswordScreen = lazy(() =>
    import('../../components/RecoveryForgotPasswordScreen').then(module => ({ default: module.RecoveryForgotPasswordScreen }))
);
export const RecoveryResetPasswordScreen = lazy(() =>
    import('../../components/RecoveryResetPasswordScreen').then(module => ({ default: module.RecoveryResetPasswordScreen }))
);
export const StaffPasswordActivationScreen = lazy(() =>
    import('../../components/StaffPasswordActivationScreen').then(module => ({ default: module.StaffPasswordActivationScreen }))
);
export const RegistrationPasswordScreen = lazy(() =>
    import('../../components/RegistrationPasswordScreen').then(module => ({ default: module.RegistrationPasswordScreen }))
);
export const PrivacyPolicy = lazy(() =>
    import('../../components/PrivacyPolicy').then(module => ({ default: module.PrivacyPolicy }))
);
export const PublicRankings = lazy(() =>
    import('../../components/PublicRankings').then(module => ({ default: module.PublicRankings }))
);
export const TermsOfUse = lazy(() =>
    import('../../components/TermsOfUse').then(module => ({ default: module.TermsOfUse }))
);
export const ScheduleBoard = lazy(() => import('../../components/ScheduleBoard'));
export const AdminReports = lazy(() =>
    import('../../components/AdminReports').then(module => ({ default: module.AdminReports }))
);
export const AdminEventCandidates = lazy(() =>
    import('../../components/AdminEventCandidates').then(module => ({ default: module.AdminEventCandidates }))
);
export const AdminSupportTickets = lazy(() =>
    import('../../components/AdminSupportTickets').then(module => ({ default: module.AdminSupportTickets }))
);
export const CloudflareDataAdmin = lazy(() =>
    import('../../components/CloudflareDataAdmin').then(module => ({ default: module.CloudflareDataAdmin }))
);
export const SupportTickets = lazy(() =>
    import('../../components/SupportTickets').then(module => ({ default: module.SupportTickets }))
);
export const MobileHome = lazy(() =>
    import('../../components/MobileHome').then(module => ({ default: module.MobileHome }))
);
export const MobileLearning = lazy(() =>
    import('../../components/MobileLearning').then(module => ({ default: module.MobileLearning }))
);
export const MobileEvents = lazy(() =>
    import('../../components/MobileEvents').then(module => ({ default: module.MobileEvents }))
);
export const MobileLostFound = lazy(() =>
    import('../../components/MobileLostFound').then(module => ({ default: module.MobileLostFound }))
);
export const MobileProfile = lazy(() =>
    import('../../components/MobileProfile').then(module => ({ default: module.MobileProfile }))
);
export const MobileHandbook = lazy(() =>
    import('../../components/MobileHandbook').then(module => ({ default: module.MobileHandbook }))
);
export const ProfilePage = lazy(() => import('../../pages/ProfilePage'));
export const ProfileSearchPage = lazy(() => import('../../pages/ProfileSearchPage'));
