import type { Semester, UserData } from '../../types';
import type { StudyActionsController } from '../../hooks/useStudyActions';
import type { TranscriptTransferController } from '../../hooks/useTranscriptTransfer';
import { ActivityLogModal } from '../../components/ActivityLogModal';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { isOwnProfileRoute } from '../../utils/profileRouteApi';
import {
    AdminEventCandidates,
    AdminAIDocuments,
    AdminInternalAccounts,
    AdminReports,
    AdminSupportTickets,
    CloudflareDataAdmin,
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
} from './lazyScreens';

interface ProtectedAppRoutesProps {
    mobileLayout: boolean;
    data: UserData;
    studyActions: StudyActionsController;
    saveSemestersNow: (semesters: Semester[]) => Promise<void>;
    transcript: TranscriptTransferController;
    isGuest: boolean;
    hasSession: boolean;
    sessionUserId: string | null;
    sessionStudentCode: string;
    viewingUserId?: string;
    isAdmin: boolean;
    isAuditor: boolean;
    displayName: string;
    profileAvatarUrl: string;
    avatarSeed: string;
    profileRefreshKey: number;
    showInstallButton: boolean;
    onRequireOnboarding: () => void;
    setAccountSettingsOpen: (open: boolean) => void;
    onRequestDeleteAccount: () => void;
    onInstallApp: () => void;
}

const MobileProfileRoute = ({
    sessionStudentCode,
    sessionUserId,
    profileRefreshKey,
    setAccountSettingsOpen,
    onRequestDeleteAccount,
    onInstallApp,
    showInstallButton,
}: {
    sessionStudentCode: string;
    sessionUserId: string | null;
    profileRefreshKey: number;
    setAccountSettingsOpen: (open: boolean) => void;
    onRequestDeleteAccount: () => void;
    onInstallApp: () => void;
    showInstallButton: boolean;
}) => {
    const { id } = useParams();
    const MobileProfileComponent = MobileProfile as any;

    if (isOwnProfileRoute(id, sessionStudentCode)) {
        return (
            <MobileProfileComponent
                setShowAccountSettings={setAccountSettingsOpen}
                handleRequestReset={onRequestDeleteAccount}
                onInstallApp={onInstallApp}
                showInstallButton={showInstallButton}
            />
        );
    }

    return (
        <ProfilePage
            refreshKey={profileRefreshKey}
            currentUserId={sessionUserId}
            currentStudentCode={sessionStudentCode}
            onEditProfile={() => setAccountSettingsOpen(true)}
        />
    );
};

export const ProtectedAppRoutes = ({
    mobileLayout,
    data,
    studyActions,
    saveSemestersNow,
    transcript,
    isGuest,
    hasSession,
    sessionUserId,
    sessionStudentCode,
    viewingUserId,
    isAdmin,
    isAuditor,
    displayName,
    profileAvatarUrl,
    avatarSeed,
    profileRefreshKey,
    showInstallButton,
    onRequireOnboarding,
    setAccountSettingsOpen,
    onRequestDeleteAccount,
    onInstallApp,
}: ProtectedAppRoutesProps) => {
    const isManagementUser = isAdmin || isAuditor;
    // Admin/auditor navigation is rendered by the shared responsive sidebar,
    // including on a phone. Student-facing mobile routes remain unchanged.
    if (mobileLayout && !isManagementUser) {
        return (
            <Routes>
                <Route path="/" element={<Navigate to="/mobile-home" replace />} />
                <Route
                    path="/mobile-home"
                    element={(
                        <MobileHome
                            data={data}
                            displayName={displayName}
                            avatarUrl={profileAvatarUrl}
                            avatarSeed={avatarSeed}
                            isGuest={isGuest}
                            showSecurityNotice={!hasSession}
                            onRequireOnboarding={onRequireOnboarding}
                        />
                    )}
                />
                <Route
                    path="/learning"
                    element={(
                        <MobileLearning
                            data={data}
                            onSetSemesters={studyActions.setSemesters}
                            onSaveSemesters={saveSemestersNow}
                            isGuest={isGuest}
                            onRequireOnboarding={onRequireOnboarding}
                            onTargetChange={studyActions.setTargetGPA}
                            showSecurityNotice={!hasSession}
                            onUpdateSemester={studyActions.updateSemester}
                            onRemoveSemester={studyActions.removeSemester}
                            onAddSemester={studyActions.addSemester}
                            onExportPDF={transcript.exportTranscriptPdf}
                            onImportPDF={transcript.openImportGuide}
                            isImporting={transcript.isImporting}
                            fileInputRef={transcript.fileInputRef}
                            onFileUpload={transcript.handleFileUpload}
                            viewUserId={viewingUserId}
                            isManagementUser={isManagementUser}
                        />
                    )}
                />
                <Route path="/events" element={<MobileEvents viewUserId={viewingUserId} />} />
                <Route path="/events/edit/:eventId" element={<MobileEvents viewUserId={viewingUserId} />} />
                <Route path="/events/:eventId" element={<MobileEvents viewUserId={viewingUserId} />} />
                <Route path="/lost-found" element={<MobileLostFound />} />
                <Route path="/support" element={<SupportTickets />} />
                <Route path="/support/new" element={<SupportTickets />} />
                <Route path="/support/:ticketId" element={<SupportTickets />} />
                <Route path="/handbook/:tab?" element={<MobileHandbook />} />
                <Route path="/handbook" element={<MobileHandbook />} />
                <Route path="/terms" element={<MobileHandbook forcedTab="terms" />} />
                <Route path="/privacy" element={<MobileHandbook forcedTab="privacy" />} />
                <Route path="/admin-reports" element={isManagementUser ? <AdminReports /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/support" element={isManagementUser ? <AdminSupportTickets /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/support/:ticketId" element={isManagementUser ? <AdminSupportTickets /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/activity" element={isAdmin ? <ActivityLogModal /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/data" element={isAdmin ? <CloudflareDataAdmin /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/ai-documents" element={isAdmin ? <AdminAIDocuments /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/internal-accounts" element={isAdmin ? <AdminInternalAccounts /> : <Navigate to="/mobile-home" replace />} />
                <Route path="/admin/event-candidates" element={isManagementUser ? <AdminEventCandidates isAdmin={isAdmin} isAuditor={isAuditor} /> : <Navigate to="/mobile-home" replace />} />
                <Route
                    path="/profile/:id"
                    element={(
                        <MobileProfileRoute
                            sessionStudentCode={sessionStudentCode}
                            sessionUserId={sessionUserId}
                            profileRefreshKey={profileRefreshKey}
                            setAccountSettingsOpen={setAccountSettingsOpen}
                            onRequestDeleteAccount={onRequestDeleteAccount}
                            onInstallApp={onInstallApp}
                            showInstallButton={showInstallButton}
                        />
                    )}
                />
                <Route path="/profiles/search" element={<ProfileSearchPage />} />
                <Route path="/dashboard" element={<Navigate to="/mobile-home" replace />} />
                <Route path="*" element={<Navigate to="/mobile-home" replace />} />
            </Routes>
        );
    }

    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
                path="/dashboard"
                element={(
                    <div className="animate-fadeIn">
                        <Dashboard
                            data={data}
                            onSetSemesters={studyActions.setSemesters}
                            onSaveSemesters={saveSemestersNow}
                            isGuest={isGuest}
                            currentUserId={sessionUserId}
                            onRequireOnboarding={onRequireOnboarding}
                            onTargetChange={studyActions.setTargetGPA}
                            showSecurityNotice={!hasSession}
                            onUpdateSemester={studyActions.updateSemester}
                            onRemoveSemester={studyActions.removeSemester}
                            onAddSemester={studyActions.addSemester}
                            onExportPDF={transcript.exportTranscriptPdf}
                            onImportPDF={transcript.openImportGuide}
                            isImporting={transcript.isImporting}
                            fileInputRef={transcript.fileInputRef}
                            onFileUpload={transcript.handleFileUpload}
                        />
                    </div>
                )}
            />
            <Route
                path="/admin/students/*"
                element={isAdmin ? (
                    <Dashboard
                        data={data}
                        onSetSemesters={studyActions.setSemesters}
                        onSaveSemesters={saveSemestersNow}
                        isGuest={isGuest}
                        currentUserId={sessionUserId}
                        onRequireOnboarding={onRequireOnboarding}
                        onTargetChange={studyActions.setTargetGPA}
                        showSecurityNotice={!hasSession}
                        onUpdateSemester={studyActions.updateSemester}
                        onRemoveSemester={studyActions.removeSemester}
                        onAddSemester={studyActions.addSemester}
                        onExportPDF={transcript.exportTranscriptPdf}
                        onImportPDF={transcript.openImportGuide}
                        isImporting={transcript.isImporting}
                        fileInputRef={transcript.fileInputRef}
                        onFileUpload={transcript.handleFileUpload}
                    />
                ) : <Navigate to="/dashboard" replace />}
            />
            <Route path="/dashboard/admin/*" element={<Navigate to="/admin/students" replace />} />
            <Route path="/schedule" element={<ScheduleBoard viewUserId={viewingUserId} />} />
            <Route path="/schedule/:studentCode" element={<ScheduleBoard viewUserId={viewingUserId} />} />
            <Route path="/events" element={<EventsBoard viewUserId={viewingUserId} />} />
            <Route path="/events/edit/:eventId" element={<EventsBoard viewUserId={viewingUserId} />} />
            <Route path="/events/:eventId" element={<EventsBoard viewUserId={viewingUserId} />} />
            <Route path="/lost-found" element={<LostFoundBoard />} />
            <Route path="/support" element={<SupportTickets />} />
            <Route path="/support/new" element={<SupportTickets />} />
            <Route path="/support/:ticketId" element={<SupportTickets />} />
            <Route path="/handbook/:tab?" element={<Handbook />} />
            <Route
                path="/profile/:id"
                element={(
                    <ProfilePage
                        refreshKey={profileRefreshKey}
                        currentUserId={sessionUserId}
                        currentStudentCode={sessionStudentCode}
                        onEditProfile={() => setAccountSettingsOpen(true)}
                    />
                )}
            />
            <Route path="/profiles/search" element={<ProfileSearchPage />} />
            <Route path="/admin-reports" element={isManagementUser ? <AdminReports /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/support" element={isManagementUser ? <AdminSupportTickets /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/support/:ticketId" element={isManagementUser ? <AdminSupportTickets /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/activity" element={isAdmin ? <ActivityLogModal /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/data" element={isAdmin ? <CloudflareDataAdmin /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/ai-documents" element={isAdmin ? <AdminAIDocuments /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/internal-accounts" element={isAdmin ? <AdminInternalAccounts /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/event-candidates" element={isManagementUser ? <AdminEventCandidates isAdmin={isAdmin} isAuditor={isAuditor} /> : <Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
};
