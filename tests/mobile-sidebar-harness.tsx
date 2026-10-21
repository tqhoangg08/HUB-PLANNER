import { StrictMode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { ProtectedAppShell } from '../app/shell/ProtectedAppShell';
import { AppAiAdvisorOverlay } from '../components/AppAiAdvisorOverlay';
import { Overlay } from '../components/Overlay';
import { useAppMode } from '../hooks/useAppMode';
import { fireOverlayAlert } from '../utils/overlayAlert';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';

function Nested({ close }: { close: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement;
    button.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [close]);
  return <Overlay className="fixed inset-0 z-[300000] flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-label="Nested fixture" className="rounded bg-white p-5">
      <button ref={button} onClick={close}>Close nested</button>
    </section>
  </Overlay>;
}
function Fixture() {
  const location = useLocation(), navigate = useNavigate(), mode = useAppMode(location.search);
  // Fixture identity persists across real NavLink navigation, like the app session.
  const [role] = useState(() => new URLSearchParams(location.search).get('role') || 'student');
  const [userMenu, setUserMenu] = useState(false), [nested, setNested] = useState(false), [draft, setDraft] = useState('Keep page state');
  const closeNested = useCallback(() => setNested(false), []);
  Object.assign(window, { sidebarHarness: {
    nested: () => setNested(true), navigate: (path: string) => navigate(path + location.search),
    alert: () => void fireOverlayAlert({ title: 'Drawer confirmation', showCancelButton: true, confirmButtonText: 'Confirm fixture', cancelButtonText: 'Cancel fixture', customClass: { container: 'hub-alert-container' } }),
  } });
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
    overlays={<><AppAiAdvisorOverlay userId={isGuest ? undefined : 'fixture-user'} mobileScreen={mode.isMobileScreen} mobileLayout={mode.useMobileLayout} showHint={false} />
      {nested && <Nested close={closeNested} />}</>}
  >
    <output id="mode" className="sr-only">{mode.useMobileLayout ? 'standalone' : mode.isMobileBrowser ? 'browser' : 'desktop'}</output>
    <div id="page-anchor" style={{ height: 1800 }}>Isolated local page — {location.pathname}</div>
    <label>Background draft<input id="background-draft" value={draft} onChange={e => setDraft(e.target.value)} /></label>
    <button id="background-action">Background action</button>
    <div style={{ height: 1000 }} />
  </ProtectedAppShell>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Fixture /></BrowserRouter></StrictMode>);
