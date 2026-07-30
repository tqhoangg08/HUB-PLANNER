import process from 'node:process';

const sourceBase = String(
  process.env.ANNOUNCEMENTS_SOURCE_API || 'https://hotrosinhvienhub.id.vn/api'
).replace(/\/$/, '');
const candidateArgument = process.argv.find((argument) => argument.startsWith('--candidate='));
const candidateBase = String(
  candidateArgument?.slice('--candidate='.length) ||
    process.env.ANNOUNCEMENTS_CANDIDATE_API ||
    'http://127.0.0.1:8787'
).replace(/\/$/, '');

const cases = [
  '/events?resource=announcements&limit=4',
  '/events?resource=announcements&limit=10',
  '/events?resource=announcements&limit=20&offset=20',
  '/events?resource=announcements&search=th%C3%B4ng%20b%C3%A1o',
  '/events?resource=announcements&search=khongcoketqua987654',
  '/events?resource=announcements&startDate=2026-07-01',
  '/events?resource=announcements&endDate=2026-03-01',
  '/events?resource=announcements&startDate=2026-07-01&endDate=2026-07-31',
  '/events?resource=announcements&limit=1000',
  '/events?resource=announcements&limit=-5&offset=-10',
];

const fetchJson = async (base, path) => {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  return { status: response.status, payload };
};

const results = [];
for (const testCase of cases) {
  const [source, candidate] = await Promise.all([
    fetchJson(sourceBase, testCase),
    fetchJson(candidateBase, testCase),
  ]);
  const match =
    source.status === candidate.status &&
    JSON.stringify(source.payload) === JSON.stringify(candidate.payload);
  results.push({
    path: testCase,
    match,
    sourceStatus: source.status,
    candidateStatus: candidate.status,
    sourceTotal: source.payload?.total ?? null,
    candidateTotal: candidate.payload?.total ?? null,
    idsMatch:
      JSON.stringify((source.payload?.data || []).map((row) => row.id)) ===
      JSON.stringify((candidate.payload?.data || []).map((row) => row.id)),
  });
}

console.table(results);
const mismatches = results.filter((result) => !result.match);
if (mismatches.length > 0) {
  console.error(`Shadow comparison còn ${mismatches.length} trường hợp không khớp.`);
  process.exitCode = 1;
} else {
  console.log(`Shadow comparison khớp ${results.length}/${results.length} trường hợp.`);
}
