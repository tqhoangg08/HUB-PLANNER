import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (!arg.startsWith('--')) continue
  const [key, inlineValue] = arg.slice(2).split('=')
  const value = inlineValue ?? (process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i] ?? 'true')
  args.set(key, value)
}

const LIMIT = Math.max(1, Number(args.get('limit') || 1))
const MIN_TEXT_LENGTH = Math.max(80, Number(args.get('min-chars') || 180))
const DOCKER_IMAGE = args.get('image') || 'jbarlow83/ocrmypdf:latest'
const OCR_LANGUAGE = args.get('lang') || 'vie+eng'
const OCR_TIMEOUT_MS = Math.max(30_000, Number(args.get('timeout-ms') || 10 * 60 * 1000))
const TESSDATA_DIR = path.resolve('.cache', 'tessdata')
const OCR_DEBUG_DIR = path.resolve('.cache', 'ocr-debug')
const TESSDATA_CONTAINER_PATH = '/usr/share/tesseract-ocr/5/tessdata'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEYS
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env/.env.local.')
}
if (GEMINI_KEYS.length === 0) {
  throw new Error('Missing GEMINI_API_KEY or GEMINI_API_KEYS in .env/.env.local.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function looksLikeBrokenPdfText(text) {
  const sample = text.slice(0, 3000)
  const alphaWords = sample.match(/\b[\p{L}\d]{4,}\b/gu) || []
  const digitInsideWords = alphaWords.filter((word) => /[\p{L}]\d|\d[\p{L}]/u.test(word)).length
  const digitNoiseRatio = alphaWords.length ? digitInsideWords / alphaWords.length : 0
  const obviousOcrLayerNoise = /\b(FIANG|NIJOC|DAr|HEC|DQc|phric|gi6y|chring|tl6nh|hgc|NIIA|IIANG|TRIJONG)\b/i.test(sample)
  return obviousOcrLayerNoise || digitNoiseRatio > 0.04
}

function chunkText(text, { minWords = 350, maxWords = 800, overlapWords = 80 } = {}) {
  const words = normalizeExtractedText(text).split(/\s+/).filter(Boolean)
  const chunks = []
  let start = 0
  while (start < words.length) {
    let end = Math.min(start + maxWords, words.length)
    if (end < words.length) {
      for (let i = end; i > start + minWords; i -= 1) {
        if (/[.!?;:]$/.test(words[i - 1])) {
          end = i
          break
        }
      }
    }
    chunks.push(words.slice(start, end).join(' '))
    if (end >= words.length) break
    start = Math.max(0, end - overlapWords)
  }
  return chunks
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function encodeR2Path(key) {
  return key.split('/').map(encodeURIComponent).join('/')
}

async function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

async function uploadObjectToR2(key, body, contentType) {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET_NAME
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.')
  }

  const host = `${accountId}.r2.cloudflarestorage.com`
  const encodedKey = encodeR2Path(key)
  const requestPath = `/${bucket}/${encodedKey}`
  const url = `https://${host}${requestPath}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const payloadHash = sha256Hex(body)
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', requestPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`R2 upload failed ${response.status}. ${detail}`.trim())
  }
  return key
}

async function uploadTextToR2(key, text) {
  return uploadObjectToR2(key, Buffer.from(text, 'utf8'), 'text/plain; charset=utf-8')
}

async function embedText(text) {
  const key = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)]
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 18000) }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini embedding failed ${response.status}`)
  return payload.embedding?.values || []
}

function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${OCR_TIMEOUT_MS}ms`))
    }, OCR_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited with ${code}\n${stderr || stdout}`))
    })
  })
}

async function ocrPdfWithDocker(inputPdfPath, outputTextPath, outputPdfPath, workDir) {
  const extraDockerArgs = []
  if (OCR_LANGUAGE.split('+').includes('vie')) {
    const viePath = await ensureVietnameseTessdata()
    extraDockerArgs.push('-v', `${viePath.replace(/\\/g, '/')}:/usr/share/tesseract-ocr/5/tessdata/vie.traineddata:ro`)
  }

  await runCommand('docker', [
    'run',
    '--rm',
    '-v',
    `${workDir.replace(/\\/g, '/')}:/work`,
    ...extraDockerArgs,
    DOCKER_IMAGE,
    '--force-ocr',
    '--invalidate-digital-signatures',
    '--sidecar',
    '/work/ocr.txt',
    '-l',
    OCR_LANGUAGE,
    '/work/input.pdf',
    '/work/output.pdf',
  ])
  await fs.access(outputTextPath)
  await fs.access(outputPdfPath).catch(() => {})
}

async function ensureVietnameseTessdata() {
  await fs.mkdir(TESSDATA_DIR, { recursive: true })
  const targetPath = path.join(TESSDATA_DIR, 'vie.traineddata')
  try {
    const stat = await fs.stat(targetPath)
    if (stat.size > 1_000_000) return targetPath
  } catch {
    // Download below.
  }

  console.log('Downloading Vietnamese Tesseract language data...')
  const response = await fetch('https://github.com/tesseract-ocr/tessdata_fast/raw/main/vie.traineddata')
  if (!response.ok) throw new Error(`Failed to download vie.traineddata (${response.status})`)
  await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()))
  return targetPath
}

async function fetchCandidates() {
  const { data, error } = await supabase
    .from('school_notifications')
    .select('id, title, department, published_date, detail_url, pdf_url')
    .in('extraction_status', ['failed', 'need_review'])
    .not('pdf_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(LIMIT)
  if (error) throw error
  return data || []
}

async function upsertChunks(notification, text) {
  const chunks = chunkText(text)
  await supabase.from('notification_chunks').delete().eq('notification_id', notification.id)

  const rows = []
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    let embedding = null
    try {
      embedding = await embedText([notification.title, notification.published_date || '', chunk].join('\n'))
    } catch (error) {
      console.warn(`Embedding failed for ${notification.id} chunk ${index}: ${error.message}`)
    }
    rows.push({
      notification_id: notification.id,
      chunk_text: chunk,
      chunk_index: index,
      embedding: embedding ? `[${embedding.join(',')}]` : null,
      title: notification.title,
      published_date: notification.published_date,
      detail_url: notification.detail_url,
      pdf_url: notification.pdf_url,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('notification_chunks').insert(rows)
    if (error) throw error
  }
  return rows.length
}

async function processNotification(notification) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `hub-ocr-${notification.id}-`))
  const inputPdfPath = path.join(workDir, 'input.pdf')
  const outputPdfPath = path.join(workDir, 'output.pdf')
  const outputTextPath = path.join(workDir, 'ocr.txt')

  try {
    console.log(`OCR: ${notification.title}`)
    const response = await fetch(notification.pdf_url)
    if (!response.ok) throw new Error(`PDF download failed ${response.status}: ${notification.pdf_url}`)
    const pdfBytes = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(inputPdfPath, pdfBytes)
    await ocrPdfWithDocker(inputPdfPath, outputTextPath, outputPdfPath, workDir)

    const text = normalizeExtractedText(await fs.readFile(outputTextPath, 'utf8'))
    if (text.length < MIN_TEXT_LENGTH || looksLikeBrokenPdfText(text)) {
      await fs.mkdir(OCR_DEBUG_DIR, { recursive: true })
      await fs.writeFile(path.join(OCR_DEBUG_DIR, `${notification.id}.txt`), text || '')
      throw new Error(`OCR output is too short or corrupted (${text.length} chars).`)
    }

    const contentHash = sha256Hex(`${notification.detail_url}\n${text}`)
    const textKey = await uploadTextToR2(`school-notifications/${contentHash}.txt`, text)
    const chunkCount = await upsertChunks(notification, text)
    const { error } = await supabase
      .from('school_notifications')
      .update({
        extracted_text_file_path: textKey,
        extracted_text: null,
        extraction_method: 'ocr',
        extraction_status: 'success',
        extraction_error: null,
        content_hash: contentHash,
        last_crawled_at: new Date().toISOString(),
      })
      .eq('id', notification.id)
    if (error) throw error

    console.log(`OK: ${chunkCount} chunk(s), ${text.length} chars`)
  } catch (error) {
    const { error: updateError } = await supabase
      .from('school_notifications')
      .update({
        extraction_status: 'need_review',
        extraction_error: `Local OCR failed: ${error.message}`,
        last_crawled_at: new Date().toISOString(),
      })
      .eq('id', notification.id)
    if (updateError) console.warn(`Failed to save OCR error for ${notification.id}: ${updateError.message}`)
    console.error(`FAILED: ${notification.title}\n${error.message}`)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

const candidates = await fetchCandidates()
if (candidates.length === 0) {
  console.log('No failed/need_review notifications with PDF URL found.')
  process.exit(0)
}

console.log(`Found ${candidates.length} candidate(s).`)
for (const notification of candidates) {
  await processNotification(notification)
}
