import process from 'node:process';

const sourceBase =
  process.env.COURSES_SOURCE_API || 'https://hotrosinhvienhub.id.vn/api';
const candidateArgument = process.argv.find((value) => value.startsWith('--candidate='));
const candidateBase =
  candidateArgument?.slice('--candidate='.length) ||
  process.env.COURSES_CANDIDATE_API ||
  'http://127.0.0.1:8787';

const cases = [
  '/courses?semester=HK1_2026_2027&limit=10&offset=0',
  '/courses?semester=HK1_2026_2027&phase=1&limit=10&offset=0',
  '/courses?semester=HK1_2026_2027&phase=1&limit=10&offset=20',
  '/courses?semester=HK1_2026_2027&phase=1&search=kinh&limit=20',
  '/courses?semester=HK1_2026_2027&phase=1&isUserAdded=false&limit=20',
  '/courses?semester=HK1_2026_2027&isUserAdded=true&limit=20',
  '/courses?semester=HK1_2026_2027&phase=1&suggestions=true&limit=50',
  '/courses?semester=HK1_2026_2027&phase=1&view=detail&limit=5',
  '/courses?semester=HK1_2026_2027&phase=1&major=Ng%C3%B4n%20ng%E1%BB%AF%20Anh&cohort=1&academicProgram=Ch%C6%B0%C6%A1ng%20tr%C3%ACnh%20%C4%91%E1%BA%B7c%20bi%E1%BB%87t&limit=20',
  '/courses?semester=HK1_2026_2027&phase=1&groupName=NNA_N1&limit=20',
  '/courses?resource=filter-options&semester=HK1_2026_2027&phase=1',
  '/courses?resource=filter-options&semester=HK1_2026_2027&phase=1&major=Ng%C3%B4n%20ng%E1%BB%AF%20Anh',
  '/courses?resource=course-detail&id=bb42708d-c46b-4091-9193-e710200b5e71',
];

const shadowRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const read = async (base, path) => {
  const url = new URL(`${base}${path}`);
  url.searchParams.set('__shadow', shadowRunId);
  const response = await fetch(url);
  const payload = await response.json();
  return { status: response.status, payload };
};

const results = [];
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
  results.push({
    path,
    match:
      source.status === candidate.status &&
      JSON.stringify(source.payload) === JSON.stringify(candidate.payload),
    sourceStatus: source.status,
    candidateStatus: candidate.status,
    sourceTotal: Number(source.payload?.total || sourceIds.length || 0),
    candidateTotal: Number(candidate.payload?.total || candidateIds.length || 0),
    idsMatch: JSON.stringify(sourceIds) === JSON.stringify(candidateIds),
  });
}

console.table(results);
const mismatches = results.filter((result) => !result.match);
if (mismatches.length > 0) {
  console.error(`Course shadow comparison failed ${mismatches.length}/${results.length} cases.`);
  process.exitCode = 1;
} else {
  console.log(`Course shadow comparison matched ${results.length}/${results.length} cases.`);
}
