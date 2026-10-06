import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DesktopLayout } from '../layouts/DesktopLayout';
import '../index.css';

const params = new URLSearchParams(location.search);
const isAdmin = params.get('role') !== 'auditor';

function Harness() {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  return <BrowserRouter><DesktopLayout
    session={{ user: { id: 'fixture' } }} isGuest={false} isAdmin={isAdmin} isAuditor={!isAdmin}
    viewingUser={null} displayName="Staff fixture" studentId="" avatarUrl="" avatarSeed="S"
    adminSearchMssv="" isSearchingUser={false} setAdminSearchMssv={() => {}}
    handleAdminSearchUser={event => event.preventDefault()} handleRequestReset={() => {}}
    handleLogout={() => {}} setShowGuide={() => {}} setShowActivityLog={() => {}}
    setIsUserMenuOpen={setIsUserMenuOpen} isUserMenuOpen={isUserMenuOpen}
    setShowAccountSettings={() => {}} handleMenuLogout={() => {}} navigate={() => {}}
  ><main>Staff content</main></DesktopLayout></BrowserRouter>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
