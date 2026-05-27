// supabase/functions/_shared/cors.ts
const allowedOrigins = new Set([
  'https://hotrosinhvienhub.id.vn',
  'http://localhost:3000',
])

const getRequestOrigin = (req?: Request) => {
  const origin = req?.headers.get('origin') || ''
  if (origin) return origin.replace(/\/$/, '')

  const referer = req?.headers.get('referer') || req?.headers.get('referrer') || ''
  if (!referer) return ''

  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

export const getCorsHeaders = (req?: Request) => {
  const origin = getRequestOrigin(req)
  const allowedOrigin = allowedOrigins.has(origin)
    ? origin
    : 'https://hotrosinhvienhub.id.vn'

  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
  }
}

export const isAllowedCorsOrigin = (req?: Request) => {
  const origin = getRequestOrigin(req)
  return !origin || allowedOrigins.has(origin)
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://hotrosinhvienhub.id.vn',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-secret-key, x-crawler-secret, cache-control, pragma, expires',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}
