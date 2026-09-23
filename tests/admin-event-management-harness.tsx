import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminEventManagementView } from '../components/AdminEventManagementView';
import { createDefaultEventFilters } from '../utils/eventFilters';
import type { AdminManagementEvent } from '../utils/adminEventManagement';

const params = new URLSearchParams(window.location.search);
const isAdmin = params.get('role') !== 'auditor';
const count = Number(params.get('count') || 15);
const events: AdminManagementEvent[] = Array.from({ length: count }, (_, index) => ({
  id: String(index + 1), name: `Sự kiện ${index + 1}`, organizer: 'Đoàn trường',
  type: 'Hội thảo', category: index % 2 ? 'IV' : 'I', scope: 'Trong trường', score: '5',
  status: 'Sắp diễn ra', created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  event_date: '2099-09-30', event_time: '08:00', deadlineDate: new Date('2099-09-25'),
  deadline_time: null, registration_start_date: '2026-09-01', is_manually_closed: false,
  is_deleted: false, close_on_full: false, location: 'Offline', classification: '',
}));

const Harness = () => {
  const [filters, setFilters] = useState(createDefaultEventFilters);
  return <AdminEventManagementView events={events} filters={filters} onFiltersChange={setFilters}
    loading={params.has('loading')} error={params.has('error') ? 'Không tải được sự kiện' : null}
    isAdmin={isAdmin} onAdd={() => {}} onRefresh={() => {}} onPreview={() => {}}
    onGuide={() => {}} onView={() => {}} onEdit={() => {}} onToggleClose={() => {}} onDelete={() => {}}/>;
};
createRoot(document.getElementById('root')!).render(<Harness/>);
