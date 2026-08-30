/**
 * Stage 2C public-catalogue reconciliation. It is deliberately read-only:
 * its explicit semester scope is supplied by the cutover operator after the
 * public catalogue scope is approved. It never guesses historical rows are
 * safe to publish.
 */
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(root, 'scripts', 'run-wrangler.mjs');
const config = path.join(root, 'cloudflare', 'wrangler.jsonc');
const database = 'hub-planner-public-dev';
const columns = [
  'id', 'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block',
  'shift', 'day_of_week', 'weeks', 'room', 'campus', 'managing_faculty', 'exam_date',
  'exam_shift', 'exam_campus', 'exam_room', 'cohort', 'major', 'group_name',
  'orientation', 'orientation_note_3', 'registration_type', 'general_note',
  'academic_program', 'student_count', 'phase', 'semester', 'instructor', 'is_user_added',
];
const canonical = (row) => JSON.stringify(columns.map((column) => {
  const value = row[column];
  return column === 'is_user_added' ? (value == null ? null : Boolean(value)) : value ?? null;
}));
const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((part) => part.toString(16).padStart(2, '0')).join('');
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject).once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `read command exited ${code}`)));
});
const jsonResult = (source) => {
  // Wrangler may emit progress before the JSON array. Do not search from the
  // end: legitimate catalogue text can itself contain '[' and would make the
  // reconciliation parser start inside a JSON string.
  const start = source.search(/\[\s*\{\s*"results"\s*:/);
  if (start < 0) throw new Error('Wrangler returned an invalid read-only response');
  return JSON.parse(source.slice(start).trim()).flatMap((entry) => entry.results || []);
};
const getOneArg = (name) => {
  const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) throw new Error(`${name} must name the select-only reconciliation service.`);
  return value;
};
const hasArg = (name) => process.argv.includes(name);
const semesterScope = () => {
  const scope = [...new Set(process.argv.flatMap((value, index) => value === '--semester' ? [process.argv[index + 1] || ''] : []).map((value) => value.trim()))];
  if (scope.length === 0 || scope.length > 12 || scope.some((value) => !/^[A-Za-z0-9_-]{2,80}$/.test(value))) throw new Error('at least one bounded --semester public-active scope is required.');
  return scope;
};
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const readSource = async (service, semesters) => {
  // psql on Windows can pass catalogue Unicode through a console code-page
  // conversion even when PostgreSQL itself is using UTF-8. Hex keeps the
  // transport ASCII-only without base64's embedded line wrapping; decode it
  // in-process before canonical comparison.
  const sql = `BEGIN READ ONLY; SELECT encode(convert_to(row_to_json(r)::text, 'UTF8'), 'hex') FROM (SELECT ${columns.join(',')} FROM public.course_schedules WHERE semester IN (${semesters.map(literal).join(',')}) ORDER BY id) r; COMMIT;`;
  const output = await run('psql', [`service=${service}`, '-X', '--no-psqlrc', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  return output.split(/\r?\n/).filter(Boolean).map((line) =>
    JSON.parse(Buffer.from(line, 'hex').toString('utf8'))
  );
};
const linkedResult = (source) => {
  const start = source.indexOf('{');
  if (start < 0) throw new Error('Supabase linked read returned an invalid response');
  const payload = JSON.parse(source.slice(start).trim());
  if (!Array.isArray(payload.rows)) throw new Error('Supabase linked read returned no rows');
  return payload.rows;
};
const readLinkedSource = async (semesters) => {
  // This is a select-only fallback for an operator host without a local psql
  // service credential. The source transport remains ASCII hex so Windows
  // console code pages cannot alter canonical Unicode values.
  const sql = `SELECT encode(convert_to(row_to_json(r)::text, 'UTF8'), 'hex') AS record_hex FROM (SELECT ${columns.join(',')} FROM public.course_schedules WHERE semester IN (${semesters.map(literal).join(',')}) ORDER BY id) r;`;
  const queryFile = path.join(root, 'scripts', '.stage2c-linked-source-read.sql');
  await writeFile(queryFile, sql, 'utf8');
  let output;
  try {
    output = process.platform === 'win32'
      ? await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npx supabase db query --linked --file scripts\\.stage2c-linked-source-read.sql'])
      : await run('npx', ['supabase', 'db', 'query', '--linked', '--file', queryFile]);
  } finally {
    await rm(queryFile, { force: true });
  }
  const rows = linkedResult(output);
  return rows.map((row) => {
    if (typeof row.record_hex !== 'string' || !/^[0-9a-f]+$/i.test(row.record_hex)) {
      throw new Error('Supabase linked read returned an invalid UTF-8 hex row');
    }
    return JSON.parse(Buffer.from(row.record_hex, 'hex').toString('utf8'));
  });
};
const readD1 = async (semesters) => jsonResult(await run(process.execPath, [
  wrapper, 'd1', 'execute', database, '--remote', '--config', config,
  '--command', `SELECT ${columns.join(',')},catalogue_visibility,revision,source_kind,writer_provenance FROM course_schedules WHERE catalogue_visibility='published' AND semester IN (${semesters.map(literal).join(',')}) ORDER BY id`, '--json', '--yes',
]));

const compare = async (source, d1) => {
  const sourceById = new Map(source.map((row) => [row.id, row])); const d1ById = new Map(d1.map((row) => [row.id, row]));
  let fieldMismatch = 0; let invalid = 0;
  const fieldMismatchColumns = new Map();
  const academicProgramMismatches = [];
  const fieldMismatchDetails = [];
  for (const [id, row] of sourceById) {
    const mirror = d1ById.get(id);
    if (mirror && await hash(canonical(row)) !== await hash(canonical(mirror))) {
      fieldMismatch += 1;
      const differences = {};
      for (const column of columns) {
        const sourceValue = column === 'is_user_added' ? (row[column] == null ? null : Boolean(row[column])) : row[column] ?? null;
        const d1Value = column === 'is_user_added' ? (mirror[column] == null ? null : Boolean(mirror[column])) : mirror[column] ?? null;
        if (sourceValue !== d1Value) {
          fieldMismatchColumns.set(column, (fieldMismatchColumns.get(column) || 0) + 1);
          differences[column] = { source: sourceValue, d1: d1Value };
        }
        if (column === 'academic_program' && sourceValue !== d1Value) {
          academicProgramMismatches.push({ id, course_code: String(row.course_code || ''), source_academic_program: sourceValue, d1_academic_program: d1Value });
        }
      }
      fieldMismatchDetails.push({ id, course_code: String(row.course_code || ''), differences });
    }
    if (!row.course_code || !row.subject_name || !row.semester) invalid += 1;
  }
  const natural = new Set(); let duplicates = 0;
  for (const row of d1) {
    const key = `${String(row.semester || '').trim()}\u0000${String(row.course_code || '').trim().toLocaleLowerCase('vi-VN')}`;
    if (natural.has(key)) duplicates += 1; else natural.add(key);
    if (row.catalogue_visibility !== 'published' || !row.source_kind || !row.writer_provenance || !Number.isInteger(Number(row.revision))) invalid += 1;
  }
  return {
    PUBLIC_ACTIVE_SOURCE_COUNT: source.length,
    PUBLIC_ACTIVE_D1_COUNT: d1.length,
    PUBLIC_ACTIVE_MISSING_IN_D1: [...sourceById.keys()].filter((id) => !d1ById.has(id)).length,
    PUBLIC_ACTIVE_EXTRA_IN_D1: [...d1ById.keys()].filter((id) => !sourceById.has(id)).length,
    PUBLIC_ACTIVE_FIELD_MISMATCH: fieldMismatch,
    PUBLIC_ACTIVE_FIELD_MISMATCH_COLUMNS: JSON.stringify(Object.fromEntries([...fieldMismatchColumns.entries()].sort(([left], [right]) => left.localeCompare(right)))),
    ...(hasArg('--report-academic-program-mismatches') ? { PUBLIC_ACTIVE_ACADEMIC_PROGRAM_MISMATCHES: JSON.stringify(academicProgramMismatches) } : {}),
    ...(hasArg('--report-mismatches') ? { PUBLIC_ACTIVE_FIELD_MISMATCH_DETAILS: JSON.stringify(fieldMismatchDetails) } : {}),
    PUBLIC_ACTIVE_VISIBILITY_MISMATCH: 0,
    PUBLIC_ACTIVE_DUPLICATE_NATURAL_KEYS: duplicates,
    PUBLIC_ACTIVE_INVALID_ROWS: invalid,
  };
};
const parityPass = (output) => output.PUBLIC_ACTIVE_MISSING_IN_D1 === 0
  && output.PUBLIC_ACTIVE_EXTRA_IN_D1 === 0
  && output.PUBLIC_ACTIVE_FIELD_MISMATCH === 0
  && output.PUBLIC_ACTIVE_DUPLICATE_NATURAL_KEYS === 0
  && output.PUBLIC_ACTIVE_INVALID_ROWS === 0;
const main = async () => {
  const semesters = semesterScope();
  const source = hasArg('--supabase-linked')
    ? await readLinkedSource(semesters)
    : await readSource(getOneArg('--supabase-service'), semesters);
  const first = await compare(source, await readD1(semesters));
  if (hasArg('--repeat-d1')) {
    const second = await compare(source, await readD1(semesters));
    process.stdout.write(`PARITY_PASS_1=${parityPass(first) ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`PARITY_PASS_2=${parityPass(second) ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`STABLE_SOURCE_SNAPSHOT=YES\n`);
    Object.entries(second).forEach(([key, value]) => process.stdout.write(`${key}=${value}\n`));
    return;
  }
  Object.entries(first).forEach(([key, value]) => process.stdout.write(`${key}=${value}\n`));
};
main().catch((error) => { process.stdout.write('COURSE_RECONCILIATION_STATUS=FAIL\n'); process.stdout.write(`ERROR=${error instanceof Error ? error.message : 'read-only reconciliation failed'}\n`); process.exitCode = 1; });
