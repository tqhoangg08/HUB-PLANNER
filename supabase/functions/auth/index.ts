// supabase/functions/auth/index.ts
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const SCHOOL_DOMAIN = 'st.buh.edu.vn'
const OTP_TTL_MINUTES = 10
const OTP_COOLDOWN_SECONDS = 10 * 60
const MAX_ATTEMPTS = 5
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const env = (key: string) => Deno.env.get(key) || ''
const normalizeEmail = (value = '') => value.trim().toLowerCase()
const encodeR2Path = (key: string) => key.split('/').map(encodeURIComponent).join('/')
const textEncoder = new TextEncoder()
const text = (value: unknown, max = 2000) => String(value || '').trim().slice(0, max)
const nullableText = (value: unknown, max = 2000) => {
  const next = text(value, max)
  return next || null
}

const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const sha256Hex = async (value: string | Uint8Array) => {
  const data = typeof value === 'string' ? textEncoder.encode(value) : value
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}
const hmacBytes = async (key: string | Uint8Array, value: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? textEncoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value)))
}
const hmacHex = async (key: string | Uint8Array, value: string) => bytesToHex(await hmacBytes(key, value))
const anonymizationSecret = () => env('DATA_ANONYMIZATION_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY') || 'hub-planner'
const anonymizedUserHash = (userId: string) => hmacHex(anonymizationSecret(), `user:${userId}`)
const getSignatureKey = async (secretKey: string, dateStamp: string, region: string, service: string) => {
  const kDate = await hmacBytes(`AWS4${secretKey}`, dateStamp)
  const kRegion = await hmacBytes(kDate, region)
  const kService = await hmacBytes(kRegion, service)
  return hmacBytes(kService, 'aws4_request')
}
const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
const randomOtp = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))

const getR2Config = () => {
  const accountId = env('R2_ACCOUNT_ID')
  const bucket = env('R2_BUCKET_NAME')
  const accessKeyId = env('R2_ACCESS_KEY_ID')
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
  const publicBaseUrl = env('R2_PUBLIC_URL')
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    const error: any = new Error('Chưa cấu hình R2. Cần R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.')
    error.statusCode = 500
    throw error
  }
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    host: `${accountId}.r2.cloudflarestorage.com`,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  }
}

const putR2Object = async ({ key, body, contentType }: { key: string; body: Uint8Array; contentType: string }) => {
  const { endpoint, host, bucket, accessKeyId, secretAccessKey } = getR2Config()
  const encodedKey = encodeR2Path(key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const payloadHash = await sha256Hex(body)
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', `/${bucket}/${encodedKey}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const signature = await hmacHex(await getSignatureKey(secretAccessKey, dateStamp, region, service), stringToSign)
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const uploadResponse = await fetch(`${endpoint}/${bucket}/${encodedKey}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
    body,
  })

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '')
    throw new Error(`Không thể upload avatar lên R2 (${uploadResponse.status}). ${detail}`.trim())
  }
}

const formatVietnamTime = (date: Date) => date.toLocaleTimeString('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
})

const OTP_EMAIL_COPY: Record<string, { title: string; subjectAction: string; actionText: string }> = {
  register: {
    title: 'Xác nhận đăng ký HUB Planner',
    subjectAction: 'tạo mới tài khoản',
    actionText: 'tạo mới tài khoản',
  },
  forgot_password: {
    title: 'Đặt lại mật khẩu HUB Planner',
    subjectAction: 'cài đặt lại mật khẩu',
    actionText: 'cài đặt lại mật khẩu',
  },
}

const getOtpEmailCopy = (purpose: string) => {
  const copy = OTP_EMAIL_COPY[purpose]
  if (!copy) throw new Error(`Loại OTP không hợp lệ khi gửi email: ${String(purpose || 'missing')}`)
  return copy
}

const hashOtp = async (email: string, purpose: string, otp: string) => {
  const secret = env('OTP_SECRET') || env('RESEND_API_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  return sha256Hex(`${email}:${purpose}:${otp}:${secret}`)
}

const resolveEmail = async (rawValue: string) => {
  const identifier = normalizeEmail(rawValue)
  if (!identifier) throw new Error('Thiếu Gmail HUB hoặc MSSV.')
  if (identifier.includes('@')) {
    if (!identifier.endsWith(`@${SCHOOL_DOMAIN}`)) {
      const error: any = new Error(`Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.`)
      error.statusCode = 400
      throw error
    }
    return identifier
  }
  if (!/^[a-z0-9._-]{3,64}$/.test(identifier)) {
    const error: any = new Error('MSSV không hợp lệ.')
    error.statusCode = 400
    throw error
  }
  const { data, error } = await supabase.from('profiles').select('id').eq('student_code', identifier).maybeSingle()
  if (error) throw error
  if (!data?.id) {
    const notFound: any = new Error('Không tìm thấy MSSV trong hệ thống.')
    notFound.statusCode = 404
    throw notFound
  }
  const { data: privateProfile, error: privateError } = await supabase
    .from('profile_private_data')
    .select('email')
    .eq('user_id', data.id)
    .maybeSingle()
  if (privateError) throw privateError
  if (!privateProfile?.email) {
    const notFound: any = new Error('Không tìm thấy email của MSSV này.')
    notFound.statusCode = 404
    throw notFound
  }
  return normalizeEmail(privateProfile.email)
}

const passwordError = (password: string, confirmPassword?: string) => {
  if (!password || password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.'
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Hai mật khẩu chưa trùng khớp.'
  return null
}

const getAuthUserByEmail = async (email: string) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data?.users?.find((item: any) => normalizeEmail(item.email) === email)
    if (user) return user
    if (!data?.users || data.users.length < 1000) return null
  }
  return null
}

const getPrivateProfileByEmail = async (email: string) => {
  const { data, error } = await supabase
    .from('profile_private_data')
    .select('user_id, email')
    .eq('email', email)
    .maybeSingle()
  if (error) throw error
  return data
}

const markPasswordProfile = async (userId: string, email: string) => {
  await supabase.from('profiles').upsert({
    id: userId,
    student_code: email.split('@')[0],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  const now = new Date().toISOString()
  const { data: updated, error: updatePrivateError } = await supabase
    .from('profile_private_data')
    .update({
      email,
      password_set_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()
  if (updatePrivateError) throw updatePrivateError
  if (updated?.user_id) return

  await supabase.from('profile_private_data').insert({
    user_id: userId,
    email,
    data: {},
    password_set_at: now,
    updated_at: now,
  })
}

const deleteRows = async (table: string, column: string, value: string) => {
  const { error } = await supabase.from(table).delete().eq(column, value)
  if (error) console.error(`Skip cleanup ${table}:`, error.message)
}

const getClientInfo = (req: Request) => ({
  ip: req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')
    || req.headers.get('x-real-ip')
    || null,
  userAgent: req.headers.get('user-agent') || null,
})

const getRequestUserOrNull = async (req: Request) => {
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}

const verifyTurnstile = async (req: Request, token: unknown) => {
  const secret = env('TURNSTILE_SECRET_KEY') || env('CLOUDFLARE_TURNSTILE_SECRET_KEY') || env('TURNSTILE_SITE_KEY')
  if (!secret) {
    const error: any = new Error('Hệ thống xác minh đang tạm thời không sẵn sàng.')
    error.statusCode = 500
    throw error
  }

  if (!token || typeof token !== 'string') {
    const error: any = new Error('Vui lòng xác minh bạn không phải robot.')
    error.statusCode = 400
    throw error
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: getClientInfo(req).ip || undefined,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.success) {
    const error: any = new Error('Xác minh bảo mật không thành công. Vui lòng thử lại.')
    error.statusCode = 400
    error.details = result?.['error-codes']
    throw error
  }
}

const insertFeedback = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const row = {
    type: text(payload.type || 'idea', 40),
    content: text(payload.content, 5000),
    contact: text(payload.contact, 500),
    user_id: user?.id || payload.user_id || null,
    full_name: nullableText(payload.full_name, 200),
    student_code: nullableText(payload.student_code, 80),
    email: nullableText(payload.email, 320),
  }
  if (!row.content) {
    const error: any = new Error('Thiếu nội dung góp ý')
    error.statusCode = 400
    throw error
  }
  let { data, error } = await supabase.from('feedback').insert([row]).select('id').single()
  if (error && String(error.message || '').toLowerCase().includes('column')) {
    const fallback = await supabase.from('feedback').insert([{
      type: row.type,
      content: row.content,
      contact: row.contact,
      user_id: row.user_id,
    }]).select('id').single()
    data = fallback.data
    error = fallback.error
  }
  if (error) throw error
  return { id: data?.id }
}

const insertDonation = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const amount = Number.parseInt(String(payload.amount || '').replace(/\D/g, ''), 10) || 0
  if (!text(payload.name, 200) || amount <= 0) {
    const error: any = new Error('Thiếu tên hoặc số tiền ủng hộ.')
    error.statusCode = 400
    throw error
  }
  const { data, error } = await supabase.from('donations').insert([{
    name: text(payload.name, 200),
    student_id: text(payload.student_id || payload.mssv, 80),
    message: text(payload.message, 1000),
    amount,
    user_id: user?.id || null,
  }]).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const insertLostFound = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const row = {
    title: text(payload.title, 200),
    description: text(payload.description, 2000),
    location: text(payload.location, 300),
    contact_info: text(payload.contact_info, 300),
    user_name: text(payload.user_name || 'An danh', 200),
    image_url: nullableText(payload.image_url, 1000),
    type: payload.type === 'FOUND' ? 'FOUND' : 'LOST',
    user_id: user?.id || payload.user_id || null,
    status: 'pending',
  }
  if (!row.title || !row.location || !row.contact_info) {
    const error: any = new Error('Thiếu thông tin bắt buộc.')
    error.statusCode = 400
    throw error
  }
  const { data, error } = await supabase.from('lost_found_items').insert([row]).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const insertEventContribution = async (body: any) => {
  const payload = body?.payload || {}
  const row = {
    title: text(payload.title, 300),
    deadline: payload.close_on_full ? null : nullableText(payload.deadline, 20),
    deadline_time: payload.close_on_full ? null : nullableText(payload.deadline_time, 20),
    close_on_full: Boolean(payload.close_on_full),
    event_date: nullableText(payload.event_date, 20),
    event_time: nullableText(payload.event_time, 20),
    registration_start_date: nullableText(payload.registration_start_date, 20),
    registration_start_time: nullableText(payload.registration_start_time, 20),
    category: text(payload.category, 200),
    criteria: text(payload.criteria, 40),
    points: text(payload.points, 40),
    organizer: text(payload.organizer, 300),
    link: text(payload.link, 1000),
    image_url: nullableText(payload.image_url, 1000),
    format: text(payload.format, 80),
    description: text(payload.description, 5000),
    location_type: text(payload.location_type, 80),
    status: 'pending',
    is_manually_closed: false,
  }
  if (!row.title || !row.link) {
    const error: any = new Error('Thiếu tên sự kiện hoặc link tham gia.')
    error.statusCode = 400
    throw error
  }
  const { data, error } = await supabase.from('events').insert([row]).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const insertBugReport = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const row = {
    user_id: user?.id || payload.user_id || null,
    error_location: text(payload.error_location || payload.location, 500),
    description: text(payload.description, 5000),
  }
  if (!row.error_location || !row.description) {
    const error: any = new Error('Thiếu nội dung báo lỗi.')
    error.statusCode = 400
    throw error
  }
  const { data, error } = await supabase.from('bug_reports').insert([row]).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const insertCourseReport = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const { data, error } = await supabase.from('course_reports').insert({
    course_code: text(payload.course_code, 120),
    subject_name: text(payload.subject_name, 300),
    error_description: text(payload.error_description || payload.description, 3000),
    suggested_correction: nullableText(payload.suggested_correction, 3000),
    user_id: user?.id || payload.user_id || null,
  }).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const insertEventReport = async (body: any, user: any) => {
  const payload = body?.payload || {}
  const { data, error } = await supabase.from('event_reports').insert([{
    event_id: Number.parseInt(String(payload.event_id || ''), 10) || null,
    user_id: user?.id || payload.user_id || null,
    event_name: text(payload.event_name, 300),
    organizer: text(payload.organizer, 300),
    issue_description: text(payload.issue_description || payload.issue, 3000),
    status: 'pending',
  }]).select('id').single()
  if (error) throw error
  return { id: data?.id }
}

const protectedSubmit = async (req: Request, body: any) => {
  await verifyTurnstile(req, body?.turnstileToken)
  const user = await getRequestUserOrNull(req)
  const action = String(body?.action || '')

  const result = action === 'verify-only' ? { verified: true }
    : action === 'feedback' ? await insertFeedback(body, user)
    : action === 'donation' ? await insertDonation(body, user)
    : action === 'lost-found' ? await insertLostFound(body, user)
    : action === 'event-contribution' ? await insertEventContribution(body)
    : action === 'bug-report' ? await insertBugReport(body, user)
    : action === 'course-report' ? await insertCourseReport(body, user)
    : action === 'event-report' ? await insertEventReport(body, user)
    : null

  if (!result) return json({ error: 'Hành động không hợp lệ.' }, 400)
  return json({ success: true, ...result })
}

const recordPolicyConsentForUser = async ({
  req,
  userId,
  policyType,
  policyVersion,
  context,
  metadata = {},
}: {
  req: Request
  userId: string
  policyType: string
  policyVersion?: string
  context?: string
  metadata?: Record<string, unknown>
}) => {
  if (!policyType || !/^[a-z0-9_.:-]{3,80}$/i.test(policyType)) return
  const clientInfo = getClientInfo(req)
  const { error } = await supabase.from('policy_consents').insert({
    user_id: userId,
    user_id_hash: await anonymizedUserHash(userId),
    policy_type: policyType,
    policy_version: String(policyVersion || '2026-06-11').slice(0, 80),
    consent_context: String(context || 'registration').slice(0, 80),
    accepted: true,
    source: 'web',
    ip_address: clientInfo.ip,
    device_info: clientInfo.userAgent,
    metadata,
  })
  if (error) console.error('Failed to record policy consent:', error.message)
}

const recordPolicyConsent = async (req: Request, body: any) => {
  const auth = await getRequestUser(req)
  if (!auth) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401)
  await recordPolicyConsentForUser({
    req,
    userId: auth.user.id,
    policyType: String(body?.policyType || ''),
    policyVersion: body?.policyVersion,
    context: body?.context || 'manual',
    metadata: { action: 'record-policy-consent' },
  })
  return json({ recorded: true })
}

const sendEmail = async ({ email, otp, purpose }: { email: string; otp: string; purpose: string }) => {
  const apiKey = env('RESEND_API_KEY')
  const expireTime = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
  const time = formatVietnamTime(expireTime)
  if (!apiKey) {
    const { data, error } = await supabase.functions.invoke('send-otp-email', {
      body: { email, passcode: otp, time, expiresAt: expireTime.toISOString(), purpose },
    })
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Lỗi hệ thống.')
    return
  }

  const from = env('RESEND_FROM_EMAIL') || 'HUB Planner <onboarding@resend.dev>'
  const copy = getOtpEmailCopy(purpose)
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: email,
      subject: `[OTP-V2:${purpose}] ${otp} là mã xác nhận ${copy.subjectAction} HUB Planner`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><h2 style="margin:0 0 12px;color:#003375">${copy.title}</h2><p>Mã xác nhận để ${copy.actionText} của bạn là:</p><div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#003375;margin:16px 0">${otp}</div><p>Mã này sẽ hết hạn vào lúc <strong>${time}</strong> theo giờ Việt Nam.</p></div>`,
      text: `${otp} là mã xác nhận ${copy.subjectAction} HUB Planner. ${copy.title}. Mã hết hạn lúc ${time} theo giờ Việt Nam.`,
    }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.message || 'Không thể gửi email OTP.')
  }
}

const sendOtp = async (body: any) => {
  const purpose = body?.purpose
  if (!['register', 'forgot_password'].includes(purpose)) return json({ error: 'Loại OTP không hợp lệ.' }, 400)
  const email = await resolveEmail(body?.email || body?.identifier)
  const existingProfile = await getPrivateProfileByEmail(email)
  if (purpose === 'register' && existingProfile?.user_id) return json({ error: 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.' }, 409)
  if (purpose === 'forgot_password' && !existingProfile?.user_id) return json({ error: 'Không tìm thấy tài khoản HUB/MSSV này.' }, 404)

  const { data: latestOtp, error: latestOtpError } = await supabase
    .from('auth_otp_codes')
    .select('created_at, used_at')
    .eq('email', email)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestOtpError) throw latestOtpError
  if (latestOtp && !latestOtp.used_at) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(latestOtp.created_at).getTime()) / 1000)
    const retryAfterSeconds = OTP_COOLDOWN_SECONDS - elapsedSeconds
    if (retryAfterSeconds > 0) {
      return json({
        email,
        error: `Vui lòng chờ ${Math.ceil(retryAfterSeconds / 60)} phút trước khi gửi lại mã OTP.`,
        retryAfterSeconds,
        cooldownUntil: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
      }, 429)
    }
  }

  const otp = randomOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString()
  await supabase.from('auth_otp_codes').update({ used_at: new Date().toISOString() }).eq('email', email).eq('purpose', purpose).is('used_at', null)
  const { error: insertError } = await supabase.from('auth_otp_codes').insert({
    email,
    purpose,
    otp_hash: await hashOtp(email, purpose, otp),
    expires_at: expiresAt,
  })
  if (insertError) throw insertError
  await sendEmail({ email, otp, purpose })
  return json({
    email,
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    retryAfterSeconds: OTP_COOLDOWN_SECONDS,
    cooldownUntil: new Date(Date.now() + OTP_COOLDOWN_SECONDS * 1000).toISOString(),
  })
}

const verifyOtpRecord = async ({ email, purpose, otp }: { email: string; purpose: string; otp: string }) => {
  const { data, error } = await supabase
    .from('auth_otp_codes')
    .select('id, otp_hash, attempts, expires_at')
    .eq('email', email)
    .eq('purpose', purpose)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Mã OTP không tồn tại hoặc đã được sử dụng.')
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error('Mã OTP đã hết hạn.')
  if (data.attempts >= MAX_ATTEMPTS) throw new Error('Bạn đã nhập sai quá nhiều lần. Hãy gửi lại mã mới.')
  if (data.otp_hash !== await hashOtp(email, purpose, otp)) {
    await supabase.from('auth_otp_codes').update({ attempts: data.attempts + 1 }).eq('id', data.id)
    throw new Error('Mã OTP không chính xác.')
  }
  await supabase.from('auth_otp_codes').update({ used_at: new Date().toISOString() }).eq('id', data.id)
}

const verifyOtp = async (req: Request, body: any) => {
  const purpose = body?.purpose
  const email = normalizeEmail(body?.email)
  const otp = String(body?.otp || '').replace(/\D/g, '').slice(0, 6)
  const password = String(body?.password || '')
  const confirmPassword = body?.confirmPassword !== undefined ? String(body.confirmPassword) : undefined
  if (!['register', 'forgot_password'].includes(purpose)) return json({ error: 'Loại OTP không hợp lệ.' }, 400)
  if (!email.endsWith(`@${SCHOOL_DOMAIN}`)) return json({ error: `Chỉ hỗ trợ Gmail HUB @${SCHOOL_DOMAIN}.` }, 400)
  if (otp.length !== 6) return json({ error: 'Mã OTP cần đủ 6 chữ số.' }, 400)
  const invalidPassword = passwordError(password, confirmPassword)
  if (invalidPassword) return json({ error: invalidPassword }, 400)

  await verifyOtpRecord({ email, purpose, otp })
  if (purpose === 'register') {
    const existingProfile = await getPrivateProfileByEmail(email)
    if (existingProfile?.user_id) {
      const { error } = await supabase.auth.admin.updateUserById(existingProfile.user_id, { password, user_metadata: { password_set_at: true } })
      if (error) throw error
      await markPasswordProfile(existingProfile.user_id, email)
      if (Array.isArray(body?.acceptedPolicies)) {
        for (const policy of body.acceptedPolicies) {
          await recordPolicyConsentForUser({
            req,
            userId: existingProfile.user_id,
            policyType: String(policy?.type || policy),
            policyVersion: policy?.version,
            context: policy?.context || 'registration',
            metadata: { auth_flow: 'register_existing_profile_password_update' },
          })
        }
      }
      return json({ email, created: false, passwordUpdated: true })
    }
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { password_set_at: true } })
    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
        const existingUser = await getAuthUserByEmail(email)
        if (!existingUser?.id) throw error
        const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
          password,
          user_metadata: { ...(existingUser.user_metadata || {}), password_set_at: true },
        })
        if (updateError) throw updateError
        await markPasswordProfile(existingUser.id, email)
        if (Array.isArray(body?.acceptedPolicies)) {
          for (const policy of body.acceptedPolicies) {
            await recordPolicyConsentForUser({
              req,
              userId: existingUser.id,
              policyType: String(policy?.type || policy),
              policyVersion: policy?.version,
              context: policy?.context || 'registration',
              metadata: { auth_flow: 'register_existing_auth_password_update' },
            })
          }
        }
        return json({ email, created: false, passwordUpdated: true })
      }
      throw error
    }
    if (data.user?.id) {
      await markPasswordProfile(data.user.id, email)
      if (Array.isArray(body?.acceptedPolicies)) {
        for (const policy of body.acceptedPolicies) {
          await recordPolicyConsentForUser({
            req,
            userId: data.user.id,
            policyType: String(policy?.type || policy),
            policyVersion: policy?.version,
            context: policy?.context || 'registration',
            metadata: { auth_flow: 'register_new_user' },
          })
        }
      }
    }
    return json({ email, created: true })
  }

  const profile: any = await getPrivateProfileByEmail(email)
  if (profile?.user_id) profile.id = profile.user_id
  if (!profile?.id) throw new Error('Không tìm thấy tài khoản cần đặt lại mật khẩu.')
  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password })
  if (updateError) throw updateError
  await supabase.from('profile_private_data').update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', profile.id)
  await supabase.from('profiles').update({ password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', profile.id)
  return json({ email, passwordUpdated: true })
}

const getRequestUser = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { token, user: data.user }
}

const deleteAccount = async (req: Request) => {
  const auth = await getRequestUser(req)
  if (!auth) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401)
  const userId = auth.user.id
  const email = normalizeEmail(auth.user.email || '')
  const userIdHash = await anonymizedUserHash(userId)
  try {
    const { data: avatarFiles, error } = await supabase.storage.from('avatars').list(userId)
    if (!error && avatarFiles?.length) {
      await supabase.storage.from('avatars').remove(avatarFiles.map((file: any) => `${userId}/${file.name}`))
    }
  } catch (error) {
    console.error('Skip avatar cleanup:', error)
  }
  await supabase.rpc('anonymize_deleted_user_logs', {
    p_user_id: userId,
    p_user_id_hash: userIdHash,
    p_reason: 'account_hard_delete',
  }).then(({ error }) => {
    if (error) console.error('Skip log anonymization:', error.message)
  })

  await supabase.from('activity_logs').insert({
    user_id: null,
    user_email: null,
    action: 'delete_account_hard_delete',
      law_reference: 'Khoản 11 Điều 2 LBVDL năm 2025',
    target_id: userIdHash,
    details: {
      anonymized: true,
      user_id_hash: userIdHash,
      legal_technique: 'de-identification',
      law_reference: 'Khoản 11 Điều 2 LBVDL năm 2025',
    },
    metadata: {
      source: 'auth_edge_function',
      deleted_tables_policy: 'hard_delete_personal_data',
    },
    status: 'success',
    created_at: new Date().toISOString(),
  })

  const userIdTables = [
    'ai_chat_logs',
    'benchmark_rankings',
    'bug_reports',
    'comment_likes',
    'comments',
    'course_reports',
    'ctv_requests',
    'donations',
    'event_reports',
    'feedback',
    'lost_found_items',
    'user_schedules',
    'user_participations',
    'user_course_requests',
    'user_roles',
    'notifications',
    'payment_requests',
    'practice_attempts',
    'practice_pro_access',
    'profile_private_data',
    'push_subscriptions',
    'schedule_reminders',
    'subscriptions',
  ]
  for (const table of userIdTables) await deleteRows(table, 'user_id', userId)
  if (email) await deleteRows('auth_otp_codes', 'email', email)
  await deleteRows('profiles', 'id', userId)
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw error
  return json({ deleted: true })
}

const createAvatarUpload = async (req: Request, body: any) => {
  const auth = await getRequestUser(req)
  if (!auth) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401)
  const { endpoint, host, bucket, accessKeyId, secretAccessKey, publicBaseUrl } = getR2Config()
  const contentType = String(body?.contentType || 'image/webp')
  const size = Number(body?.size || 0)
  if (!contentType.startsWith('image/')) return json({ error: 'File avatar phải là ảnh.' }, 400)
  if (!size || size > 350 * 1024) return json({ error: 'Avatar cần nhỏ hơn 350kb sau khi nén.' }, 400)

  const extension = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'
  const key = `avatars/${auth.user.id}/${Date.now()}.${extension}`
  const encodedKey = encodeR2Path(key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const expires = 300
  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  })
  const canonicalRequest = ['PUT', `/${bucket}/${encodedKey}`, queryParams.toString(), `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const signature = await hmacHex(await getSignatureKey(secretAccessKey, dateStamp, region, service), stringToSign)
  queryParams.set('X-Amz-Signature', signature)
  return json({
    uploadUrl: `${endpoint}/${bucket}/${encodedKey}?${queryParams.toString()}`,
    publicUrl: `${publicBaseUrl.replace(/\/$/, '')}/${encodedKey}`,
    key,
    expiresInSeconds: expires,
  })
}

const uploadAvatar = async (req: Request, body: any) => {
  const auth = await getRequestUser(req)
  if (!auth) return json({ error: 'Phiên đăng nhập không hợp lệ' }, 401)
  const { publicBaseUrl } = getR2Config()
  const contentType = String(body?.contentType || 'image/webp')
  const size = Number(body?.size || 0)
  const base64 = String(body?.base64 || '')
  if (!contentType.startsWith('image/')) return json({ error: 'File avatar phải là ảnh.' }, 400)
  if (!size || size > 350 * 1024) return json({ error: 'Avatar cần nhỏ hơn 350kb sau khi nén.' }, 400)
  if (!base64) return json({ error: 'Thiếu dữ liệu avatar.' }, 400)
  const bytes = base64ToBytes(base64)
  if (!bytes.length || Math.abs(bytes.length - size) > 8) return json({ error: 'Dữ liệu avatar không hợp lệ.' }, 400)
  const extension = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'
  const key = `avatars/${auth.user.id}/${Date.now()}.${extension}`
  await putR2Object({ key, body: bytes, contentType })
  return json({ publicUrl: `${publicBaseUrl.replace(/\/$/, '')}/${encodeR2Path(key)}`, key })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })
  if (req.method !== 'POST') return json({ error: 'Lỗi hệ thống.' }, 405)
  try {
    const resource = new URL(req.url).searchParams.get('resource')
    const body = await req.json().catch(() => ({}))
    if (resource === 'protected-submit') return await protectedSubmit(req, body)

    const action = body?.action
    if (action === 'resolve-identifier') return json({ email: await resolveEmail(body?.identifier) })
    if (action === 'send-otp') return await sendOtp(body)
    if (action === 'verify-otp') return await verifyOtp(req, body)
    if (action === 'record-policy-consent') return await recordPolicyConsent(req, body)
    if (action === 'delete-account') return await deleteAccount(req)
    if (action === 'create-avatar-upload') return await createAvatarUpload(req, body)
    if (action === 'upload-avatar') return await uploadAvatar(req, body)
    return json({ error: 'Thao tác không hợp lệ.' }, 400)
  } catch (error: any) {
    const statusCode = error?.statusCode || 500
    const message = error?.message?.includes('already been registered')
      ? 'Email này đã được đăng ký. Hãy chuyển sang đăng nhập.'
      : error?.message || 'Không thể xử lý xác thực.'
    return json({ error: message }, statusCode)
  }
})
