const SAFE_TECH_REPLY = [
  'Mình không thể chia sẻ thông tin kỹ thuật hoặc bảo mật nội bộ của website.',
  'HUB Planner được xây dựng để hỗ trợ sinh viên quản lý học tập, theo dõi GPA, lịch học, thông báo, sự kiện và các tiện ích sinh viên thuận tiện hơn.',
  'Nếu bạn cần hướng dẫn sử dụng tính năng nào trên web, mình có thể hỗ trợ.',
].join('\n');

const normalizeText = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

const SENSITIVE_REPLY_KEYWORDS = [
  'api key',
  'api keys',
  'token',
  'secret',
  'admin',
  'react',
  'next.js',
  'nextjs',
  'supabase',
  'database',
  'backend',
  'frontend',
  'fullstack',
  'vercel',
  'deploy',
  'hosting',
  'rag',
  'retrieval-augmented',
  'gemini',
  'chatgpt',
  'framework',
  'source code',
  'ma nguon',
];

const compactReferenceLinks = (reply = '') => reply
  .replace(/\[Link tham kh[^\]]*o\]\((https?:\/\/[^\s)]+)\)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer"><b>Link tham khảo</b></a>')
  .replace(/(?:Link|Nguon|Nguồn|Nguon thong bao|Nguồn thông báo|Nguon goc|Nguồn gốc)\s*:\s*(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer"><b>Link tham khảo</b></a>')
  .replace(/(<a\b[^>]*>)\s*Link tham kh(?:a|á|ảo|ao)\s*(<\/a>)/gi, '$1<b>Link tham khảo</b>$2');

export const sanitizeAIReply = (reply = '') => {
  const text = normalizeText(reply);
  return SENSITIVE_REPLY_KEYWORDS.some((keyword) => text.includes(keyword))
    ? SAFE_TECH_REPLY
    : compactReferenceLinks(reply);
};
