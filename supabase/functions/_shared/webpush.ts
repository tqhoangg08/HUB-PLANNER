// supabase/functions/_shared/webpush.ts
const textEncoder = new TextEncoder()

type PushSubscriptionLike = {
  endpoint: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

export class WebPushError extends Error {
  statusCode?: number
  body?: string

  constructor(message: string, statusCode?: number, body?: string) {
    super(message)
    this.name = 'WebPushError'
    this.statusCode = statusCode
    this.body = body
  }
}

const base64UrlToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const uint8ArrayToBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const concatBytes = (...arrays: Uint8Array[]) => {
  const size = arrays.reduce((total, item) => total + item.length, 0)
  const result = new Uint8Array(size)
  let offset = 0
  arrays.forEach((item) => {
    result.set(item, offset)
    offset += item.length
  })
  return result
}

const hmacSha256 = async (key: Uint8Array, data: Uint8Array) => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => {
  const prk = await hmacSha256(salt, ikm)
  const okm = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

const makeJwt = async (endpoint: string, subject: string, publicKey: string, privateKey: string) => {
  const endpointUrl = new URL(endpoint)
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`
  const publicBytes = base64UrlToUint8Array(publicKey)
  const privateBytes = base64UrlToUint8Array(privateKey)

  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new WebPushError('Invalid VAPID public key')
  }
  if (privateBytes.length !== 32) {
    throw new WebPushError('Invalid VAPID private key')
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: uint8ArrayToBase64Url(publicBytes.slice(1, 33)),
    y: uint8ArrayToBase64Url(publicBytes.slice(33, 65)),
    d: uint8ArrayToBase64Url(privateBytes),
    ext: true,
  }
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const header = uint8ArrayToBase64Url(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = uint8ArrayToBase64Url(textEncoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })))
  const unsignedToken = `${header}.${payload}`
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    textEncoder.encode(unsignedToken),
  ))

  return `${unsignedToken}.${uint8ArrayToBase64Url(signature)}`
}

const encryptPayload = async (subscription: PushSubscriptionLike, payload: string) => {
  const userPublicKey = subscription.keys?.p256dh
  const authSecret = subscription.keys?.auth
  if (!userPublicKey || !authSecret) {
    throw new WebPushError('Subscription is missing p256dh/auth keys')
  }

  const userPublicKeyBytes = base64UrlToUint8Array(userPublicKey)
  const authSecretBytes = base64UrlToUint8Array(authSecret)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const serverPublicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey))
  const importedUserPublicKey = await crypto.subtle.importKey(
    'raw',
    userPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: importedUserPublicKey },
    serverKeyPair.privateKey,
    256,
  ))

  const keyInfo = concatBytes(
    textEncoder.encode('WebPush: info'),
    new Uint8Array([0]),
    userPublicKeyBytes,
    serverPublicKeyBytes,
  )
  const ikm = await hkdf(authSecretBytes, sharedSecret, keyInfo, 32)
  const cek = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: nonce\0'), 12)

  const payloadBytes = textEncoder.encode(payload)
  const record = concatBytes(payloadBytes, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)

  return concatBytes(
    salt,
    rs,
    new Uint8Array([serverPublicKeyBytes.length]),
    serverPublicKeyBytes,
    ciphertext,
  )
}

export const sendWebPush = async (
  subscription: PushSubscriptionLike,
  payload: string,
  options: { ttl?: number; subject?: string } = {},
) => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('VITE_VAPID_PUBLIC_KEY') || ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''

  if (!publicKey || !privateKey) {
    throw new WebPushError('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY')
  }
  if (!subscription?.endpoint) {
    throw new WebPushError('Missing push endpoint')
  }

  const jwt = await makeJwt(subscription.endpoint, options.subject || 'mailto:admin@hotrosinhvienhub.id.vn', publicKey, privateKey)
  const encryptedBody = await encryptPayload(subscription, payload)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttl ?? 60 * 60 * 24),
      Urgency: 'normal',
    },
    body: encryptedBody,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new WebPushError(`Push service returned ${response.status}`, response.status, body)
  }

  return { statusCode: response.status, body: await response.text().catch(() => '') }
}
