import { Suspense, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { ProtectedAppRoutes } from '../app/routing/ProtectedAppRoutes';
import { ProtectedAppShell } from '../app/shell/ProtectedAppShell';
import { AppAiAdvisorOverlay } from '../components/AppAiAdvisorOverlay';
import { useAppMode } from '../hooks/useAppMode';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';

function Fixture() {
  const location = useLocation(), navigate = useNavigate(), mode = useAppMode(location.search);
  // Fixture identity persists across real NavLink navigation, like the app session.
  const [role] = useState(() => new URLSearchParams(location.search).get('role') || 'student');
  const [userMenu, setUserMenu] = useState(false), [draft, setDraft] = useState('Keep page state');
  const isAdmin = role === 'admin', isAuditor = role === 'auditor', isGuest = role === 'guest';
  return <ProtectedAppShell
    mobileLayout={mode.useMobileLayout} mobileScreen={mode.isMobileScreen} mobileBrowser={mode.isMobileBrowser}
    session={isGuest ? null : { user: { id: 'fixture-user', email: 'fixture@example.invalid' } } as any}
    isGuest={isGuest} isAdmin={isAdmin} isAuditor={isAuditor} viewingUser={null}
    displayName={`${role} fixture`} studentId="123456" avatarUrl="" avatarSeed="F"
    adminSearchMssv="" isSearchingUser={false} userMenuOpen={userMenu} showInstallButton={false}
    passwordSetupSchemaMissing={false} isPrivilegedUser={isAdmin || isAuditor} requiresPasswordSetup={false}
    setAdminSearchMssv={() => {}} onAdminSearchUser={e => e.preventDefault()} onRequestDeleteAccount={() => {}}
    onLogout={() => {}} setGuideOpen={() => {}} setActivityLogOpen={() => {}} setUserMenuOpen={setUserMenu}
    setAccountSettingsOpen={() => {}} onMenuLogout={() => {}} onNavigate={path => navigate(path + location.search)}
    onInstallApp={() => {}} onPasswordSetupComplete={() => {}}
    overlays={<AppAiAdvisorOverlay userId={isGuest ? undefined : 'fixture-user'} mobileScreen={mode.isMobileScreen} mobileLayout={mode.useMobileLayout} showHint={false} />}
  >
    <output id="mode" className="sr-only">{mode.useMobileLayout ? 'standalone' : mode.isMobileBrowser ? 'browser' : 'desktop'}</output>
    {location.pathname.startsWith('/support') || location.pathname.startsWith('/admin/support') ? <Suspense fallback={<p>Loading Ticket fixture</p>}>
      <ProtectedAppRoutes {...{
        mobileLayout: mode.useMobileLayout, data: { semesters: [] }, studyActions: {}, transcript: {},
        isGuest, hasSession: !isGuest, sessionUserId: isGuest ? null : 'fixture-user', sessionStudentCode: '123456',
        isAdmin, isAuditor, displayName: 'Fixture', profileAvatarUrl: '', avatarSeed: 'F', profileRefreshKey: 0,
        showInstallButton: false, onRequireOnboarding: () => {}, setAccountSettingsOpen: () => {},
        onRequestDeleteAccount: () => {}, onInstallApp: () => {}, saveSemestersNow: async () => {},
      } as any} />
    </Suspense> : <>
      <div id="page-anchor" style={{ height: 1800 }}>Isolated local page — {location.pathname}</div>
      <label>Background draft<input id="background-draft" value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <button id="background-action">Background action</button><div style={{ height: 1000 }} />
    </>}
  </ProtectedAppShell>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Fixture /></BrowserRouter></StrictMode>);
