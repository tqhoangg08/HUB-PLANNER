export const TURNSTILE_SITE_KEY = String(
  import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY || '',
).trim();

export const hasTurnstileSiteKey = TURNSTILE_SITE_KEY.length > 0;
