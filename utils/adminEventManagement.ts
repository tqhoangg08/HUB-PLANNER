import { SEMESTER_OPTIONS } from './academicCalendar.ts';
import {
  compareFilteredEvents,
  getEventRegistrationStatus,
  matchesEventFilters,
  type EventFilters,
  type FilterableEvent,
} from './eventFilters.ts';

export type AdminEventTab = 'all' | 'open' | 'upcoming' | 'closed';
export type AdminEventStatus = 'pending' | 'open' | 'upcoming' | 'ongoing' | 'closed' | 'ended';

export interface AdminManagementEvent extends FilterableEvent {
  id: string;
  event_time: string | null;
  deadline_time: string | null;
  close_on_full: boolean;
  location: string;
  classification: string;
}

const dateKey = (value: Date) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
].join('-');

export const getAdminEventStatus = (event: AdminManagementEvent, now = new Date()): AdminEventStatus => {
  if (event.status === 'pending') return 'pending';
  return getEventRegistrationStatus(event, now);
};

// Events have no semester column. This is an explicitly date-based UI facet,
// not a claim that the event was assigned to an academic semester in D1.
export const getAdminEventSemester = (eventDate: string | null): string | null => {
  if (!eventDate) return null;
  const monthKey = eventDate.slice(0, 7);
  const match = SEMESTER_OPTIONS.find((semester) => {
    const start = `${semester.monthStart.year}-${String(semester.monthStart.month + 1).padStart(2, '0')}`;
    const end = `${semester.monthEnd.year}-${String(semester.monthEnd.month + 1).padStart(2, '0')}`;
    return monthKey >= start && monthKey <= end;
  });
  return match?.value || null;
};

export const getAdminEventStats = (events: AdminManagementEvent[], now = new Date()) => {
  const active = events.filter((event) => !event.is_deleted);
  return {
    total: active.length,
    open: active.filter((event) => ['open', 'ongoing'].includes(getAdminEventStatus(event, now))).length,
    upcoming: active.filter((event) => event.status !== 'pending' && Boolean(event.event_date && event.event_date > dateKey(now))).length,
    closed: active.filter((event) => ['closed', 'ended'].includes(getAdminEventStatus(event, now))).length,
  };
};

export const filterAdminEvents = <T extends AdminManagementEvent>(
  events: T[],
  filters: EventFilters,
  tab: AdminEventTab,
  semester: string,
  now = new Date(),
) => events.filter((event) => {
  if (event.is_deleted || !matchesEventFilters(event, filters)) return false;
  if (semester !== 'all' && getAdminEventSemester(event.event_date) !== semester) return false;
  const status = getAdminEventStatus(event, now);
  if (tab === 'open') return status === 'open' || status === 'ongoing';
  if (tab === 'upcoming') return event.status !== 'pending' && Boolean(event.event_date && event.event_date > dateKey(now));
  if (tab === 'closed') return status === 'closed' || status === 'ended';
  return true;
}).sort((a, b) => compareFilteredEvents(a, b, filters.sortBy));

export const paginateAdminEvents = <T,>(events: T[], page: number, pageSize: number) => {
  const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, pageCount, start, end: Math.min(start + pageSize, events.length), items: events.slice(start, start + pageSize) };
};
