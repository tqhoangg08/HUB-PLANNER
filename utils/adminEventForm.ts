export const EVENT_CATEGORIES = [
  'Hoạt động phong trào', 'Minigame', 'Tình nguyện', 'Cuộc thi học thuật',
  'Cổ vũ', 'Talkshow', 'Tọa đàm', 'Hội thảo', 'Sự kiện offline',
  'Teambuilding', 'Hoạt động thể thao',
] as const;

export const EVENT_PUBLIC_STATUS = 'Sắp diễn ra';
export const EVENT_DRAFT_STATUS = 'pending';

export interface AdminEventFormValues {
  title: string;
  category: string;
  organizer: string;
  criteria: string;
  points: string;
  drl_rule_id?: string;
  recognition_type?: string;
  recognition_note?: string;
  format: string;
  location_type: string;
  classification?: string;
  registration_start_date: string;
  registration_start_time: string;
  deadline: string;
  deadline_time: string;
  event_date: string;
  event_time: string;
  close_on_full: boolean;
  description: string;
  link: string;
  image_url: string;
  status: string;
  is_manually_closed: boolean;
}

export const createEmptyAdminEventDraft = (): AdminEventFormValues => ({
  title: '', category: 'Hoạt động phong trào', organizer: '', criteria: 'III',
  points: '5', format: 'Offline', location_type: 'Trong trường', classification: '',
  drl_rule_id: '', recognition_type: 'Không có / Chưa xác định', recognition_note: '',
  registration_start_date: '', registration_start_time: '', deadline: '', deadline_time: '',
  event_date: '', event_time: '', close_on_full: false, description: '', link: '',
  image_url: '', status: EVENT_DRAFT_STATUS, is_manually_closed: false,
});

export const buildAdminEventPayload = (draft: AdminEventFormValues) => ({
  title: draft.title.trim(),
  organizer: draft.organizer.trim() || null,
  category: draft.category.trim() || null,
  criteria: draft.drl_rule_id ? draft.criteria : null,
  points: draft.drl_rule_id ? draft.points.trim() || null : null,
  drl_rule_id: draft.drl_rule_id || null,
  recognition_type: draft.recognition_type || null,
  recognition_note: draft.recognition_note?.trim() || null,
  format: draft.format,
  deadline: draft.close_on_full ? null : draft.deadline || null,
  deadline_time: draft.close_on_full ? null : draft.deadline_time || null,
  close_on_full: draft.close_on_full,
  description: draft.description || null,
  link: draft.link.trim() || null,
  classification: draft.classification?.trim() || null,
  location_type: draft.location_type,
  status: draft.status,
  is_manually_closed: draft.is_manually_closed,
  event_date: draft.event_date || null,
  event_time: draft.event_time || null,
  registration_start_date: draft.registration_start_date || null,
  registration_start_time: draft.registration_start_time || null,
  image_url: draft.image_url || null,
});

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const validTime = (value: string) => !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const dateTime = (date: string, time: string) => `${date}T${time || '00:00'}`;

export const validateAdminEventDraft = (draft: AdminEventFormValues): Partial<Record<keyof AdminEventFormValues, string>> => {
  const errors: Partial<Record<keyof AdminEventFormValues, string>> = {};
  if (!draft.title.trim()) errors.title = 'Vui lòng nhập tên sự kiện.';
  else if (draft.title.length > 300) errors.title = 'Tên sự kiện tối đa 300 ký tự.';
  if (!draft.category.trim()) errors.category = 'Vui lòng chọn loại hình.';
  else if (draft.category.length > 120) errors.category = 'Loại hình tối đa 120 ký tự.';
  if (!draft.organizer.trim()) errors.organizer = 'Vui lòng nhập đơn vị tổ chức.';
  else if (draft.organizer.length > 300) errors.organizer = 'Đơn vị tổ chức tối đa 300 ký tự.';
  if (!draft.drl_rule_id && draft.status !== EVENT_DRAFT_STATUS) errors.drl_rule_id = 'Vui lòng chọn quy tắc ĐRL chính thức.';
  if (draft.drl_rule_id && !['I', 'II', 'III', 'IV', 'V'].includes(draft.criteria)) errors.criteria = 'Mục ĐRL không hợp lệ.';
  if (draft.drl_rule_id && !draft.points.trim()) errors.points = 'Thiếu điểm từ quy tắc ĐRL.';
  if (draft.points.length > 40) errors.points = 'Điểm rèn luyện tối đa 40 ký tự.';
  if (!['Offline', 'Online', 'Hỗn hợp'].includes(draft.format)) errors.format = 'Hình thức không hợp lệ.';
  if (!['Trong trường', 'Ngoài trường'].includes(draft.location_type)) errors.location_type = 'Khu vực không hợp lệ.';
  if (draft.classification && draft.classification.length > 120) errors.classification = 'Phân loại tối đa 120 ký tự.';
  if (draft.description.length > 10_000) errors.description = 'Mô tả tối đa 10.000 ký tự.';
  if (draft.link.trim()) {
    try {
      const url = new URL(draft.link.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { errors.link = 'Liên kết phải là URL HTTP/HTTPS hợp lệ.'; }
  }
  if (draft.link.length > 2_048) errors.link = 'Liên kết tối đa 2.048 ký tự.';
  if (![EVENT_DRAFT_STATUS, EVENT_PUBLIC_STATUS].includes(draft.status)) errors.status = 'Trạng thái không hợp lệ.';
  for (const field of ['registration_start_date', 'deadline', 'event_date'] as const) {
    if (draft[field] && !validDate(draft[field])) errors[field] = 'Ngày không hợp lệ.';
  }
  for (const field of ['registration_start_time', 'deadline_time', 'event_time'] as const) {
    if (!validTime(draft[field])) errors[field] = 'Giờ không hợp lệ.';
  }
  if (draft.registration_start_time && !draft.registration_start_date) errors.registration_start_date = 'Chọn ngày mở đăng ký trước.';
  if (!draft.close_on_full && draft.deadline_time && !draft.deadline) errors.deadline = 'Chọn ngày đóng đăng ký trước.';
  if (draft.event_time && !draft.event_date) errors.event_date = 'Chọn ngày diễn ra trước.';
  if (!draft.close_on_full && draft.registration_start_date && draft.deadline &&
      dateTime(draft.registration_start_date, draft.registration_start_time) > dateTime(draft.deadline, draft.deadline_time)) {
    errors.deadline = 'Thời gian đóng phải sau thời gian mở đăng ký.';
  }
  if (!draft.close_on_full && draft.deadline && draft.event_date &&
      dateTime(draft.deadline, draft.deadline_time) > dateTime(draft.event_date, draft.event_time)) {
    errors.event_date = 'Sự kiện không thể diễn ra trước hạn đăng ký.';
  }
  return errors;
};
