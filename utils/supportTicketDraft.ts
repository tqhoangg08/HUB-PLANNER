import type { SupportTicketCategory, SupportTicketPriority } from './supportTicketsApi';

const SUPPORT_TICKET_DRAFT_KEY = 'hub_support_ticket_draft_v1';
export const SUPPORT_TICKET_DRAFT_ROUTE = '/support/new';

export interface SupportTicketDraft {
  subject: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority;
  message: string;
}

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const truncate = (value: string, maxLength: number) => {
  const clean = value.trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
};

const redactSensitiveText = (value: string) =>
  value
    .replace(/([?&](?:access_token|refresh_token|provider_token|id_token|token|authorization|code)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTED]');

const getCurrentPath = () => {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`.slice(0, 220);
};

const inferCategory = (message: string): SupportTicketCategory => {
  const normalized = stripDiacritics(message);
  if (/(bang diem|diem|gpa|transcript|pdf diem|lo trinh)/.test(normalized)) return 'grades';
  if (/(tkb|lich hoc|thoi khoa bieu|mon hoc|hoc phan|schedule|pdf lich|pdf tkb)/.test(normalized)) return 'schedule';
  if (/(dang nhap|dang ky|otp|mat khau|tai khoan|captcha|google hub|email)/.test(normalized)) return 'login';
  if (/(su kien|drl|diem ren luyen)/.test(normalized)) return 'events';
  if (/(that lac|do that lac|lost)/.test(normalized)) return 'lost_found';
  return 'other';
};

const categoryIntro: Record<SupportTicketCategory, string> = {
  login: 'Mình gặp lỗi khi đăng nhập/đăng ký tài khoản HUB Planner.',
  grades: 'Mình gặp lỗi khi nhập hoặc xem bảng điểm trên HUB Planner.',
  events: 'Mình gặp lỗi khi xem hoặc thao tác với sự kiện ĐRL.',
  schedule: 'Mình gặp lỗi khi thao tác thời khóa biểu/lịch học.',
  lost_found: 'Mình gặp lỗi khi dùng tính năng tìm đồ thất lạc.',
  feedback: 'Mình muốn gửi góp ý cho HUB Planner.',
  other: 'Mình gặp lỗi khi sử dụng HUB Planner.',
};

export const buildErrorSupportTicketDraft = (input: {
  title?: string;
  message: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
}): SupportTicketDraft => {
  const safeMessage = redactSensitiveText(input.message || input.title || 'Không rõ thông báo lỗi.');
  const category = input.category || inferCategory(`${input.title || ''} ${safeMessage}`);
  const firstLine = normalizeSpaces(safeMessage.split('\n').find(Boolean) || input.title || 'Lỗi cần hỗ trợ');
  const subjectPrefix = category === 'schedule'
    ? 'Lỗi thời khóa biểu'
    : category === 'grades'
      ? 'Lỗi bảng điểm'
      : category === 'login'
        ? 'Lỗi đăng nhập/tài khoản'
        : 'Lỗi cần hỗ trợ';

  const pagePath = redactSensitiveText(getCurrentPath());
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

  return {
    subject: truncate(`${subjectPrefix}: ${firstLine}`, 160),
    category,
    priority: input.priority || 'normal',
    message: truncate(
      [
        categoryIntro[category],
        '',
        'Thông báo hệ thống hiển thị:',
        safeMessage,
        '',
        pagePath ? `Trang đang thao tác: ${pagePath}` : '',
        `Thời điểm gặp lỗi: ${new Date().toLocaleString('vi-VN')}`,
        userAgent ? `Trình duyệt/thiết bị: ${truncate(userAgent, 260)}` : '',
        '',
        'Nhờ admin kiểm tra giúp mình lỗi này. Nếu cần thêm thông tin, mình sẽ bổ sung ảnh chụp màn hình hoặc file liên quan trong ticket.',
      ].filter(Boolean).join('\n'),
      4000,
    ),
  };
};

export const saveSupportTicketDraft = (draft: SupportTicketDraft) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SUPPORT_TICKET_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures; the support form still opens normally.
  }
};

export const openSupportTicketDraft = (draft: SupportTicketDraft) => {
  saveSupportTicketDraft(draft);
  if (typeof window !== 'undefined') window.location.assign(SUPPORT_TICKET_DRAFT_ROUTE);
};

export const buildManualSupportTicketDraft = (input: {
  category: SupportTicketCategory;
  subject: string;
  intro: string;
  fields?: Array<[string, string | null | undefined]>;
  priority?: SupportTicketPriority;
}): SupportTicketDraft => {
  const fieldLines = (input.fields || [])
    .map(([label, value]) => [label, redactSensitiveText(String(value || '').trim())] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: ${value}`);

  return {
    category: input.category,
    priority: input.priority || 'normal',
    subject: truncate(input.subject, 160),
    message: truncate(
      [
        redactSensitiveText(input.intro),
        '',
        ...fieldLines,
        '',
        `Trang đang thao tác: ${redactSensitiveText(getCurrentPath())}`,
        `Thời điểm gửi: ${new Date().toLocaleString('vi-VN')}`,
        '',
        'Nhờ admin kiểm tra và phản hồi giúp mình trong ticket này.',
      ].filter(Boolean).join('\n'),
      4000,
    ),
  };
};

export const consumeSupportTicketDraft = (): SupportTicketDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SUPPORT_TICKET_DRAFT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SUPPORT_TICKET_DRAFT_KEY);
    const parsed = JSON.parse(raw) as Partial<SupportTicketDraft>;
    if (!parsed.subject || !parsed.message || !parsed.category) return null;
    return {
      subject: truncate(parsed.subject, 160),
      category: parsed.category,
      priority: parsed.priority || 'normal',
      message: truncate(parsed.message, 4000),
    };
  } catch {
    return null;
  }
};
