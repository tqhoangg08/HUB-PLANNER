import process from 'node:process';

const sourceBase =
  process.env.EVENTS_SOURCE_API || 'https://hotrosinhvienhub.id.vn/api';
const candidateArgument = process.argv.find((value) =>
  value.startsWith('--candidate=')
);
const candidateBase =
  candidateArgument?.slice('--candidate='.length) ||
  process.env.EVENTS_CANDIDATE_API ||
  'http://127.0.0.1:8787';

const cases = [
  '/events?limit=10&offset=0',
  '/events?group=open&limit=10&offset=0',
  '/events?group=closed&limit=10&offset=0',
  '/events?group=open&sort=expiring_soon&limit=10&offset=0',
  '/events?sort=oldest&limit=10&offset=0',
  '/events?criteria=I&limit=10&offset=0',
  '/events?criteria=III&limit=10&offset=0',
  '/events?scope=internal&limit=10&offset=0',
  '/events?scope=external&limit=10&offset=0',
  '/events?search=hub&limit=10&offset=0',
];

const shadowRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
};
const payloadMatches = (left, right) =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const read = async (base, path) => {
  const url = new URL(`${base}${path}`);
  url.searchParams.set('__shadow', shadowRunId);
  const response = await fetch(url);
  const payload = await response.json();
  return { status: response.status, payload };
};

const results = [];
let firstDifference = null;
for (const path of cases) {
  const [source, candidate] = await Promise.all([
    read(sourceBase, path),
    read(candidateBase, path),
  ]);
  const sourceIds = Array.isArray(source.payload?.data)
    ? source.payload.data.map((row) => row?.id)
    : [];
  const candidateIds = Array.isArray(candidate.payload?.data)
    ? candidate.payload.data.map((row) => row?.id)
    : [];
  if (!firstDifference && !payloadMatches(source.payload, candidate.payload)) {
    const sourceRows = Array.isArray(source.payload?.data) ? source.payload.data : [];
    const candidateRows = Array.isArray(candidate.payload?.data)
      ? candidate.payload.data
      : [];
    const rowIndex = sourceRows.findIndex(
      (row, index) => !payloadMatches(row, candidateRows[index])
    );
    const sourceRow = sourceRows[rowIndex] || {};
    const candidateRow = candidateRows[rowIndex] || {};
    const keys = [...new Set([...Object.keys(sourceRow), ...Object.keys(candidateRow)])];
    firstDifference = {
      path,
      rowIndex,
      id: sourceRow.id ?? candidateRow.id ?? null,
      fields: keys
        .filter((key) => JSON.stringify(sourceRow[key]) !== JSON.stringify(candidateRow[key]))
        .map((key) => ({
          field: key,
          source: sourceRow[key],
          candidate: candidateRow[key],
        })),
    };
  }
  results.push({
    path,
    match:
      source.status === candidate.status &&
      payloadMatches(source.payload, candidate.payload),
    sourceStatus: source.status,
    candidateStatus: candidate.status,
    sourceTotal: Number(source.payload?.total || sourceIds.length || 0),
    candidateTotal: Number(candidate.payload?.total || candidateIds.length || 0),
    idsMatch: JSON.stringify(sourceIds) === JSON.stringify(candidateIds),
  });
}

console.table(results);
if (firstDifference) {
  console.log('First row-level difference:');
  console.dir(firstDifference, { depth: null });
}
const mismatches = results.filter((result) => !result.match);
if (mismatches.length > 0) {
  console.error(
    `Event shadow comparison failed ${mismatches.length}/${results.length} cases.`
  );
  process.exitCode = 1;
} else {
  console.log(`Event shadow comparison matched ${results.length}/${results.length} cases.`);
}
