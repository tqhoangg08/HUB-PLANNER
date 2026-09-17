const textEncoder = new TextEncoder();

export interface NativeWebPushEnv {
  VITE_VAPID_PUBLIC_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export interface StoredPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// These categories deliberately carry no endpoint, key, provider response body,
// or exception text. They make a transport failure observable without turning
// Web Push delivery logs into a subscription-data store.
export type WebPushFailureClass =
  | 'provider_http'
  | 'transport_timeout'
  | 'transport_network'
  | 'subscription_endpoint_invalid'
  | 'subscription_crypto_invalid'
  | 'vapid_configuration';

export class WebPushError extends Error {
  readonly statusCode?: number;
  readonly failureClass: WebPushFailureClass;
  constructor(message: string, statusCode?: number, failureClass: WebPushFailureClass = 'provider_http') {
    super(message);
    this.name = 'WebPushError';
    this.statusCode = statusCode;
    this.failureClass = failureClass;
  }
}

const fromBase64Url = (value: string) => {
  const base64 = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const concat = (...arrays: Uint8Array[]) => {
  const result = new Uint8Array(arrays.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  arrays.forEach((value) => { result.set(value, offset); offset += value.length; });
  return result;
};

const hmac = async (key: Uint8Array, data: Uint8Array) => {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
};

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
};

const makeJwt = async (endpoint: string, subject: string, publicKey: string, privateKey: string) => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new WebPushError('Invalid push subscription endpoint', undefined, 'subscription_endpoint_invalid');
  }
  let publicBytes: Uint8Array;
  let privateBytes: Uint8Array;
  try {
    publicBytes = fromBase64Url(publicKey);
    privateBytes = fromBase64Url(privateKey);
  } catch {
    throw new WebPushError('Invalid VAPID key configuration', undefined, 'vapid_configuration');
  }
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new WebPushError('Invalid VAPID key configuration', undefined, 'vapid_configuration');
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
      d: toBase64Url(privateBytes), ext: true,
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    throw new WebPushError('Invalid VAPID key configuration', undefined, 'vapid_configuration');
  }
  const header = toBase64Url(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = toBase64Url(textEncoder.encode(JSON.stringify({
    aud: `${url.protocol}//${url.host}`,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, textEncoder.encode(unsigned),
  ));
  return `${unsigned}.${toBase64Url(signature)}`;
};

const encrypt = async (subscription: StoredPushSubscription, payload: string) => {
  try {
    const userPublicKey = fromBase64Url(subscription.p256dh);
    const authSecret = fromBase64Url(subscription.auth);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const serverKeys = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
    ) as CryptoKeyPair;
    const serverPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey) as ArrayBuffer);
    const importedUserKey = await crypto.subtle.importKey(
      'raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
    );
    const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'ECDH', public: importedUserKey } as any,
      serverKeys.privateKey, 256,
    ));
    const keyInfo = concat(textEncoder.encode('WebPush: info'), new Uint8Array([0]), userPublicKey, serverPublicKey);
    const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
    const cek = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: nonce\0'), 12);
    const plaintext = concat(textEncoder.encode(payload), new Uint8Array([2]));
    const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext,
    ));
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, 4096, false);
    return concat(salt, recordSize, new Uint8Array([serverPublicKey.length]), serverPublicKey, ciphertext);
  } catch (error) {
    if (error instanceof WebPushError) throw error;
    throw new WebPushError('Invalid push subscription encryption material', undefined, 'subscription_crypto_invalid');
  }
};

export const sendWebPush = async (
  env: NativeWebPushEnv,
  subscription: StoredPushSubscription,
  payload: object,
  fetcher: typeof fetch = fetch,
) => {
  const publicKey = String(env.VAPID_PUBLIC_KEY || env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) throw new WebPushError('VAPID configuration is unavailable', undefined, 'vapid_configuration');
  const jwt = await makeJwt(
    subscription.endpoint,
    String(env.VAPID_SUBJECT || 'mailto:admin@hotrosinhvienhub.id.vn'),
    publicKey,
    privateKey,
  );
  const body = await encrypt(subscription, JSON.stringify(payload));
  let response: Response;
  try {
    response = await fetcher(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const failureClass = name === 'TimeoutError' || name === 'AbortError' ? 'transport_timeout' : 'transport_network';
    throw new WebPushError('Push provider transport failed', undefined, failureClass);
  }
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new WebPushError(`Push provider returned ${response.status}`, response.status, 'provider_http');
  return response.status;
};
