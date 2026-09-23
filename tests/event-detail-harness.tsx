import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EventDetailView, type EventDetailData } from '../components/EventDetailView';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'student';
const missing = params.has('missing');
const event: EventDetailData = {
  id: '378', name: 'Ngày hội học thuật HUB', category: 'I', score: '5',
  location: 'Trực tiếp', time: '23/09/2026', deadlineDate: new Date('2026-09-20'),
  deadline_time: '17:00', close_on_full: false,
  description: 'Dòng đầu\nDòng tiếp theo', link: missing ? '' : 'https://example.org/event/378',
  organizer: 'Đoàn trường', type: 'Học thuật', classification: 'Cuộc thi',
  scope: 'Hội trường A', status: 'Đang mở đăng ký', is_manually_closed: false,
  is_deleted: false, created_at: '2026-09-01T00:00:00Z', event_date: '2026-09-23',
  event_time: '08:00', registration_start_date: '2026-09-01',
  registration_start_time: '08:00', image_url: missing ? null : 'https://example.org/banner.jpg',
};
const Harness = () => {
  const [action, setAction] = useState('');
  const [showDetail, setShowDetail] = useState(true);
  const [views, setViews] = useState<number | null>(null);
  return <main className="w-full bg-white p-3 sm:p-6">
    <button type="button" onClick={() => setShowDetail((current) => !current)}>Đổi trạng thái detail</button>
    {showDetail && <EventDetailView event={event} preview={role !== 'student'} canEdit={role === 'admin' || role === 'auditor'}
      isRegistrationClosed={false} isParticipated={false} onBack={() => {}}
      onEdit={() => setAction('edit')} onCopy={() => setAction('copy')}
      onToggleParticipation={() => setAction('save')} onReport={() => setAction('report')}
      onViewsUpdated={(_, count) => setViews(count)}/>}
    <output aria-label="Thao tác thử nghiệm">{action}</output>
    <output aria-label="Lượt xem thử nghiệm">{views}</output>
  </main>;
};
createRoot(document.getElementById('root')!).render(<Harness/>);
