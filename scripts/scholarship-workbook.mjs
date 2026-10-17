import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { SCHOLARSHIP_MAX_BODY, SCHOLARSHIP_MAX_ROWS, scholarshipSha256, validateScholarshipImport } from '../shared/scholarship-import.ts';

const fail = code => { throw new Error(code); };
const MAX_SOURCE = 4 * 1024 * 1024, MAX_EXPANDED = 16 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let bit = 0; bit < 8; bit++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
const crc32 = bytes => {
  let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
};
/** Inspect and actually inflate each ZIP member with a hard output bound before ExcelJS.
 * Never extract paths, execute macros/formulas, or trust advertised ZIP lengths. */
export const checkScholarshipZip = bytes => {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6)) fail('INVALID_XLSX_ZIP');
  const count = bytes.readUInt16LE(eocd + 10), directorySize = bytes.readUInt32LE(eocd + 12);
  let cursor = bytes.readUInt32LE(eocd + 16), total = 0;
  if (count < 1 || count > 128 || cursor + directorySize !== eocd || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length) fail('XLSX_ZIP_LIMIT');
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('INVALID_XLSX_ZIP');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extra + comment > eocd) fail('INVALID_XLSX_ZIP');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if ((flags & 1) || ![0, 8].includes(method) || names.has(name) || /(^\/|\\|(^|\/)\.\.($|\/)|vbaProject|externalLinks)/i.test(name)) fail('UNSAFE_XLSX_ZIP');
    names.add(name);
    if (expanded > 4 * 1024 * 1024 || (total += expanded) > MAX_EXPANDED || expanded > Math.max(1024, compressed * 100)) fail('XLSX_EXPANSION_LIMIT');
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method) fail('INVALID_XLSX_ZIP');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.readUInt32LE(eocd + 16)) fail('INVALID_XLSX_ZIP');
    const data = bytes.subarray(start, start + compressed);
    let actual;
    try { actual = method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, expanded) }) : data; }
    catch { fail('CORRUPT_XLSX_MEMBER'); }
    if (actual.length !== expanded || crc32(actual) !== bytes.readUInt32LE(cursor + 16)) fail('CORRUPT_XLSX_MEMBER');
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== eocd || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) fail('INVALID_XLSX_ZIP');
};
const headersFor = values => {
  if (!values.length || values.length > 40) fail('COLUMN_LIMIT');
  const headers = values.map(value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f]/.test(value)) fail('INVALID_HEADER');
    return value.normalize('NFC').trim();
  });
  if (new Set(headers).size !== headers.length) fail('DUPLICATE_HEADER');
  return headers;
};
const record = (headers, values, sourceRowNumber) => {
  if (values.length !== headers.length) fail('COLUMN_COUNT_MISMATCH');
  return { sourceRowNumber, values: Object.fromEntries(headers.map((key, i) => [key, values[i]])) };
};
export const parseScholarshipFile = async (filename, mapping, { sheetName, delimiter = ',', allowCachedFormulas = false } = {}) => {
  if ((await stat(filename)).size > MAX_SOURCE) fail('SOURCE_TOO_LARGE');
  const bytes = await readFile(filename);
  if (bytes.length > MAX_SOURCE || !bytes.length) fail('SOURCE_TOO_LARGE');
  const ext = path.extname(filename).toLowerCase();
  let rows;
  if (ext === '.csv') {
    if (![',', ';', '\t'].includes(delimiter)) fail('INVALID_DELIMITER');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('CSV_UTF8_REQUIRED'); }
    const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { delimiter, skipEmptyLines: false, dynamicTyping: false });
    if (/\r?\n$/.test(text) && parsed.data.at(-1)?.length === 1 && parsed.data.at(-1)[0] === '') parsed.data.pop();
    if (parsed.errors.length || parsed.data.length > SCHOLARSHIP_MAX_ROWS + 1) fail('CORRUPT_OR_OVERSIZED_CSV');
    const headers = headersFor(parsed.data[0] || []);
    rows = parsed.data.slice(1).map((values, i) => record(headers, values, i + 2));
  } else if (ext === '.xlsx') {
    checkScholarshipZip(bytes);
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(bytes); } catch { fail('CORRUPT_XLSX'); }
    if (!sheetName && workbook.worksheets.length !== 1) fail('EXPLICIT_SHEET_REQUIRED');
    const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!sheet || sheet.rowCount > SCHOLARSHIP_MAX_ROWS + 1 || sheet.columnCount > 40 || sheet.model.merges?.length) fail('UNSUPPORTED_SHEET');
    const scalar = cell => {
      const value = cell.value;
      if (value === null || typeof value === 'string' || typeof value === 'number') return value;
      // Explicit offline opt-in only. Never execute a formula or fill a missing cache.
      if (allowCachedFormulas && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)
        && Object.hasOwn(value, 'result') && (typeof value.result === 'string' || typeof value.result === 'number')) return value.result;
      // Dates, rich text, hyperlinks and merged cells are not guessed.
      fail('UNSUPPORTED_XLSX_CELL');
    };
    const headers = headersFor(Array.from({ length: sheet.columnCount }, (_, i) => scalar(sheet.getRow(1).getCell(i + 1))));
    rows = [];
    for (let n = 2; n <= sheet.rowCount; n++) {
      const values = headers.map((_, i) => scalar(sheet.getRow(n).getCell(i + 1)));
      if (values.every(value => value === null || value === '')) continue;
      rows.push(record(headers, values, n));
    }
  } else fail('CSV_OR_XLSX_REQUIRED');
  const payload = { sourceSha256: await scholarshipSha256(bytes), sourceFilename: path.basename(filename), mapping, rows };
  if (Buffer.byteLength(JSON.stringify(payload)) > SCHOLARSHIP_MAX_BODY) fail('PAYLOAD_TOO_LARGE');
  const result = await validateScholarshipImport(payload);
  return { payload, validation: { valid: !result.errors.length, expectedRows: result.expectedRows, acceptedRows: result.acceptedRows,
    rejectedRows: result.rejectedRows, errors: result.errors, sourceSha256: result.sourceSha256, payloadSha256: result.payloadSha256 } };
};
