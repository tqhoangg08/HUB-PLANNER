import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePublicScholarships, ScholarshipError } from '../cloudflare/worker/src/scholarships.ts';

const origin = 'https://hotrosinhvienhub.id.vn';
const campaign = { slug: 'hk2-2025-2026', title: 'Học bổng HK2', schoolYear: '2025–2026', semester: 'HK2', sourceTitle: 'Quyết định', sourceUrl: null, publishedAt: '2026-10-12' };
const sample = { id: 1, fullName: 'Nguyễn Văn A', studentCode: '012345678901', className: 'A', major: 'Kế toán', awardType: 'Giỏi', gpa: 3.75, trainingScore: 85, selectionScore: 3.8 };

const mockDb = (opts: { published?: boolean; scoresApproved?: boolean } = {}) => ({
  prepare(sql: string) {
    let bound: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) { bound = values; return stmt; },
      async first() {
        if (sql.includes('FROM scholarship_campaigns WHERE')) return opts.published ? campaign : null;
        if (sql.includes('COUNT(*) AS totalRecipients')) return { totalRecipients: 1, totalStudents: 1 };
        if (sql.includes('COUNT(*) AS total FROM')) return { total: 1 };
        throw Error('unexpected query: ' + sql);
      },
      async all() {
        if (sql.includes('FROM scholarship_campaigns WHERE')) return { results: opts.published ? [campaign] : [] };
        if (sql.includes('GROUP BY award_type')) return { results: [{ awardType: 'Giỏi', count: 1 }] };
        if (sql.includes('FROM scholarship_recipients r')) return { results: [{ ...sample, gpa: opts.scoresApproved ? sample.gpa : null, trainingScore: opts.scoresApproved ? sample.trainingScore : null, selectionScore: opts.scoresApproved ? sample.selectionScore : null }] };
        throw Error('unexpected query: ' + sql + '; ' + bound);
      },
    };
    return stmt;
  },
});
const env = (published = true, scoresApproved = true) => ({ DB: mockDb({ published, scoresApproved }) }) as never;
const api = (path: string) => {
  const url = new URL(origin + path);
  return { request: new Request(url), url };
};

test('empty campaigns list is an expected public pre-launch state', async () => {
  const { request, url } = api('/api/public/v1/scholarships/campaigns');
  assert.deepEqual(await handlePublicScholarships(request, url, env(false)), { campaigns: [] });
});

test('unpublished campaigns cannot be opened via guessed slug', async () => {
  const { request, url } = api('/api/public/v1/scholarships/hk2-2025-2026/recipients');
  await assert.rejects(handlePublicScholarships(request, url, env(false)), (error: unknown) =>
    error instanceof ScholarshipError && error.status === 404);
});

test('public summary counts actual award records', async () => {
  const { request, url } = api('/api/public/v1/scholarships/hk2-2025-2026/summary');
  const result = await handlePublicScholarships(request, url, env());
  assert.deepEqual({total: result.totalRecipients, students: result.totalStudents}, { total: 1, students: 1 });
});

test('search requires at least two characters', async () => {
  const { request, url } = api('/api/public/v1/scholarships/hk2-2025-2026/search?q=A');
  await assert.rejects(handlePublicScholarships(request, url, env()), (error: unknown) =>
    error instanceof ScholarshipError && error.status === 400);
});

test('score visibility follows public scores approval flag', async () => {
  const { request, url } = api('/api/public/v1/scholarships/hk2-2025-2026/recipients');
  const data = await handlePublicScholarships(request, url, env(true, false));
  assert.equal((data.recipients as Array<typeof sample>)[0].gpa, null);
});

test('invalid page and limit are rejected', async () => {
  for (const qs of ['page=-1', 'limit=999', 'page=wat']) {
    const { request, url } = api('/api/public/v1/scholarships/hk2-2025-2026/recipients?' + qs);
    await assert.rejects(handlePublicScholarships(request, url, env()), (error: unknown) =>
      error instanceof ScholarshipError && error.status === 400);
  }
});
