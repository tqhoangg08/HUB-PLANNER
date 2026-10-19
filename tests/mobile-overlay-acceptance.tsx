import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link } from 'react-router-dom';
import { MobileAppLayout } from '../layouts/MobileAppLayout';
import { DesktopLayout } from '../layouts/DesktopLayout';
import { ScholarshipShell } from '../features/scholarships/ScholarshipShell';
import { createDefaultEventFilters } from '../utils/eventFilters';
import { scenes, subject, semester, student, course, event, item, draft } from './mobile-overlay-scenes.mjs';
import '../index.css';

document.documentElement.classList.add('mobile-browser');
document.body.style.setProperty('overflow-y', 'auto', 'important');
document.body.style.color = 'rgb(12, 34, 56)';
const noop = () => {};
const session = { user: { id: 'fixture-user', email: student.email, user_metadata: { full_name: student.full_name } } };
function Acceptance() {
  const [active, setActive] = useState<any>(null);
  const [model, setModel] = useState<any>({});
  const close = () => setActive(null);
  Object.assign(window, { acceptance: {
    scenes,
    ready: active?.scene.key,
    async mount(key: string) {
      const scene = scenes.find(s => s.key === key)!;
      const mod = await import(/* @vite-ignore */ `/${scene.file}`);
      setModel({ otp: '', newPassword: '', confirmNewPassword: '', value: '', semesters: [semester], rows: Array.from({ length: 8 }, (_, i) => ({ previewId: `row-${i}`, course: { ...course, course_code: `ECO10${i}` }, isSystemCourse: false, source: 'fixture', warnings: [] })) });
      setActive({ scene, Component: mod[scene.owner] || mod.default });
    },
    unmount: close,
  } });
  const props: any = {
    isOpen: true, open: true, onClose: close, onCancel: close, onDone: close, onComplete: close, close,
    email: student.email, eventId: 'fixture-event', eventName: event.name, currentUserId: 'fixture-user',
    onShowToast: noop, onReplace: async () => {}, fetchEvents: async () => {},
    isAdmin: active?.scene.short !== 'FloatingSupportTab', isAuditor: false, isGuest: false, isMobileLayout: true, onExport: noop,
    subjects: semester.subjects, stats: Array.from({ length: 10 }, (_, i) => ({ yearId: `${2020+i}`, label: `Năm học ${2020+i}`, hasData: true, rawGPA4: 3.5, rawGPA10: 8, totalCredits: 30, passedCredits: 30, averageTrainingScore: 90 })),
    yearOptions: [{ yearId: '2026-2027', label: 'Năm học 2026-2027', semesterCount: 2 }],
    onExportFull: noop, onExportFullExcel: noop, onExportYear: noop, onExportYearExcel: noop,
    semester: active?.scene.short === 'SemesterTable' ? semester : 'HK1_2026_2027', courses: [course], eventCount: 20,
    index: 0, allSemesterOptions: [semester.name], usedSemesterNames: [], onUpdateSemester: noop, onRemoveSemester: noop, onCascadeUpdate: noop, isReadOnly: false,
    data: { ...student.data, gpa4: 3.5, trainingScore: 90, rank: 15, totalStudents: 1000 },
    onSetSemesters: noop, onRequireOnboarding: noop, onTargetChange: noop, onAddSemester: noop, onExportPDF: noop, onImportPDF: noop, fileInputRef: { current: null }, onFileUpload: noop,
    event, editingEvent: event, item, type: 'FOUND', requestIntent: 'report',
    candidate: { id: 'fixture-candidate', source_name: 'Đoàn trường', raw_content: event.description, post_url: '/fixture-event', ai_result: {} }, draft,
    onDraftChange: (draft: any) => setModel((m: any) => ({ ...m, draft })), onAnalyze: noop, onRetryDrl: noop, onApprove: noop, onReject: noop, onBannerSelect: noop, onBannerClear: noop,
    onFileClick: noop, canSelectFile: true, isSaving: false, onConfirm: noop,
    filters: createDefaultEventFilters(), onChange: (value: any) => setModel((m: any) => ({ ...m, [Array.isArray(value) && value[0]?.subjects ? 'semesters' : Array.isArray(value) ? 'rows' : 'filters']: value })), regions: ['Trong trường', 'Ngoài trường'], eventTypes: ['Tình nguyện', 'Hội thảo'], onOpenGuide: noop,
    error: null, notice: null, loading: false, saving: false, canSave: true, onSave: noop, mobile: true,
    cooldownRemaining: 0, onResendOtp: noop, showNewPassword: false,
    onOtpChange: (otp: string) => setModel((m: any) => ({ ...m, otp })),
    onNewPasswordChange: (newPassword: string) => setModel((m: any) => ({ ...m, newPassword })),
    onConfirmNewPasswordChange: (confirmNewPassword: string) => setModel((m: any) => ({ ...m, confirmNewPassword })),
    onToggleNewPasswordVisibility: noop, onSubmit: (e: any) => e.preventDefault(),
    step: 1, otpDigits: ['', '', '', '', '', ''], sendingOtp: false, deletingAccount: false, resendCountdown: 0, turnstileToken: '', onTurnstileTokenChange: noop, onContinue: noop,
    title: 'Học bổng kiểm thử', busy: false,
    children: <div><label>Ghi chú<input value={model.value || ''} onChange={e => setModel((m: any) => ({ ...m, value: e.target.value }))} /></label><div style={{ height: 1200 }}>Nội dung kiểm thử cuộn</div><button onClick={close}>Đóng</button></div>,
    ...model,
  };
  if (active?.scene.owner === 'SemesterTable') props.semester = semester;
  const Component = active?.Component;
  const layout = new URLSearchParams(location.search).get('layout');
  const Host: any = layout === 'scholarship' ? ScholarshipShell : layout === 'staff' || layout === 'student' ? DesktopLayout : MobileAppLayout;
  const hostProps: any = { session, isGuest: false, isAdmin: layout === 'staff', isAuditor: false, viewingUser: null, displayName: student.full_name, studentId: student.student_code, avatarUrl: '', avatarSeed: 'F', adminSearchMssv: '', isSearchingUser: false, isMobileBrowser: true, setAdminSearchMssv: noop, handleAdminSearchUser: noop, handleRequestReset: noop, handleLogout: noop, setShowGuide: noop, setShowActivityLog: noop, setIsUserMenuOpen: noop, isUserMenuOpen: false, setShowAccountSettings: noop, handleMenuLogout: noop, navigate: noop };
  return <>
    <Host {...hostProps}>
      <div style={{ padding: 20 }}><h1>HUB Planner — nghiệm thu local</h1><p>Sinh viên kiểm thử · dữ liệu cô lập</p><div style={{ height: 1600 }} /><button id="fixture-open" onClick={() => { if (!active) void (window as any).acceptance.mount(new URLSearchParams(location.search).get('scene') || scenes[0].key); }}>Mở popup kiểm thử</button><Link to="/next">Chuyển trang</Link><div style={{ height: 1600 }} /></div>
    </Host>
    {Component && <Component {...props} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Acceptance /></BrowserRouter></StrictMode>);
