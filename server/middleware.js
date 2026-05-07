import logger from './logger.js';

const safeLog = (level, message, meta) => {
  try {
    if (typeof logger[level] === 'function') {
      logger[level](message, { meta });
    }
  } catch (error) {
    console.warn(`Logger ${level} failed:`, error?.message || error);
  }
};

export function withLogging(handler) {
  return async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Unknown IP';
    const userAgent = req.headers['user-agent'];

    safeLog('info', 'Incoming Request', {
      method: req.method,
      url: req.url,
      ip: clientIp,
      userAgent,
      query: req.query,
      body: req.body,
    });

    try {
      await handler(req, res);
    } catch (error) {
      safeLog('error', 'System Error', {
        url: req.url,
        error: error?.message,
        stack: error?.stack,
        ip: clientIp,
      });
      res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
    }
  };
}

