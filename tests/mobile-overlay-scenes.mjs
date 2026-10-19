import inventory from './mobile-overlay-inventory.json' with { type: 'json' };

export const subject = { id: 'fixture-subject', name: 'Kinh tế học kiểm thử', credits: 3, scoreCC: 8, scoreProcess: 8, scoreMid: 8, scoreFinal: 8, avg: 8, scale4: 3.5, letter: 'B+', semName: 'Học kỳ 1 Năm học 2026-2027' };
export const semester = { id: 'fixture-semester', name: 'Học kỳ 1 Năm học 2026-2027', trainingScore: 90, subjects: Array.from({ length: 18 }, (_, i) => ({ ...subject, id: `subject-${i}`, name: `${subject.name} ${i + 1}` })) };
export const student = { id: 'fixture-user', user_id: 'fixture-user', student_code: '000000000001', email: '000000000001@st.buh.edu.vn', email_masked: '000***@st.buh.edu.vn', full_name: 'Sinh viên kiểm thử', class_name: 'DH42', cohort: 'K42', status: 'onboarded', gpa4: 3.5, gpa10: 8, credits: 54, data: { studentName: 'Sinh viên kiểm thử', semesters: [semester], targetGPA: 3.6 } };
export const course = { id: 'fixture-course', user_schedule_id: 'fixture-schedule', subject_name: 'Kinh tế học kiểm thử', course_code: 'ECO101', instructor: 'Giảng viên kiểm thử', semester: 'HK1_2026_2027', day_of_week: '2', shift: '1-3', room: 'A101', weeks: '1-15', start_date: '2026-09-07', end_date: '2026-12-21', labels: [], original_course: {}, sessions: [] };
export const event = { id: 'fixture-event', name: 'Ngày hội sinh viên kiểm thử', title: 'Ngày hội sinh viên kiểm thử', description: 'Nội dung sự kiện. '.repeat(70), type: 'Hoạt động phong trào', category: 'III', score: '5', organizer: 'Đoàn trường', event_date: '2026-11-20', event_time: '08:00', deadline: '2026-11-19', deadline_time: '23:59', location: 'Hội trường', link: '/fixture-event', status: 'open', recognition_type: 'Không có / Chưa xác định' };
export const item = { id: 101, created_at: '2026-10-18T08:00:00Z', type: 'FOUND', title: 'Ví sinh viên kiểm thử', description: 'Mô tả đồ vật kiểm thử. '.repeat(70), location: 'Thư viện', contact_info: 'fixture@example.invalid', user_name: 'Sinh viên kiểm thử', image_url: null, status: 'approved', is_deleted: false, user_id: 'fixture-user' };
export const draft = { title: event.name, organizer: 'Đoàn trường', category: event.type, criteria: 'III', points: '5', drl_rule_id: '', recognition_type: event.recognition_type, recognition_note: '', format: 'Offline', link: '/fixture-event', location_type: 'Trong trường', classification: '', event_date: event.event_date, event_time: '08:00', deadline: '2026-11-19', deadline_time: '23:59', registration_start_date: '2026-10-18', registration_start_time: '08:00', description: event.description, status: 'open', close_on_full: false, is_manually_closed: false, image_url: '' };
const stateByFile = {
  'Dashboard': { 5: { showRankMenu: true }, 6: { pendingNavigation: '/events' } },
  'MobileDashboard': { 4: { showRankMenu: true }, 5: { selectedStudent: student } },
  'MobileLearning': { 2: { pendingTab: 'schedule' }, 3: { showTargetModal: true } },
  'MobileEvents': { 4: { editingEvent: event, eventEditData: draft } },
  'MobileProfile': { 1: { showNotificationSettings: true } },
  'Handbook': { 1: { activeTab: 'canva', isCanvaModalOpen: true } },
  'MobileHandbook': { 1: { activeTab: 'canva', isCanvaModalOpen: true } },
  'FloatingSupportTab': { 1: { isOpen: true } },
  'PushNotificationPrompt': { 1: { showPrompt: true } },
  'SchoolAnnouncements': { 1: { isModalOpen: true } },
  'EventFilterControls': { 1: { drawerOpen: true } },
  'AdminInternalAccounts': { 1: { open: true }, 2: { resetTarget: { ...student, role: 'auditor', active: true } } },
  'AdminStudentManagement': { 1: { selected: student }, 2: { createOpen: true } },
  'AdminEventEditorPage': { 1: { preview: true, draft } },
  'MobileSchedule': {
    1: { isAdminEditModalOpen: true, adminEditData: course }, 2: { selectedChangedCourse: course },
    3: { selectedCourseInfo: { course } }, 4: { quickTagCourse: course },
    5: { isMyScheduleModalOpen: true, mySchedule: [course] },
    6: { isStudentEditModalOpen: true, studentEditData: course }, 7: { isReportModalOpen: true }, 8: { isCreateCourseModalOpen: true },
  },
  'ScheduleBoard': {
    1: { showScheduleUpdateNotice: true, changedUserScheduleCourses: [course] }, 2: { isFilterExpanded: true, isAdminView: false },
    3: { isCourseResultsOpen: true, isAdminView: false, availableCourses: [course] }, 4: { selectedCourseInfo: { course } },
    5: { isMyScheduleModalOpen: true, mySchedule: [course] }, 6: { isReportModalOpen: true }, 7: { isCreateCourseModalOpen: true },
    8: { quickTagCourse: course }, 9: { isStudentEditModalOpen: true, studentEditData: course },
    10: { selectedChangedCourse: course }, 11: { isAdminEditModalOpen: true, adminEditData: course },
  },
};
export const scenes = inventory.map(row => {
  const short = row.file.split('/').at(-1).replace(/\.(tsx|jsx)$/, '');
  let group = /Schedule|Calendar/.test(short) ? 'schedule' : /Event|Drl/.test(short) ? 'events-drl' : /Dashboard|Learning|Ranking|Lookback|Transcript|ImportGuide/.test(short) ? 'learning' : /LostFound/.test(short) ? 'lost-found' : /Admin/.test(short) ? 'admin' : /Account|Password|Profile/.test(short) ? 'account' : /Scholarship/.test(row.file) ? 'scholarship' : 'notices-support';
  if (/^Admin/.test(short)) group = 'admin';
  return { ...row, key: `${short}-${row.id}`, group, state: stateByFile[short]?.[row.id] || {}, mandatory: /PasswordSetup/.test(short), fixtureOpen: Boolean(stateByFile[short]?.[row.id]), short };
});
