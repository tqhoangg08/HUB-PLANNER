import { createLogger, format, transports } from 'winston';

// 1. Danh sách các từ khóa chứa dữ liệu nhạy cảm cần che
const SENSITIVE_KEYS = ['password', 'token', 'cookie', 'authorization', 'secret'];

// 2. Hàm đệ quy để duyệt qua object và che dữ liệu
const maskData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const maskedObj = Array.isArray(data) ? [] : {};
  
  for (const key in data) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      maskedObj[key] = '*** MASKED ***'; // Che đi!
    } else if (typeof data[key] === 'object') {
      maskedObj[key] = maskData(data[key]); // Duyệt tiếp nếu là object lồng nhau
    } else {
      maskedObj[key] = data[key];
    }
  }
  return maskedObj;
};

// 3. Tạo format log tùy chỉnh
const maskFormat = format((info) => {
  if (info.meta) {
    info.meta = maskData(info.meta);
  }
  return info;
});

// 4. Khởi tạo Logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    maskFormat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json() // Định dạng JSON rất tốt để Vercel và Axiom phân tích
  ),
  transports: [
    new transports.Console() // In ra console (để Vercel bắt được)
  ],
});

export default logger;