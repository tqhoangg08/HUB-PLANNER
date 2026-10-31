import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DesktopLayout } from '../layouts/DesktopLayout';
import { AdminSchoolAnnouncements } from '../components/AdminSchoolAnnouncements';
import SchoolAnnouncements from '../components/SchoolAnnouncements';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';

const params=new URLSearchParams(location.search), isAdmin=params.get('role')!=='auditor';
history.replaceState(null,'',`/admin/announcements?${params}`);
function Harness(){
  const [isUserMenuOpen,setIsUserMenuOpen]=useState(false);
  return <BrowserRouter><DesktopLayout
    session={{user:{id:'fixture'}}} isGuest={false} isAdmin={isAdmin} isAuditor={!isAdmin}
    viewingUser={null} displayName="Quản trị viên" studentId="" avatarUrl="" avatarSeed="AD"
    adminSearchMssv="" isSearchingUser={false} setAdminSearchMssv={()=>{}}
    handleAdminSearchUser={event=>event.preventDefault()} handleRequestReset={()=>{}}
    handleLogout={()=>{}} setShowGuide={()=>{}} setShowActivityLog={()=>{}}
    setIsUserMenuOpen={setIsUserMenuOpen} isUserMenuOpen={isUserMenuOpen}
    setShowAccountSettings={()=>{}} handleMenuLogout={()=>{}} navigate={()=>{}}
  >{params.has('student')?<SchoolAnnouncements/>:<AdminSchoolAnnouncements isAdmin={isAdmin}/>}</DesktopLayout></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
