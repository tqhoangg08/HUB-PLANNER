import Swal, { SweetAlertIcon } from 'sweetalert2';

type NotifyVariant = 'success' | 'error' | 'warning' | 'info' | 'question';

interface NotifyOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: NotifyVariant;
}

const ICON_BY_VARIANT: Record<NotifyVariant, SweetAlertIcon> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  question: 'question',
};

const TITLE_BY_VARIANT: Record<NotifyVariant, string> = {
  success: 'Thành công',
  error: 'Có lỗi xảy ra',
  warning: 'Cần chú ý',
  info: 'Thông báo',
  question: 'Xác nhận thao tác',
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const cleanMessage = (message: string) =>
  message
    .replace(/^[\s⚠️⛔❌✅🔔📢✨]+/u, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const detectVariant = (message: string, fallback: NotifyVariant = 'info'): NotifyVariant => {
  const lower = stripDiacritics(message);
  if (/\b(thanh cong|da gui|da xoa|da dong bo|cam on)\b/.test(lower)) return 'success';
  if (/\b(loi|that bai|khong the|bi chan|canh bao trung)\b/.test(lower)) return 'error';
  if (/\b(canh bao|chu y|xac nhan|dang xuat|xoa|chan)\b/.test(lower)) return 'warning';
  return fallback;
};

const splitTitleAndMessage = (input: string, fallbackVariant: NotifyVariant) => {
  const normalized = cleanMessage(input);
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const firstLine = lines[0] || TITLE_BY_VARIANT[fallbackVariant];
  const looksLikeTitle = lines.length > 1 && firstLine.length <= 70 && /[!?:]$|canh bao|xac nhan|thanh cong/i.test(stripDiacritics(firstLine));

  if (looksLikeTitle) {
    return {
      title: firstLine.replace(/[!:.]+$/, ''),
      message: lines.slice(1).join('\n\n'),
    };
  }

  return {
    title: TITLE_BY_VARIANT[fallbackVariant],
    message: normalized || TITLE_BY_VARIANT[fallbackVariant],
  };
};

const baseClass = {
  container: 'hub-alert-container',
  popup: 'hub-alert-popup',
  icon: 'hub-alert-icon',
  title: 'hub-alert-title',
  htmlContainer: 'hub-alert-content',
  actions: 'hub-alert-actions',
  confirmButton: 'hub-alert-confirm',
  cancelButton: 'hub-alert-cancel',
  closeButton: 'hub-alert-close',
};

export const showAlert = async (input: string | NotifyOptions) => {
  const rawMessage = typeof input === 'string' ? normalizeText(input) : normalizeText(input.message || input.title);
  const variant = typeof input === 'string' ? detectVariant(rawMessage) : (input.variant || detectVariant(rawMessage));
  const parsed = splitTitleAndMessage(rawMessage, variant);
  const title = typeof input === 'string' ? parsed.title : (input.title || parsed.title);
  const message = typeof input === 'string' ? parsed.message : (input.message || parsed.message);

  await Swal.fire({
    title,
    text: message,
    icon: ICON_BY_VARIANT[variant],
    confirmButtonText: typeof input === 'string' ? 'Đã hiểu' : (input.confirmText || 'Đã hiểu'),
    buttonsStyling: false,
    customClass: baseClass,
    showClass: { popup: 'hub-alert-enter' },
    hideClass: { popup: 'hub-alert-leave' },
  });
};

export const showConfirm = async (input: string | NotifyOptions): Promise<boolean> => {
  const rawMessage = typeof input === 'string' ? normalizeText(input) : normalizeText(input.message || input.title);
  const parsed = splitTitleAndMessage(rawMessage, 'question');
  const title = typeof input === 'string' ? parsed.title : (input.title || parsed.title);
  const message = typeof input === 'string' ? parsed.message : (input.message || parsed.message);
  const variant = typeof input === 'string' ? detectVariant(rawMessage, 'question') : (input.variant || 'question');

  const result = await Swal.fire({
    title,
    text: message,
    icon: ICON_BY_VARIANT[variant],
    showCancelButton: true,
    confirmButtonText: typeof input === 'string' ? 'Xác nhận' : (input.confirmText || 'Xác nhận'),
    cancelButtonText: typeof input === 'string' ? 'Hủy' : (input.cancelText || 'Hủy'),
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: baseClass,
    showClass: { popup: 'hub-alert-enter' },
    hideClass: { popup: 'hub-alert-leave' },
  });

  return result.isConfirmed;
};

export const showToast = (input: string | NotifyOptions) => {
  const rawMessage = typeof input === 'string' ? normalizeText(input) : normalizeText(input.message || input.title);
  const variant = typeof input === 'string' ? detectVariant(rawMessage) : (input.variant || detectVariant(rawMessage));
  const parsed = splitTitleAndMessage(rawMessage, variant);

  void Swal.fire({
    toast: true,
    position: 'top-end',
    icon: ICON_BY_VARIANT[variant],
    title: typeof input === 'string' ? parsed.title : (input.title || parsed.title),
    text: typeof input === 'string' ? parsed.message : input.message,
    timer: 3600,
    timerProgressBar: true,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: {
      popup: 'hub-toast-popup',
      title: 'hub-toast-title',
      htmlContainer: 'hub-toast-content',
      closeButton: 'hub-alert-close',
    },
  });
};

export const installAppNotificationBridge = () => {
  window.alert = (message?: any) => {
    void showAlert(normalizeText(message));
  };
};
