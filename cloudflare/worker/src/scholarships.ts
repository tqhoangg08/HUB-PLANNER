import { requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { readVerifiedStudentCode, type StudentDirectoryEnv } from './student-directory.ts';
import { normalizeScholarshipName } from '../../../shared/scholarship-import.ts';
import { isPublicField, rankingKeys } from '../../../shared/scholarship-policy.ts';

export interface ScholarshipEnv extends BetterAuthIdentityEnv, StudentDirectoryEnv {
  DB?: D1Database;
  SCHOLARSHIP_SEARCH_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
export class ScholarshipError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; this.name = 'ScholarshipError'; }
}
export const scholarshipErrorStatus = (error: unknown) =>
  error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 503;
export const requireScholarshipDb = (env: ScholarshipEnv): D1Database => {
  if (!env.DB) throw new ScholarshipError(503, 'Dữ liệu học bổng chưa sẵn sàng.');
  return env.DB;
};
export const readScholarshipSlug = (slug: string) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new ScholarshipError(400, 'Mã đợt học bổng không hợp lệ.');
  return slug;
};
const boundedInteger = (value: string | null, fallback: number, max: number) => {
  if (value !== null && !/^[1-9]\d*$/.test(value)) throw new ScholarshipError(400, 'Phân trang không hợp lệ.');
  const n = value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n > max) throw new ScholarshipError(400, 'Phân trang không hợp lệ.');
  return n;
};
export const scholarshipPagination = (params: URLSearchParams) => ({
  limit: boundedInteger(params.get('limit'), 20, 50), page: boundedInteger(params.get('page'), 1, 10000),
});
const checkParams = (params: URLSearchParams, allowed: string[]) => {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1)
    throw new ScholarshipError(400, 'Tham số không hợp lệ.');
};
interface CampaignRow {
  slug: string; title: string; schoolYear: string; semester: string; publishedAt: string;
  activeBatchId: string; approvedFieldsJson: string; mappingJson: string;
  sourceSha256: string; approvalDocumentJson: string; revision: number;
  sourceListKind: string; ownFieldsJson: string | null;
}
const selectCampaign = `SELECT c.slug, c.title, c.school_year AS schoolYear, c.semester, c.revision,
  c.published_at AS publishedAt, c.active_batch_id AS activeBatchId,
  b.approved_fields_json AS approvedFieldsJson, b.mapping_json AS mappingJson,
  b.source_sha256 AS sourceSha256, b.approval_document_json AS approvalDocumentJson,
  b.source_list_kind AS sourceListKind, b.own_fields_json AS ownFieldsJson
  FROM scholarship_campaigns c JOIN scholarship_import_batches b ON b.id=c.active_batch_id AND b.campaign_slug=c.slug
  WHERE c.status='published' AND c.public_data_approved=1 AND b.status='applied'
  AND b.approved_fields_json IS NOT NULL AND b.approval_document_json IS NOT NULL`;
const campaignView = (row: CampaignRow) => {
  const document = JSON.parse(row.approvalDocumentJson);
  const approvedFields: string[] = JSON.parse(row.approvedFieldsJson).filter(isPublicField);
  const mapping = JSON.parse(row.mappingJson);
  return { slug: row.slug, title: row.title, schoolYear: row.schoolYear, semester: row.semester,
    sourceTitle: document.title, sourceUrl: document.url, sourceDocument: document.reference,
    sourceSha256: row.sourceSha256, publishedAt: row.publishedAt, sourceListKind: row.sourceListKind, approvedFields,
    scoreColumns: mapping.scores.filter((s: { key: string }) => approvedFields.includes('scores.' + s.key))
      .map((s: { key: string; label: string }) => ({ key: s.key, label: s.label })) };
};
interface RecipientRow {
  id: number; fullName: string; studentCode: string; className: string | null; major: string | null;
  awardType: string; scholarshipType: string | null; scholarshipRank: string | null; cohort: string | null; scoresJson: string;
  trainingProgram: string | null; sourceOrdinalJson: string | null; rankingsJson?: string | null;
}
const recipientSelect = `r.id, r.full_name AS fullName, r.student_code AS studentCode,
  r.class_name AS className, r.major, r.award_type AS awardType,
  r.scholarship_type AS scholarshipType, r.scholarship_rank AS scholarshipRank, r.cohort, r.scores_json AS scoresJson,
  r.training_program AS trainingProgram, r.source_ordinal_json AS sourceOrdinalJson`;
const recipientView = (row: RecipientRow, campaign: CampaignRow, own = false) => {
  const publicFields: string[] = JSON.parse(campaign.approvedFieldsJson).filter(isPublicField);
  const fields: string[] = own && campaign.ownFieldsJson !== null ? JSON.parse(campaign.ownFieldsJson) : publicFields;
  const rawScores = JSON.parse(row.scoresJson);
  const scores = Object.fromEntries(Object.entries(rawScores).filter(([key]) => isPublicField('scores.' + key) && fields.includes('scores.' + key)));
  return { id: row.id, fullName: row.fullName, studentCode: row.studentCode, awardType: row.awardType,
    className: fields.includes('className') ? row.className : null, major: fields.includes('major') ? row.major : null,
    scholarshipType: fields.includes('scholarshipType') ? row.scholarshipType : null,
    scholarshipRank: fields.includes('scholarshipRank') ? row.scholarshipRank : null,
    cohort: fields.includes('cohort') ? row.cohort : null,
    trainingProgram: fields.includes('trainingProgram') ? row.trainingProgram : null,
    sourceOrdinal: fields.includes('sourceOrdinal') && row.sourceOrdinalJson !== null ? JSON.parse(row.sourceOrdinalJson) : null,
    scores, gpa: scores.gpa ?? null, trainingScore: scores.trainingScore ?? null, selectionScore: scores.selectionScore ?? null };
};
const filterColumns = { scholarshipType: 'scholarship_type', scholarshipRank: 'scholarship_rank',
  major: 'major', className: 'class_name', cohort: 'cohort', trainingProgram: 'training_program' } as const;
type FilterKey = keyof typeof filterColumns;
const readFilters = (params: URLSearchParams) => {
  const filters: Partial<Record<FilterKey | 'awardType', string>> = {};
  for (const key of [...Object.keys(filterColumns), 'awardType'] as Array<FilterKey | 'awardType'>) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (key === 'awardType' && !raw.trim()) continue;
    if (!raw.trim() || raw.length > (key === 'awardType' ? 120 : 160) || /[\u0000-\u001f\u007f]/.test(raw))
      throw new ScholarshipError(400, 'Bộ lọc không hợp lệ.');
    filters[key] = raw.trim().normalize('NFC');
  }
  return filters;
};
const rowQuery = (slug: string, campaign: CampaignRow, q: string,
  filters: ReturnType<typeof readFilters>, omit?: FilterKey) => {
  const where = ['r.batch_id=?'], args: (string | number)[] = [slug, campaign.activeBatchId];
  const fields: string[] = JSON.parse(campaign.approvedFieldsJson);
  const mapping = JSON.parse(campaign.mappingJson);
  for (const key of Object.keys(filters) as Array<FilterKey | 'awardType'>) {
    if (key === omit) continue;
    if (key !== 'awardType' && (!fields.includes(key) || !mapping[key])) where.push('0=1');
    else { where.push(`r.${key === 'awardType' ? 'award_type' : filterColumns[key]}=?`); args.push(filters[key]!); }
  }
  if (q) {
    if (/^\d{2,12}$/.test(q)) { where.push('r.student_code LIKE ?'); args.push(q + '%'); }
    else { where.push("r.full_name_search LIKE ? ESCAPE '\\'"); args.push('%' + normalizeScholarshipName(q).replace(/[\\%_]/g, '\\$&') + '%'); }
  }
  where.push("c.status='published' AND c.public_data_approved=1 AND c.active_batch_id=r.batch_id AND c.revision=?");
  args.push(campaign.revision);
  return { from: `FROM scholarship_snapshot_rows r JOIN scholarship_campaigns c ON c.slug=? WHERE ${where.join(' AND ')}`, args };
};
export const handlePublicScholarships = async (request: Request, url: URL, env: ScholarshipEnv) => {
  if (request.method !== 'GET') throw new ScholarshipError(405, 'Chỉ hỗ trợ GET.');
  const db = requireScholarshipDb(env);
  const suffix = url.pathname.slice('/api/public/v1/scholarships'.length);
  if (suffix === '/campaigns') {
    checkParams(url.searchParams, ['page', 'limit', 'schoolYear', 'semester']);
    const { page, limit } = scholarshipPagination(url.searchParams);
    const filters: string[] = [], args: (string | number)[] = [];
    for (const [key, column] of [['schoolYear', 'school_year'], ['semester', 'semester']]) {
      const value = url.searchParams.get(key);
      if (value !== null) {
        if (!value.trim() || value.length > 80 || /[\u0000-\u001f]/.test(value)) throw new ScholarshipError(400, 'Bộ lọc không hợp lệ.');
        filters.push(`c.${column}=?`); args.push(value.trim());
      }
    }
    const query = selectCampaign + (filters.length ? ' AND ' + filters.join(' AND ') : '');
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM (${query})`).bind(...args).first<{total: number}>();
    const result = await db.prepare(query + ' ORDER BY c.published_at DESC, c.slug DESC LIMIT ? OFFSET ?')
      .bind(...args, limit, (page - 1) * limit).all<CampaignRow>();
    return { campaigns: result.results.map(campaignView), total: count?.total || 0, page, limit };
  }
  const match = /^\/([^/]+)\/(summary|recipients|search|facets)$/.exec(suffix);
  if (!match) throw new ScholarshipError(404, 'Không tìm thấy endpoint.');
  const slug = readScholarshipSlug(match[1]);
  const params = url.searchParams;
  checkParams(params, match[2] === 'summary' ? [] : ['q', 'awardType', ...Object.keys(filterColumns),
    ...(match[2] === 'facets' ? ['facetPage', 'facetLimit'] : ['page', 'limit'])]);
  const q = (params.get('q') || '').trim().normalize('NFC');
  if (q.length > 80 || q.length === 1 || /[\u0000-\u001f\u007f]/.test(q) || (match[2] === 'search' && q.length < 2))
    throw new ScholarshipError(400, 'Từ khóa cần từ 2 đến 80 ký tự.');
  const filters = readFilters(params);
  const { limit, page } = scholarshipPagination(params);
  if ((q || Object.keys(filters).length || match[2] === 'facets') && env.SCHOLARSHIP_SEARCH_RATE_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip && !(await env.SCHOLARSHIP_SEARCH_RATE_LIMIT.limit({ key: 'scholarships:' + ip })).success)
      throw new ScholarshipError(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
  }
  const campaign = await db.prepare(`${selectCampaign} AND c.slug=? LIMIT 1`).bind(slug).first<CampaignRow>();
  if (!campaign) throw new ScholarshipError(404, 'Đợt học bổng chưa được công bố.');
  if (match[2] === 'summary') {
    const stats = await db.prepare(`SELECT COUNT(*) AS totalRecipients, COUNT(DISTINCT r.student_code) AS totalStudents
      FROM scholarship_snapshot_rows r JOIN scholarship_campaigns c ON c.active_batch_id=r.batch_id
      WHERE r.batch_id=? AND c.status='published' AND c.public_data_approved=1`).bind(campaign.activeBatchId).first<{totalRecipients: number; totalStudents: number}>();
    const awards = await db.prepare(`SELECT r.award_type AS awardType, COUNT(*) AS count
      FROM scholarship_snapshot_rows r JOIN scholarship_campaigns c ON c.active_batch_id=r.batch_id
      WHERE r.batch_id=? AND c.status='published' AND c.public_data_approved=1 GROUP BY r.award_type ORDER BY count DESC, r.award_type`)
      .bind(campaign.activeBatchId).all();
    return { campaign: campaignView(campaign), totalRecipients: stats?.totalRecipients || 0, totalStudents: stats?.totalStudents || 0, awards: awards.results };
  }
  const query = rowQuery(slug, campaign, q, filters);
  const count = await db.prepare(`SELECT COUNT(*) AS total ${query.from}`).bind(...query.args).first<{total: number}>();
  if (match[2] === 'facets') {
    const facetPage = boundedInteger(params.get('facetPage'), 1, 2000);
    const facetLimit = boundedInteger(params.get('facetLimit'), 100, 200);
    const fields: string[] = JSON.parse(campaign.approvedFieldsJson), mapping = JSON.parse(campaign.mappingJson);
    const supportedFilters = (Object.keys(filterColumns) as FilterKey[]).filter(key => fields.includes(key) && mapping[key]);
    const facets = Object.fromEntries(await Promise.all((Object.keys(filterColumns) as FilterKey[]).map(async key => {
      if (!supportedFilters.includes(key)) return [key, { options: [], total: 0, page: facetPage, limit: facetLimit }];
      const scoped = rowQuery(slug, campaign, q, filters, key), column = filterColumns[key];
      const distinct = `SELECT DISTINCT r.${column} AS value ${scoped.from} AND r.${column} IS NOT NULL AND r.${column}<>''`;
      const [total, values] = await Promise.all([
        db.prepare(`SELECT COUNT(*) AS total FROM (${distinct})`).bind(...scoped.args).first<{total: number}>(),
        db.prepare(`${distinct} ORDER BY value COLLATE BINARY LIMIT ? OFFSET ?`).bind(...scoped.args, facetLimit, (facetPage - 1) * facetLimit).all<{value: string}>(),
      ]);
      return [key, { options: values.results.map(r => r.value), total: total?.total || 0, page: facetPage, limit: facetLimit }];
    })));
    return { apiVersion: '1.2.0', campaign: campaignView(campaign), supportedFilters, facets, totalRecipients: count?.total || 0 };
  }
  const results = await db.prepare(`SELECT ${recipientSelect} ${query.from} ORDER BY r.source_row_number, r.id LIMIT ? OFFSET ?`)
    .bind(...query.args, limit, (page - 1) * limit).all<RecipientRow>();
  return { campaign: campaignView(campaign), recipients: results.results.map(row => recipientView(row, campaign)), total: count?.total || 0, page, limit };
};
export const handleMyScholarships = async (request: Request, env: ScholarshipEnv) => {
  if (request.method !== 'GET') throw new ScholarshipError(405, 'Chỉ hỗ trợ GET.');
  if (new URL(request.url).search) throw new ScholarshipError(400, 'Không hỗ trợ tham số nhận dạng.');
  const identity = await requireBetterAuthSession(request, env);
  const studentCode = await readVerifiedStudentCode(request, env, identity);
  if (!studentCode) return { verified: false, awards: [] };
  const db = requireScholarshipDb(env);
  const rows = await db.prepare(`SELECT ${recipientSelect}, r.private_rankings_json AS rankingsJson, published.* FROM scholarship_snapshot_rows r
    JOIN (${selectCampaign}) published ON published.activeBatchId=r.batch_id WHERE r.student_code=?
    ORDER BY published.publishedAt DESC, published.slug, r.source_row_number, r.id`).bind(studentCode).all<RecipientRow & CampaignRow>();
  const awards = rows.results.map(row => {
    const ownFields: string[] = row.ownFieldsJson === null ? [] : JSON.parse(row.ownFieldsJson);
    const raw = row.rankingsJson ? JSON.parse(row.rankingsJson) : {};
    const rankings = Object.fromEntries(rankingKeys.filter(key => ownFields.includes('rankings.' + key)
      && raw[key] != null).map(key => [key, raw[key]]));
    return { ...recipientView(row, row, true), rankings, campaignSlug: row.slug, sourceListKind: row.sourceListKind,
      campaignTitle: row.title, schoolYear: row.schoolYear, semester: row.semester };
  });
  return { verified: true, awards };
};
