export type EventDatePreset = 'all' | 'custom' | 'thisMonth' | 'nextMonth' | 'other';

export type EventSortBy =
  | 'newest'
  | 'oldest'
  | 'upcoming'
  | 'highestScore'
  | 'registrationDeadline';

export type EventRegistrationStatus =
  | 'all'
  | 'open'
  | 'upcoming'
  | 'closed'
  | 'ongoing'
  | 'ended';

export interface EventFilters {
  keyword: string;
  region: string;
  eventType: string;
  datePreset: EventDatePreset;
  dateFrom: string;
  dateTo: string;
  trainingCategories: string[];
  registrationStatus: EventRegistrationStatus;
  sortBy: EventSortBy;
}

export interface FilterableEvent {
  name: string;
  organizer: string;
  type: string;
  category: string;
  scope: string;
  score: string;
  status: string;
  created_at: string;
  event_date: string | null;
  deadlineDate: Date | null;
  registration_start_date: string | null;
  is_manually_closed: boolean;
  is_deleted: boolean;
}

export const createDefaultEventFilters = (): EventFilters => ({
  keyword: '',
  region: 'all',
  eventType: 'all',
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
  trainingCategories: [],
  registrationStatus: 'all',
  sortBy: 'newest',
});

export const EVENT_SORT_OPTIONS: Array<{ value: EventSortBy; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'upcoming', label: 'Sắp diễn ra' },
  { value: 'highestScore', label: 'Điểm ĐRL cao nhất' },
  { value: 'registrationDeadline', label: 'Hạn đăng ký gần nhất' },
];

export const EVENT_STATUS_OPTIONS: Array<{ value: EventRegistrationStatus; label: string }> = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'open', label: 'Đang mở đăng ký' },
  { value: 'upcoming', label: 'Sắp mở đăng ký' },
  { value: 'closed', label: 'Đã đóng đăng ký' },
  { value: 'ongoing', label: 'Đang diễn ra' },
  { value: 'ended', label: 'Đã kết thúc' },
];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPresetDateRange = (
  preset: EventDatePreset,
  now = new Date()
): Pick<EventFilters, 'dateFrom' | 'dateTo'> => {
  if (preset !== 'thisMonth' && preset !== 'nextMonth') {
    return { dateFrom: '', dateTo: '' };
  }
  const monthOffset = preset === 'nextMonth' ? 1 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return { dateFrom: toDateKey(start), dateTo: toDateKey(end) };
};

export const formatEventFilterDate = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const getEventFilterCount = (filters: EventFilters) =>
  Number(filters.region !== 'all') +
  Number(filters.eventType !== 'all') +
  Number(filters.datePreset !== 'all' && Boolean(filters.dateFrom || filters.dateTo)) +
  Number(filters.trainingCategories.length > 0) +
  Number(filters.registrationStatus !== 'all') +
  Number(filters.sortBy !== 'newest');

const normalized = (value: string | null | undefined) =>
  String(value || '').toLocaleLowerCase('vi-VN').trim();

export const getEventRegistrationStatus = (
  event: FilterableEvent,
  now = new Date()
): Exclude<EventRegistrationStatus, 'all'> => {
  const status = normalized(event.status);
  const today = toDateKey(now);
  const eventDate = event.event_date || '';
  const registrationStart = event.registration_start_date || '';
  const deadline = event.deadlineDate ? toDateKey(event.deadlineDate) : '';

  if (event.is_manually_closed || status.includes('kết thúc') || (eventDate && eventDate < today)) return 'ended';
  if (eventDate === today || status.includes('đang diễn ra')) return 'ongoing';
  if (registrationStart && registrationStart > today) return 'upcoming';
  if (deadline && deadline < today) return 'closed';
  if (status.includes('đóng')) return 'closed';
  return 'open';
};

const timeValue = (value: string | null | undefined, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : fallback;
};

export const matchesEventFilters = (event: FilterableEvent, filters: EventFilters) => {
  const keyword = normalized(filters.keyword);
  const matchesKeyword = !keyword || [event.name, event.organizer, event.type]
    .some((value) => normalized(value).includes(keyword));
  const matchesRegion = filters.region === 'all' || event.scope === filters.region;
  const matchesType = filters.eventType === 'all' || event.type === filters.eventType;
  const matchesCategory = filters.trainingCategories.length === 0 || filters.trainingCategories.includes(event.category);
  const eventDate = event.event_date || '';
  const matchesDate = filters.datePreset === 'all' || (
    (!filters.dateFrom || eventDate >= filters.dateFrom) &&
    (!filters.dateTo || eventDate <= filters.dateTo)
  );
  const matchesStatus = filters.registrationStatus === 'all' ||
    getEventRegistrationStatus(event) === filters.registrationStatus;
  return matchesKeyword && matchesRegion && matchesType && matchesCategory && matchesDate && matchesStatus;
};

export const compareFilteredEvents = (
  first: FilterableEvent,
  second: FilterableEvent,
  sortBy: EventSortBy
) => {
  if (sortBy === 'oldest') {
    return timeValue(first.created_at, 0) - timeValue(second.created_at, 0);
  }
  if (sortBy === 'upcoming') {
    return timeValue(first.event_date) - timeValue(second.event_date);
  }
  if (sortBy === 'highestScore') {
    return (Number.parseFloat(second.score) || 0) - (Number.parseFloat(first.score) || 0);
  }
  if (sortBy === 'registrationDeadline') {
    return (first.deadlineDate?.getTime() ?? Number.POSITIVE_INFINITY) -
      (second.deadlineDate?.getTime() ?? Number.POSITIVE_INFINITY);
  }
  return timeValue(second.created_at, 0) - timeValue(first.created_at, 0);
};
