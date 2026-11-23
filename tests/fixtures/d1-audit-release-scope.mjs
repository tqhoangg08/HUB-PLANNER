// Historical release tests freeze entire directories. This performance PR
// supersedes only these five files; every other original path stays frozen.
// Predicate bytes, payload parity and live gate checks are covered separately
// by d1-quota-audit.test.mjs and the original publication runtime tests.
export const D1_AUDIT_RELEASE_EXCLUSIONS = [
  '.github/workflows/d1-read-audit.yml',
  'cloudflare/migrations/0063_d1_read_indexes.sql',
  'cloudflare/worker/src/course-publication.ts',
  'cloudflare/worker/src/courses.ts',
  'cloudflare/worker/src/student-directory.ts',
].map(file => `:(exclude)${file}`);
