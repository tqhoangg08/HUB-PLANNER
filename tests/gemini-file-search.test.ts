import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_GEMINI_CHAT_MODEL,
  getGeminiChatModel,
  getGeminiThinkingLevel,
  getChatApiKeys,
  isFileSearchConfigured,
  runWithChatKeyPool,
} from '../server/gemini-config.js';
import {
  buildDocumentMetadataFilter,
  extractDocumentSources,
  sanitizeFileName,
  validateDocumentFile,
  validateDocumentSignature,
  validateStoragePath,
  sha256,
} from '../server/ai-documents.js';

const restoreEnv = (name:string, value:string|undefined) => value === undefined ? delete process.env[name] : process.env[name] = value;

test('default model is Gemini 3.5 Flash-Lite', () => {
  const previous = process.env.GEMINI_CHAT_MODEL; delete process.env.GEMINI_CHAT_MODEL;
  assert.equal(getGeminiChatModel(), DEFAULT_GEMINI_CHAT_MODEL);
  restoreEnv('GEMINI_CHAT_MODEL', previous);
});

test('invalid thinking level falls back to minimal', () => {
  const previous = process.env.GEMINI_THINKING_LEVEL; process.env.GEMINI_THINKING_LEVEL = 'extreme';
  assert.equal(getGeminiThinkingLevel(), 'minimal'); restoreEnv('GEMINI_THINKING_LEVEL', previous);
});

test('accepts only supported thinking levels', () => {
  const previous = process.env.GEMINI_THINKING_LEVEL;
  for (const level of ['minimal','medium','high']) { process.env.GEMINI_THINKING_LEVEL = level; assert.equal(getGeminiThinkingLevel(), level); }
  restoreEnv('GEMINI_THINKING_LEVEL', previous);
});

test('chat key pool never consumes the dedicated File Search key and retries each key once', async () => {
  const oldPool=process.env.GEMINI_API_KEYS, oldFile=process.env.GEMINI_FILE_SEARCH_API_KEY;
  process.env.GEMINI_API_KEYS='chat-a,chat-b,chat-c'; process.env.GEMINI_FILE_SEARCH_API_KEY='file-only';
  assert.deepEqual(new Set(getChatApiKeys()), new Set(['chat-a','chat-b','chat-c']));
  const calls:any[]=[];
  await runWithChatKeyPool(async(client:any)=>{calls.push(client);if(calls.length<3)throw Object.assign(new Error('rate limit'),{status:429});return 'ok'});
  assert.equal(calls.length,3);
  restoreEnv('GEMINI_API_KEYS',oldPool);restoreEnv('GEMINI_FILE_SEARCH_API_KEY',oldFile);
});

test('chat key pool does not retry invalid 400 requests', async () => {
  const oldPool=process.env.GEMINI_API_KEYS;process.env.GEMINI_API_KEYS='chat-a,chat-b';let calls=0;
  await assert.rejects(() => runWithChatKeyPool(async()=>{calls+=1;throw Object.assign(new Error('invalid request'),{status:400})}));
  assert.equal(calls,1);restoreEnv('GEMINI_API_KEYS',oldPool);
});

test('chat key pool stops after every configured account was tried once', async () => {
  const oldPool=process.env.GEMINI_API_KEYS;process.env.GEMINI_API_KEYS='one,two,three';let calls=0;
  await assert.rejects(() => runWithChatKeyPool(async()=>{calls+=1;throw Object.assign(new Error('unavailable'),{status:503})}));
  assert.equal(calls,3);restoreEnv('GEMINI_API_KEYS',oldPool);
});

test('missing File Search env disables retrieval without affecting chat keys', () => {
  const oldEnabled=process.env.GEMINI_FILE_SEARCH_ENABLED,oldKey=process.env.GEMINI_FILE_SEARCH_API_KEY,oldStore=process.env.GEMINI_FILE_SEARCH_STORE;
  process.env.GEMINI_FILE_SEARCH_ENABLED='true';delete process.env.GEMINI_FILE_SEARCH_API_KEY;delete process.env.GEMINI_FILE_SEARCH_STORE;
  assert.equal(isFileSearchConfigured(),false);
  restoreEnv('GEMINI_FILE_SEARCH_ENABLED',oldEnabled);restoreEnv('GEMINI_FILE_SEARCH_API_KEY',oldKey);restoreEnv('GEMINI_FILE_SEARCH_STORE',oldStore);
});

test('File Search stays disabled unless explicitly enabled', () => {
  const oldEnabled=process.env.GEMINI_FILE_SEARCH_ENABLED,oldKey=process.env.GEMINI_FILE_SEARCH_API_KEY,oldStore=process.env.GEMINI_FILE_SEARCH_STORE;
  process.env.GEMINI_FILE_SEARCH_ENABLED='false';process.env.GEMINI_FILE_SEARCH_API_KEY='dedicated';process.env.GEMINI_FILE_SEARCH_STORE='fileSearchStores/test';
  assert.equal(isFileSearchConfigured(),false);
  restoreEnv('GEMINI_FILE_SEARCH_ENABLED',oldEnabled);restoreEnv('GEMINI_FILE_SEARCH_API_KEY',oldKey);restoreEnv('GEMINI_FILE_SEARCH_STORE',oldStore);
});

test('SHA-256 detects duplicate document content', () => {
  const first=sha256(Buffer.from('same-content'));const second=sha256(Buffer.from('same-content'));
  assert.equal(first,second);assert.notEqual(first,sha256(Buffer.from('different')));
});

test('validates extension, MIME, size and traversal', () => {
  assert.equal(validateDocumentFile({ fileName:'rule.pdf', mimeType:'application/pdf', fileSize:100 }).mimeType, 'application/pdf');
  assert.throws(() => validateDocumentFile({ fileName:'x.exe', mimeType:'application/octet-stream', fileSize:100 }));
  assert.throws(() => validateDocumentFile({ fileName:'x.pdf', mimeType:'text/plain', fileSize:100 }));
  assert.throws(() => validateStoragePath('../secret.pdf', 'user'));
  assert.equal(sanitizeFileName('../../a.pdf').includes('/'), false);
});

test('rejects empty and oversized documents', () => {
  assert.throws(() => validateDocumentFile({ fileName:'empty.pdf', mimeType:'application/pdf', fileSize:0 }));
  assert.throws(() => validateDocumentFile({ fileName:'large.pdf', mimeType:'application/pdf', fileSize:21*1024*1024 }));
});

test('storage path must stay inside the authenticated admin folder', () => {
  assert.throws(() => validateStoragePath('other/file.pdf','admin-user'));
  assert.equal(validateStoragePath('admin-user/file.pdf','admin-user'),'admin-user/file.pdf');
});

test('validates file content signatures instead of trusting browser MIME alone', () => {
  assert.equal(validateDocumentSignature(Buffer.from('%PDF-1.7 sample'),'pdf'),true);
  assert.equal(validateDocumentSignature(Buffer.from([0x50,0x4b,0x03,0x04,1,2,3]),'docx'),true);
  assert.throws(() => validateDocumentSignature(Buffer.from('not a pdf'),'pdf'));
  assert.throws(() => validateDocumentSignature(Buffer.from([0,1,2]),'txt'));
});

test('metadata filter escapes quotes and backslashes', () => {
  const result = buildDocumentMetadataFilter({ programCode:'K"39\\X' });
  assert.match(result, /K\\"39\\\\X/);
});

test('metadata filter defaults to public general documents', () => {
  assert.equal(buildDocumentMetadataFilter({}), 'visibility = "public"');
  assert.match(buildDocumentMetadataFilter({ programCode:'K39' }), /program_code = "all"/);
});

test('extracts and deduplicates real file citations', () => {
  const interaction = { steps:[{ type:'model_output', content:[{ type:'text', text:'x', annotations:[
    { type:'file_citation', file_name:'Quy che.pdf', source:'stores/s/documents/1', page_number:12 },
    { type:'file_citation', file_name:'Quy che.pdf', source:'stores/s/documents/1', page_number:12 },
  ] }]}] };
  assert.deepEqual(extractDocumentSources(interaction), [{ documentId:null,fileName:'Quy che.pdf',title:null,pageNumber:12,source:'stores/s/documents/1',category:null,storagePath:null }]);
});

test('citation extraction ignores model text and unrelated annotations', () => {
  const interaction={steps:[{type:'model_output',content:[{type:'text',text:'Nguồn: tài liệu tự viết',annotations:[{type:'url_citation',url:'https://example.com'}]}]}]};
  assert.deepEqual(extractDocumentSources(interaction),[]);
});

test('repository no longer hard-codes the retired chat model or old Gemini SDK', () => {
  const files=['cloudflare/worker/src/ai-advisor.ts','cloudflare/worker/src/gemini-file-search.ts','supabase/functions/bot/index.ts','supabase/functions/_shared/hub_notifications.ts','package.json'];
  const source=files.map((file)=>fs.readFileSync(file,'utf8')).join('\n');
  assert.doesNotMatch(source,/gemini-3\.1-flash-lite/);
  assert.doesNotMatch(source,/@google\/generative-ai|GoogleGenerativeAI/);
});

test('Cloudflare AI response and history persist document-source metadata', () => {
  const source=fs.readFileSync('cloudflare/worker/src/ai-advisor.ts','utf8');
  assert.match(source,/sourcesWithLocators/);
  assert.match(source,/documentSearchUnavailable/);
  assert.match(source,/document_sources:\s*(?:result\.documentSources|\[\])/);
});

test('Cloudflare AI keeps provider fallback attempts bounded', () => {
  const source=fs.readFileSync('cloudflare/worker/src/ai-advisor.ts','utf8');
  assert.match(source,/availableKeys\.slice\(0, 3\)/);
  assert.match(source,/AbortSignal\.timeout\(25_000\)/);
});
