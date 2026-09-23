export type CalendarDeviceKind = 'ios' | 'android' | 'windows' | 'macos' | 'generic';

export interface CalendarDeviceSignals {
  userAgent?: string;
  platform?: string;
  userAgentData?: { platform?: string; mobile?: boolean };
  maxTouchPoints?: number;
  viewportWidth?: number;
  standalone?: boolean;
}

export interface CalendarImportGuide {
  device: CalendarDeviceKind;
  title: string;
  steps: string[];
  note?: string;
  showPwaInstallCard: boolean;
  manualInstallHint?: string;
}

export type CalendarHandoffResult = 'share' | 'download' | 'download-after-share-failure' | 'cancelled';

export const getCalendarHandoffPresentation = (result: CalendarHandoffResult, eventCount: number) => ({
  showGuide: result === 'download' || result === 'download-after-share-failure',
  successMessage: result === 'share'
    ? `Đã chuẩn bị ${eventCount} buổi học. Chọn ứng dụng lịch trên thiết bị để hoàn tất.`
    : null,
});

export const getCalendarImportGuide = (signals: CalendarDeviceSignals): CalendarImportGuide => {
  const userAgent = (signals.userAgent || '').toLowerCase();
  const platform = `${signals.userAgentData?.platform || ''} ${signals.platform || ''}`.toLowerCase();
  const ios = /iphone|ipad|ipod|ios|ipados/.test(`${userAgent} ${platform}`)
    || (/macintosh|macintel/.test(`${userAgent} ${platform}`) && (signals.maxTouchPoints || 0) > 1);
  const android = !ios && /android/.test(`${userAgent} ${platform}`);
  const windows = !ios && !android && /windows|win32|win64/.test(`${userAgent} ${platform}`);
  const macos = !ios && !android && !windows && /macintosh|macintel|macos|mac os/.test(`${userAgent} ${platform}`);
  const isMobile = signals.userAgentData?.mobile
    ?? (ios || android || /mobile/.test(userAgent) || ((signals.viewportWidth || 1_024) < 768 && (signals.maxTouchPoints || 0) > 0));
  const showPwaInstallCard = isMobile && !signals.standalone;

  if (ios) return {
    device: 'ios',
    title: 'Thêm vào Lịch trên iPhone/iPad',
    steps: [
      'Mở file lịch vừa tải xuống.',
      'Chọn mở hoặc chia sẻ file bằng ứng dụng Lịch tương thích.',
      'Chọn thêm tất cả hoặc xác nhận thêm các sự kiện nếu ứng dụng yêu cầu.',
      'Kiểm tra lại thời khóa biểu trong ứng dụng Lịch.',
    ],
    note: 'Nếu không thấy file, mở ứng dụng Tệp > Tải về.',
    showPwaInstallCard,
    manualInstallHint: 'Chia sẻ → Thêm vào Màn hình chính',
  };
  if (android) return {
    device: 'android',
    title: 'Thêm vào lịch trên Android',
    steps: [
      'Mở file lịch từ thông báo tải xuống hoặc thư mục Downloads.',
      'Chọn ứng dụng lịch đang dùng nếu thiết bị hỏi.',
      'Chọn lịch hoặc tài khoản muốn lưu.',
      'Xác nhận nhập các buổi học.',
    ],
    showPwaInstallCard,
    manualInstallHint: 'Menu trình duyệt → Thêm vào màn hình chính / Cài ứng dụng',
  };
  if (windows) return {
    device: 'windows',
    title: 'Thêm vào lịch trên máy tính',
    steps: [
      'Mở file lịch vừa tải.',
      'Chọn ứng dụng lịch đang dùng, chẳng hạn Outlook hoặc ứng dụng tương thích.',
      'Chọn Import hoặc Add nếu ứng dụng hỏi.',
      'Xác nhận thêm toàn bộ lịch học.',
    ],
    showPwaInstallCard,
  };
  if (macos) return {
    device: 'macos',
    title: 'Thêm vào Lịch trên Mac',
    steps: [
      'Mở file lịch vừa tải.',
      'Chọn ứng dụng Lịch hoặc ứng dụng lịch tương thích trên Mac.',
      'Chọn lịch muốn thêm.',
      'Xác nhận Import.',
    ],
    showPwaInstallCard,
  };
  return {
    device: 'generic',
    title: 'Hoàn tất thêm lịch',
    steps: [
      'Mở file lịch vừa tải.',
      'Chọn ứng dụng lịch trên thiết bị.',
      'Chọn Import hoặc Add nếu được hỏi.',
      'Xác nhận thêm lịch học.',
    ],
    showPwaInstallCard,
  };
};

export const readCalendarDeviceSignals = (): CalendarDeviceSignals => {
  const navigatorWithExtras = navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { platform?: string; mobile?: boolean };
  };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    userAgentData: navigatorWithExtras.userAgentData,
    maxTouchPoints: navigator.maxTouchPoints,
    viewportWidth: window.innerWidth,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigatorWithExtras.standalone === true,
  };
};
