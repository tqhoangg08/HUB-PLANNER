export const AUTH_MAINTENANCE_MODE =
  String(import.meta.env.VITE_AUTH_MAINTENANCE_MODE || '').toLowerCase() === 'true';

export const PASSWORD_RECOVERY_ENABLED =
  String(import.meta.env.VITE_PASSWORD_RECOVERY_ENABLED || '').toLowerCase() === 'true';

export const AUTH_MAINTENANCE_MESSAGE =
  String(import.meta.env.VITE_AUTH_MAINTENANCE_MESSAGE || '').trim() ||
  'Hệ thống đăng nhập đang được bảo trì để nâng cấp hệ thống. Các chức năng công khai vẫn có thể sử dụng bình thường. Chức năng tài khoản cá nhân sẽ được khôi phục sau khi hoàn tất bảo trì.';

export const cloudflareOnlyErrorResponse = (resourceLabel: string) =>
  new Response(
    JSON.stringify({
      error: `Tạm thời không thể tải ${resourceLabel} từ hệ thống công khai. Vui lòng thử lại sau.`,
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
