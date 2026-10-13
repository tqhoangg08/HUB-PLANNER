// Offline preparation only. Never connects to D1, Auth, or a production endpoint.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { parseScholarshipFile } from './scholarship-workbook.mjs';
const args = process.argv.slice(2);
const option = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
try {
  if (!option('--file') || !option('--mapping') || args.includes('--remote') || args.includes('--apply'))
    throw Error('Usage: node scripts/prepare-scholarship-import.mjs --file SOURCE --mapping MAPPING.json [--sheet NAME] [--delimiter comma|semicolon|tab] [--output PRIVATE.json]');
  if ((await stat(option('--mapping'))).size > 16384) throw Error('MAPPING_TOO_LARGE');
  const mappingBytes = await readFile(option('--mapping'));
  if (mappingBytes.length > 16384) throw Error('MAPPING_TOO_LARGE');
  const mapping = JSON.parse(mappingBytes.toString('utf8'));
  const delimiter = { comma: ',', semicolon: ';', tab: '\t' }[option('--delimiter') || 'comma'];
  if (!delimiter) throw Error('INVALID_DELIMITER');
  const { payload, validation } = await parseScholarshipFile(option('--file'), mapping, { sheetName: option('--sheet'), delimiter });
  if (validation.valid && option('--output')) await writeFile(option('--output'), JSON.stringify(payload), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(validation)); // Row numbers + codes only; no cell/name/MSSV values.
  if (!validation.valid) process.exitCode = 1;
} catch (cause) {
  const message = cause?.message || '';
  console.error(/^[A-Z_]+$/.test(message) || message.startsWith('Usage:') ? message : 'SCHOLARSHIP_PREPARATION_FAILED');
  process.exitCode = 1;
}
