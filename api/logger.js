import { createLogger, format, transports } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/winston';

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

// 4. Khởi tạo danh sách các đường ống xuất log
const activeTransports = [
  new transports.Console() // Luôn in ra màn hình Console (để Vercel bắt được)
];

// Nếu đã cài đặt chìa khóa bí mật của Axiom thì mới gắn thêm ống dẫn sang Axiom
if (process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
  activeTransports.push(
    new AxiomTransport({
      dataset: process.env.AXIOM_DATASET, // Tên kho chứa trên Axiom
      token: process.env.AXIOM_TOKEN,     // Chìa khóa kết nối
    })
  );
}

// 5. Khởi tạo Logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    maskFormat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json() // Định dạng JSON rất tốt để Vercel và Axiom phân tích
  ),
  transports: activeTransports,
});

export default logger;