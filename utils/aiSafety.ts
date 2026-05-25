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

export const sanitizeAIReply = (reply = '') => {
  const text = normalizeText(reply);
  return SENSITIVE_REPLY_KEYWORDS.some((keyword) => text.includes(keyword))
    ? SAFE_TECH_REPLY
    : reply;
};
