import { Suspense, StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { ProtectedAppRoutes } from '../app/routing/ProtectedAppRoutes';
import { ProtectedAppShell } from '../app/shell/ProtectedAppShell';
import { AppAiAdvisorOverlay } from '../components/AppAiAdvisorOverlay';
import { useAppMode } from '../hooks/useAppMode';
import { ScholarshipList } from '../features/scholarships/ScholarshipList';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';
import { student } from './mobile-overlay-scenes.mjs';
function Fixture() {
  const location = useLocation(),
    navigate = useNavigate(),
    mode = useAppMode(location.search);
  // Fixture identity persists across real NavLink navigation, like the app session.
  const [role] = useState(() => new URLSearchParams(location.search).get('role') || 'student');
  const [userMenu, setUserMenu] = useState(false);
  const [onboardingOpens, setOnboardingOpens] = useState(0);
  const [data, setData] = useState(() => {
    const query = new URLSearchParams(location.search);
    const data = structuredClone(student.data);
    if (query.has('onboardedGuest')) data.hasOnboarded = true;
    if (query.has('emptyTranscript')) data.semesters = [];
    else if (query.has('emptySemester')) data.semesters = data.semesters.map(semester => ({ ...semester, subjects: [] }));
    return data;
  });
  const saveAttempts = useRef(0);
  const [importOpens, setImportOpens] = useState(0);
  const isAdmin = role === 'admin',
    isAuditor = role === 'auditor',
    isGuest = role === 'guest';
  // Public auth lives outside ProtectedAppRoutes in the real app. A terminal
  // fixture route verifies login navigation without mounting auth or its APIs.
  if (location.pathname === '/login') return <main><h1>Đăng nhập (fixture)</h1><output id="onboarding-opens">{onboardingOpens}</output></main>;
  if (location.pathname.startsWith('/scholarships')) return <><output id="mode" className="sr-only">scholarships</output><ScholarshipList /></>;
  return <ProtectedAppShell mobileLayout={mode.useMobileLayout} mobileScreen={mode.isMobileScreen} mobileBrowser={mode.isMobileBrowser} session={isGuest ? null : {
    user: {
      id: 'fixture-user',
      email: 'fixture@example.invalid'
    }
  } as any} isGuest={isGuest} isAdmin={isAdmin} isAuditor={isAuditor} viewingUser={null} displayName={`${role} fixture`} studentId="123456" avatarUrl="" avatarSeed="F" adminSearchMssv="" isSearchingUser={false} userMenuOpen={userMenu} showInstallButton={new URLSearchParams(location.search).has("install")} passwordSetupSchemaMissing={false} isPrivilegedUser={isAdmin || isAuditor} requiresPasswordSetup={false} setAdminSearchMssv={() => {}} onAdminSearchUser={e => e.preventDefault()} onRequestDeleteAccount={() => {}} onLogout={() => {}} setGuideOpen={() => {}} setActivityLogOpen={() => {}} setUserMenuOpen={setUserMenu} setAccountSettingsOpen={() => {}} onMenuLogout={() => {}} onNavigate={path => navigate(path + location.search)} onInstallApp={() => {}} onPasswordSetupComplete={() => {}} overlays={<AppAiAdvisorOverlay userId={isGuest ? undefined : 'fixture-user'} mobileScreen={mode.isMobileScreen} mobileLayout={mode.useMobileLayout} showHint={false} />}>
    <output id="mode" className="sr-only">{mode.useMobileLayout ? 'standalone' : mode.isMobileBrowser ? 'browser' : 'desktop'}</output>
    <output id="import-opens" className="sr-only">{importOpens}</output>
    <output id="onboarding-opens" className="sr-only">{onboardingOpens}</output>
    <Suspense fallback={<p>Loading route fixture</p>}><ProtectedAppRoutes {...{
        mobileLayout: mode.useMobileLayout,
        data,
        studyActions: {
          setSemesters: (semesters: any) => setData(previous => ({ ...previous, semesters })),
          setTargetGPA: (targetGPA: number) => setData(previous => ({ ...previous, targetGPA })),
          updateSemester: () => {},
          removeSemester: () => {},
          addSemester: () => {}
        },
        transcript: {
          exportTranscriptPdf: () => {},
          openImportGuide: () => setImportOpens(count => count + 1),
          isImporting: false,
          fileInputRef: {
            current: null
          },
          handleFileUpload: () => {}
        },
        isGuest,
        hasSession: !isGuest,
        sessionUserId: isGuest ? null : 'fixture-user',
        sessionStudentCode: '000000000001',
        isAdmin,
        isAuditor,
        displayName: 'Sinh viên kiểm thử',
        profileAvatarUrl: '',
        avatarSeed: 'F',
        profileRefreshKey: 0,
        showInstallButton: false,
        onRequireOnboarding: () => setOnboardingOpens(count => count + 1),
        setAccountSettingsOpen: () => {},
        onRequestDeleteAccount: () => {},
        onInstallApp: () => {},
        saveSemestersNow: async (semesters: any) => {
          saveAttempts.current += 1;
          if (new URLSearchParams(location.search).has('failSaveOnce') && saveAttempts.current === 1) throw new Error('Không thể lưu bảng điểm lúc này');
          setData(previous => ({ ...previous, semesters }));
        }
      } as any} /></Suspense>
  </ProtectedAppShell>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }}><Fixture /></BrowserRouter></StrictMode>);
