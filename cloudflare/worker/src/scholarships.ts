import { requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { readVerifiedStudentCode, type StudentDirectoryEnv } from './student-directory.ts';

export interface ScholarshipEnv extends BetterAuthIdentityEnv, StudentDirectoryEnv {
  DB?: D1Database;
}

export class ScholarshipError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ScholarshipError'; }
}

export const scholarshipErrorStatus = (error: unknown) =>
  error instanceof ScholarshipError ? error.status :
  error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 503;

const requireDb = (env: ScholarshipEnv): D1Database => {
  if (!env.DB) throw new ScholarshipError(503, 'Dữ liệu học bổng chưa sẵn sàng.');
  return env.DB;
};
const slugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const readSlug = (slug: string) => {
  if (!slugPattern.test(slug)) throw new ScholarshipError(400, 'Mã đợt học bổng không hợp lệ.');
  return slug;
};
const readLimit = (value: string | null) => {
  const n = value === null ? 20 : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 50) throw new ScholarshipError(400, 'Giới hạn phân trang không hợp lệ.');
  return n;
};
const readPage = (value: string | null) => {
  const n = value === null ? 1 : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 10000) throw new ScholarshipError(400, 'Trang không hợp lệ.');
  return n;
};
const publicFields = `r.id, r.full_name AS fullName, r.student_code AS studentCode,
    r.class_name AS className, r.major, r.award_type AS awardType,
    CASE WHEN c.public_scores_approved=1 THEN r.gpa ELSE NULL END AS gpa,
    CASE WHEN c.public_scores_approved=1 THEN r.training_score ELSE NULL END AS trainingScore,
    CASE WHEN c.public_scores_approved=1 THEN r.selection_score ELSE NULL END AS selectionScore`;

interface CampaignRow { slug: string; title: string; schoolYear: string; semester: string; sourceTitle: string; sourceUrl: string | null; publishedAt: string | null; }
const selectCampaign = `SELECT slug, title, school_year AS schoolYear, semester,
 source_title AS sourceTitle, source_url AS sourceUrl, published_at AS publishedAt
 FROM scholarship_campaigns WHERE status='published' AND public_data_approved=1`;

export const handlePublicScholarships = async (request: Request, url: URL, env: ScholarshipEnv) => {
  if (request.method !== 'GET') throw new ScholarshipError(405, 'Chỉ hỗ trợ GET.');
  const db = requireDb(env);
  const suffix = url.pathname.slice('/api/public/v1/scholarships'.length);
  if (suffix === '/campaigns') {
    const result = await db.prepare(`${selectCampaign} ORDER BY published_at DESC, slug DESC LIMIT 30`).all<CampaignRow>();
    return { campaigns: result.results };
  }
  const match = /^\/([a-z0-9-]{1,64})\/(summary|recipients|search)$/.exec(suffix);
  if (!match) throw new ScholarshipError(404, 'Không tìm thấy endpoint.');
  const slug = readSlug(match[1]);
  const campaign = await db.prepare(`${selectCampaign} AND slug=? LIMIT 1`).bind(slug).first<CampaignRow>();
  if (!campaign) throw new ScholarshipError(404, 'Đợt học bổng chưa được công bố.');
  if (match[2] === 'summary') {
    const stats = await db.prepare(`SELECT COUNT(*) AS totalRecipients, COUNT(DISTINCT student_code) AS totalStudents
      FROM scholarship_recipients WHERE campaign_slug=?`).bind(slug).first<{totalRecipients: number; totalStudents: number}>();
    const awards = await db.prepare(`SELECT award_type AS awardType, COUNT(*) AS count
      FROM scholarship_recipients WHERE campaign_slug=? GROUP BY award_type ORDER BY count DESC, award_type`).bind(slug).all();
    return { campaign, totalRecipients: stats?.totalRecipients || 0, totalStudents: stats?.totalStudents || 0, awards: awards.results };
  }
  const params = url.searchParams;
  const q = (params.get('q') || '').trim().normalize('NFC');
  if (q.length > 80 || /[\u0000-\u001f]/.test(q)) throw new ScholarshipError(400, 'Từ khóa tìm kiếm không hợp lệ.');
  if (match[2] === 'search' && q.length < 2) throw new ScholarshipError(400, 'Nhập ít nhất 2 ký tự để tìm kiếm.');
  const award = (params.get('awardType') || '').trim();
  if (award.length > 120) throw new ScholarshipError(400, 'Loại học bổng không hợp lệ.');
  const limit = readLimit(params.get('limit')), page = readPage(params.get('page'));
  const offset = (page - 1) * limit;
  const where = [`r.campaign_slug=?`, `c.status='published'`, `c.public_data_approved=1`];
  const args: (string | number)[] = [slug];
  if (award) { where.push('r.award_type=?'); args.push(award); }
  if (q) {
    // Exact student-code lookup, or prefix name lookup (accent-aware source-normalized field).
    if (/^\d{1,12}$/.test(q)) { where.push('r.student_code LIKE ?'); args.push(q + '%'); }
    else {
      const normalized = q.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      where.push('r.full_name_search LIKE ?'); args.push(normalized + '%');
    }
  }
  const filters = where.join(' AND ');
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM scholarship_recipients r JOIN scholarship_campaigns c ON c.slug=r.campaign_slug WHERE ${filters}`).bind(...args).first<{total: number}>();
  const results = await db.prepare(`SELECT ${publicFields} FROM scholarship_recipients r
    JOIN scholarship_campaigns c ON c.slug=r.campaign_slug WHERE ${filters}
    ORDER BY r.source_row_number ASC, r.id ASC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all();
  return { campaign, recipients: results.results, total: count?.total || 0, page, limit };
};

export const handleMyScholarships = async (request: Request, env: ScholarshipEnv) => {
  if (request.method !== 'GET') throw new ScholarshipError(405, 'Chỉ hỗ trợ GET.');
  const identity = await requireBetterAuthSession(request, env);
  const studentCode = await readVerifiedStudentCode(request, env, identity);
  if (!studentCode) return { verified: false, awards: [] };
  const db = requireDb(env);
  const rows = await db.prepare(`SELECT r.id, r.full_name AS fullName, r.award_type AS awardType,
      r.gpa, r.training_score AS trainingScore, r.selection_score AS selectionScore,
      c.slug AS campaignSlug, c.title AS campaignTitle, c.school_year AS schoolYear, c.semester
    FROM scholarship_recipients r JOIN scholarship_campaigns c ON c.slug=r.campaign_slug
    WHERE r.student_code=? AND c.status='published' AND c.public_data_approved=1
    ORDER BY c.published_at DESC, r.id DESC LIMIT 100`).bind(studentCode).all();
  return { verified: true, awards: rows.results };
};
