import logger from './logger.js';

export function withLogging(handler) {
  return async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Unknown IP';
    const userAgent = req.headers['user-agent'];
    
    // Ghi lại thông tin request (Đã che mật khẩu/token nếu có trong body)
    logger.info('Incoming Request', {
      meta: {
        method: req.method,
        url: req.url,
        ip: clientIp,
        userAgent: userAgent,
        query: req.query, // Ví dụ: ghi lại mssv hoặc mã học phần người dùng đang tìm
        body: req.body,   // Hàm maskData ở Bước 2 sẽ tự động che mật khẩu ở đây
      }
    });

    try {
      // Chuyển tiếp cho API xử lý chính
      await handler(req, res);
    } catch (error) {
      // Ghi log lỗi để Forensic (Điều tra)
      logger.error('System Error', {
        meta: {
          url: req.url,
          error: error.message,
          stack: error.stack,
          ip: clientIp,
        }
      });
      res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
    }
  };
}
