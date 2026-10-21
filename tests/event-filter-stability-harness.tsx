import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { EventsBoard } from '../components/EventsBoard';
import { MobileEvents } from '../components/MobileEvents';
import { EventFilterControls } from '../components/event-filters/EventFilterControls';
import { DrlScoreGuideModal } from '../components/DrlScoreGuide';
import { createDefaultEventFilters } from '../utils/eventFilters';
import { ProtectedAppShell } from '../app/shell/ProtectedAppShell';
import { AppAiAdvisorOverlay } from '../components/AppAiAdvisorOverlay';
import { useAppMode } from '../hooks/useAppMode';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';
function Controlled() {
    const [filters, setFilters] = useState(createDefaultEventFilters), [revision, setRevision] = useState(0), [guide, setGuide] = useState(false);
    Object.assign(window, { filterHarness: { rerender: () => setRevision(n => n + 1), guide: () => setGuide(true) } });
    return <section data-revision={revision}>
    <EventFilterControls filters={filters} onChange={next => setFilters(next)} regions={['Trong trường', 'Ngoài trường']} eventTypes={['Hội thảo', 'Tình nguyện']} onRefresh={() => { }} onOpenGuide={() => setGuide(true)} onPrimaryAction={() => { }} extraActions={<button type="button" aria-label="Extra action">Extra action</button>}/>
    <output id="applied-filters" className="sr-only">{JSON.stringify(filters)}</output>
    <div id="results-anchor" style={{ height: 1200 }}>Stable result anchor</div>
    <DrlScoreGuideModal isOpen={guide} onClose={() => setGuide(false)}/>
  </section>;
}
function Fixture() {
    const location = useLocation(), navigate = useNavigate(), mode = useAppMode(location.search);
    // Fixture identity persists across real NavLink navigation, like the app session.
    const [role] = useState(() => new URLSearchParams(location.search).get('role') || 'student');
    const [userMenu, setUserMenu] = useState(false);
    const [controlled] = useState(() => new URLSearchParams(location.search).get('view') === 'controls');
    const isAdmin = role === 'admin', isAuditor = role === 'auditor', isGuest = role === 'guest';
    return <ProtectedAppShell mobileLayout={mode.useMobileLayout} mobileScreen={mode.isMobileScreen} mobileBrowser={mode.isMobileBrowser} session={isGuest ? null : { user: { id: 'fixture-user', email: 'fixture@example.invalid' } } as any} isGuest={isGuest} isAdmin={isAdmin} isAuditor={isAuditor} viewingUser={null} displayName={`${role} fixture`} studentId="123456" avatarUrl="" avatarSeed="F" adminSearchMssv="" isSearchingUser={false} userMenuOpen={userMenu} showInstallButton={false} passwordSetupSchemaMissing={false} isPrivilegedUser={isAdmin || isAuditor} requiresPasswordSetup={false} setAdminSearchMssv={() => { }} onAdminSearchUser={e => e.preventDefault()} onRequestDeleteAccount={() => { }} onLogout={() => { }} setGuideOpen={() => { }} setActivityLogOpen={() => { }} setUserMenuOpen={setUserMenu} setAccountSettingsOpen={() => { }} onMenuLogout={() => { }} onNavigate={path => navigate(path + location.search)} onInstallApp={() => { }} onPasswordSetupComplete={() => { }} overlays={<AppAiAdvisorOverlay userId={isGuest ? undefined : 'fixture-user'} mobileScreen={mode.isMobileScreen} mobileLayout={mode.useMobileLayout} showHint={false}/>}>
    <output id="mode" className="sr-only">{mode.useMobileLayout ? 'standalone' : mode.isMobileBrowser ? 'browser' : 'desktop'}</output>
    <div id="page-anchor" style={{ height: 1100 }}>Local event filter fixture</div>
    {controlled ? <Controlled /> : mode.useMobileLayout ? <MobileEvents /> : <EventsBoard />}
    <div style={{ height: 1200 }}/>
  </ProtectedAppShell>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Fixture /></BrowserRouter></StrictMode>);
