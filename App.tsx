import React, { useMemo, useState, useCallback } from 'react';
import { ActivityLogModal } from './components/ActivityLogModal';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, Zap, Search, HelpCircle, Clock, Facebook, Phone, Calendar, ChevronDown, Users, Award, MessageSquarePlus, Heart, Info, User, ChevronLeft, ArrowUp, ArrowDown, ListFilter, Trash2, Crown, BarChart2, TrendingUp, RefreshCw, ClipboardList } from 'lucide-react';
import { playClick } from './utils/audio';
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
import { DeleteAccountModal } from './components/account/DeleteAccountModal';
import { PwaInstallInstructionsModal } from './components/PwaInstallInstructionsModal';
import { TurnstileBox } from './components/TurnstileBox';
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
import { AccessDeniedScreen } from './app/auth/AccessDeniedScreen';
import { PasswordSetupSchemaWarning } from './app/auth/PasswordSetupSchemaWarning';
import { hasCompleteRequiredStudyProfile } from './features/study-data/model';
import { useStudyActions } from './hooks/useStudyActions';

const COHORT_OPTIONS: Record<string, string[]> = {
    'standard': ['K38', 'K39', 'K40', 'K41'],
    'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
    'special': ['CTDBK1', 'CTDBK2']
};

const App: React.FC = () => {
    const { isAdmin, isAuditor, isCTV, session, loading: loadingRole } = useUserRole();
    const navigate = useNavigate();
    const location = useLocation();
    const isExamStudyRoute = false;

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
    const {
        setSemesters,
        setTargetGPA,
        addSemester,
        updateSemester,
        removeSemester,
    } = useStudyActions({ commitDataUpdate });
    const {
        fileInputRef,
        isImporting,
        showImportGuide,
        showImportLoadingToast,
        gradeImportTurnstileToken,
        setGradeImportTurnstileToken,
        pendingTranscriptImport,
        isConfirmingTranscriptImport,
        openImportGuide,
        closeImportGuide,
        exportTranscriptPdf: handleExportPDF,
        handleFileUpload,
        handleDroppedFile,
        updatePendingSemesters,
        cancelPendingImport,
        confirmTranscriptImport: handleConfirmTranscriptImport,
    } = useTranscriptTransfer({
        data,
        commitDataUpdate,
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
    const {
        showPasswordChange,
        showAccountPasswordOtpModal,
        setShowAccountPasswordOtpModal,
        currentPassword,
        setCurrentPassword,
        accountPasswordOtp,
        setAccountPasswordOtp,
        newPassword,
        setNewPassword,
        confirmNewPassword,
        setConfirmNewPassword,
        showCurrentPassword,
        setShowCurrentPassword,
        showNewPassword,
        setShowNewPassword,
        isAccountPasswordOtpMode,
        accountPasswordOtpCooldownRemaining,
        passwordChangeLoading,
        passwordChangeError,
        passwordChangeNotice,
        accountPasswordTurnstileToken,
        setAccountPasswordTurnstileToken,
        startPasswordChange,
        cancelPasswordChange,
        changeAccountPassword: handleChangeAccountPassword,
        forgotAccountPassword: handleForgotAccountPassword,
    } = useAccountPassword({
        settingsOpen: showAccountSettings,
        session,
        setPasswordSetAt,
    });
    const navigateToLogin = useCallback(() => {
        navigate('/login', { replace: true });
    }, [navigate]);
    const {
        showResetModal,
        resetStep,
        otpDigits,
        isSendingOtp,
        isDeletingAccount,
        otpError,
        resendCountdown,
        deleteTurnstileToken,
        setDeleteTurnstileToken,
        closeDeleteAccountModal,
        resetDeleteAccountModal,
        requestDeleteAccount: handleRequestReset,
        continueDeleteAccount,
        backToDeleteIntro,
        backToDeleteVerification,
        sendOtpEmail,
        updateOtpDigit,
        pasteOtp,
        verifyTurnstileAndSendOtp: handleVerifyTurnstileAndSendOtp,
        verifyOtpAndReset,
    } = useDeleteAccount({
        session,
        onCloseUserMenu: () => setIsUserMenuOpen(false),
        onNavigateToLogin: navigateToLogin,
    });
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

        // ✨ FIX LỖI TS 2: Ép kiểu component MobileProfile để tránh bị TS soi lỗi thiếu props
        const MobileProfileComponent = MobileProfile as any;

        const desktopRoutes = (
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={
                    <div className="animate-fadeIn">
                        <Dashboard
                            data={data}
                            onSetSemesters={setSemesters}
                            onSaveSemesters={saveSemestersNow}
                            isGuest={isGuest}
                            currentUserId={session?.user?.id || null}
                            onRequireOnboarding={() => navigate('/onboarding')}
                            onTargetChange={setTargetGPA}
                            showSecurityNotice={!session}
                            onUpdateSemester={updateSemester}
                            onRemoveSemester={removeSemester}
                            onAddSemester={addSemester}
                            onExportPDF={handleExportPDF}
                            onImportPDF={openImportGuide}
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
                <Route path="/learning" element={<MobileLearning data={data} onSetSemesters={setSemesters} onSaveSemesters={saveSemestersNow} isGuest={isGuest} onRequireOnboarding={() => navigate('/onboarding')} onTargetChange={setTargetGPA} showSecurityNotice={!session} onUpdateSemester={updateSemester} onRemoveSemester={removeSemester} onAddSemester={addSemester} onExportPDF={handleExportPDF} onImportPDF={openImportGuide} isImporting={isImporting} fileInputRef={fileInputRef} onFileUpload={handleFileUpload} viewUserId={viewingUser?.id} isManagementUser={isAdmin || isAuditor} />} />
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
                        onChange={updatePendingSemesters}
                        onCancel={cancelPendingImport}
                        onConfirm={handleConfirmTranscriptImport}
                    />
                )}

                {showImportGuide && (
                    <ImportGuideModal
                        onClose={closeImportGuide}
                        securitySlot={<TurnstileBox token={gradeImportTurnstileToken} onTokenChange={setGradeImportTurnstileToken} />}
                        canSelectFile={Boolean(gradeImportTurnstileToken)}
                        onFileClick={() => fileInputRef.current?.click()}
                        onFileDrop={handleDroppedFile}
                    />
                )}

                {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}
                {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}

                <DeleteAccountModal
                    open={showResetModal}
                    step={resetStep}
                    email={session?.user.email || ''}
                    otpDigits={otpDigits}
                    error={otpError}
                    sendingOtp={isSendingOtp}
                    deletingAccount={isDeletingAccount}
                    resendCountdown={resendCountdown}
                    turnstileToken={deleteTurnstileToken}
                    onTurnstileTokenChange={setDeleteTurnstileToken}
                    onClose={closeDeleteAccountModal}
                    onContinue={continueDeleteAccount}
                    onBackToIntro={backToDeleteIntro}
                    onBackToVerification={backToDeleteVerification}
                    onSendOtp={sendOtpEmail}
                    onOtpDigitChange={updateOtpDigit}
                    onOtpPaste={pasteOtp}
                    onVerifyTurnstileAndSendOtp={handleVerifyTurnstileAndSendOtp}
                    onConfirm={verifyOtpAndReset}
                />

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
                                    onStartPasswordChange={startPasswordChange}
                                    onCurrentPasswordChange={setCurrentPassword}
                                    onOtpChange={setAccountPasswordOtp}
                                    onNewPasswordChange={setNewPassword}
                                    onConfirmNewPasswordChange={setConfirmNewPassword}
                                    onToggleCurrentPasswordVisibility={() => setShowCurrentPassword(previous => !previous)}
                                    onToggleNewPasswordVisibility={() => setShowNewPassword(previous => !previous)}
                                    onCancelPasswordChange={cancelPasswordChange}
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

                <PwaInstallInstructionsModal
                    open={showIOSInstructions}
                    onClose={dismissIOSInstructions}
                />
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
                <PasswordSetupSchemaWarning
                    open={passwordSetupSchemaMissing && !isPrivilegedUser}
                />
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
