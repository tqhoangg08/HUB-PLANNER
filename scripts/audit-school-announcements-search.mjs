import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const parseEnvValue = (source, name) => {
  const match = source.match(new RegExp(`^${name}=(?:\"([^\"]*)\"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const normalizeSearch = (value) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const envText = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
const connectionString = parseEnvValue(envText, 'SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('Không tìm thấy SUPABASE_DATABASE_URL trong .env.local.');

const term = normalizeSearch(process.argv.slice(2).join(' ') || 'thông báo');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let rows;
try {
  const result = await client.query(
    `
      select id, title, title ilike $1 as postgres_match
        from public.school_announcements
       where coalesce(is_hidden, false) = false
    `,
    [`%${term}%`]
  );
  rows = result.rows;
} finally {
  await client.end();
}

const mismatches = rows
  .map((row) => ({
    id: row.id,
    title: row.title,
    postgresMatch: row.postgres_match,
    d1Match: normalizeSearch(row.title).includes(term),
  }))
  .filter((row) => row.postgresMatch !== row.d1Match);

console.log(
  JSON.stringify(
    {
      term,
      sourceRows: rows.length,
      mismatches,
    },
    null,
    2
  )
);
