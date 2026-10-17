// Offline only. Does not connect to APIs, D1, Auth or R2; output must stay private.
import {readFile, stat, writeFile} from 'node:fs/promises';
import {convertEligibilityImport} from '../shared/scholarship-eligibility.ts';
import {SCHOLARSHIP_MAX_BODY} from '../shared/scholarship-import.ts';
const [input, output] = process.argv.slice(2);
try {
  if (!input || !output || process.argv.length !== 4) throw Error('INPUT_AND_PRIVATE_OUTPUT_REQUIRED');
  if ((await stat(input)).size > SCHOLARSHIP_MAX_BODY) throw Error('BODY_TOO_LARGE');
  const bytes = await readFile(input);
  if (bytes.length > SCHOLARSHIP_MAX_BODY) throw Error('BODY_TOO_LARGE');
  const {payload, validation} = await convertEligibilityImport(JSON.parse(bytes.toString('utf8')));
  if (validation.errors.length) throw Error('INVALID_SOURCE_ROWS');
  await writeFile(output, JSON.stringify(payload), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({valid:true, rows:validation.acceptedRows, sourceListKind:'eligibility'}));
} catch (cause) {
  console.error(/^[A-Z_]+$/.test(cause?.message ?? '') ? cause.message : 'ELIGIBILITY_CONVERSION_FAILED');
  process.exitCode = 1;
}
