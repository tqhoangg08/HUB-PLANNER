const ALLOWED_ORIGINS = new Set([
  'https://hotrosinhvienhub.id.vn',
  'http://localhost:3000',
]);

const getRequestOrigin = (req) => {
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, '');

  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return '';

  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
};

const isAllowedExtensionOrigin = (origin) => {
  if (!origin) return false;
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
};

export const isAllowedOrigin = (req) => {
  const origin = getRequestOrigin(req);
  return !origin || ALLOWED_ORIGINS.has(origin) || isAllowedExtensionOrigin(origin);
};

export const setCorsHeaders = (req, res, options = {}) => {
  const origin = getRequestOrigin(req);
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) || isAllowedExtensionOrigin(origin)
    ? origin
    : 'https://hotrosinhvienhub.id.vn';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', options.methods || 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    options.headers || 'Content-Type, Authorization'
  );
};

export const handleCors = (req, res, options = {}) => {
  setCorsHeaders(req, res, options);

  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: 'Forbidden', message: 'Origin not allowed.' });
    return true;
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
};
