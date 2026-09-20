import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import {
  answerWithGeminiFileSearch,
  extractOfficialDocumentApplicability,
  extractOfficialDocumentLocators,
  GeminiFileSearchError,
  geminiFileSearchConfigured,
  publicDocumentMetadataFilter,
  type GeminiFileSearchFailureReason,
  type GeminiFileSearchEnv,
  type GeminiDocumentApplicability,
} from './gemini-file-search.ts';
import {
  calculateCumulativeStats,
  calculateSubjectAverage,
} from '../../../shared/academic-grade-calculations.ts';
import type { Subject } from '../../../types.ts';
import { normalizeAiDocumentCategory, type AiDocumentCategory } from '../../../shared/ai-document-categories.ts';

export interface AiAdvisorEnv extends BetterAuthIdentityEnv, GeminiFileSearchEnv {
  DB?: D1Database;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
  /** Dependency seam for deterministic Worker tests; production leaves this unset. */
  fileSearchAnswer?: typeof answerWithGeminiFileSearch;
}

export class AiAdvisorError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'AiAdvisorError'; this.status = status; }
}

const MAX_BODY_BYTES = 48 * 1024;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SAFE_TECH_REPLY = 'Mình không thể chia sẻ thông tin kỹ thuật hoặc bảo mật nội bộ của website. HUB Planner được xây dựng để hỗ trợ sinh viên quản lý học tập, theo dõi GPA, lịch học, thông báo, sự kiện và các tiện ích sinh viên thuận tiện hơn.';
const UNVERIFIED_HUB_REPLY = 'Mình chưa thể xác minh thông tin hiện hành của HUB Planner hoặc BUH từ nguồn chính thức. Bạn có thể hỏi rõ hơn hoặc kiểm tra thông báo/tài liệu chính thức mới nhất.';
const EMPTY_AUTHORITATIVE_REPLY = 'Mình chưa tìm thấy thông tin này trong dữ liệu hiện hành của HUB Planner.';
const CONVERSATION_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|legacy-[1-9]\d*)$/i;

export type AdvisorIntent =
  | 'student_academic'
  | 'student_schedule'
  | 'course_catalog'
  | 'school_announcement'
  | 'event'
  | 'lost_found'
  | 'regulation_document'
  | 'general';

export type AdvisorDocumentDomain =
  | 'training_regulation'
  | 'grading'
  | 'graduation'
  | 'course_registration'
  | 'academic_warning'
  | 'tuition'
  | 'scholarship'
  | 'student_handbook'
  | 'discipline'
  | 'general_official_document';

export type AdvisorDocumentRoute = {
  documentSearch: boolean;
  domain: AdvisorDocumentDomain | null;
  scope: AdvisorPolicyScope;
  coverageMode: boolean;
  /** @deprecated Prefer scope.academicYear. Kept for precedence compatibility. */
  academicYear: string | null;
};

export type AdvisorPolicyScope = {
  academicYear: string | null;
  cohortYear: number | null;
  fromCohortYear: number | null;
};

export type AdvisorSource = {
  type: 'document' | 'course' | 'announcement' | 'event' | 'lost_found' | 'student_schedule' | 'student_academic';
  id?: string | number;
  title: string;
  url?: string;
  date?: string;
};

type AdvisorRetrieval = {
  intents: AdvisorIntent[];
  context: Record<string, unknown>;
  sources: AdvisorSource[];
  needsAuthoritativeSource: boolean;
  missingAuthoritativeIntents: AdvisorIntent[];
  documentRoute: AdvisorDocumentRoute;
};

const requireDb = (env: AiAdvisorEnv) => {
  if (!env.DB) throw new AiAdvisorError(503, 'Dịch vụ trợ lý tạm thời chưa sẵn sàng.');
  return env.DB;
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new AiAdvisorError(413, 'Nội dung trợ lý quá lớn.');
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new AiAdvisorError(400, 'Yêu cầu trợ lý không hợp lệ.'); }
};

const keys = (env: AiAdvisorEnv) => [env.GROQ_API_KEY, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3, env.GROQ_API_KEY_4, env.GROQ_API_KEY_5]
  .map((value) => String(value || '').trim()).filter(Boolean);

const safeHistory = (value: unknown) => Array.isArray(value) ? value.slice(-4).flatMap((entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
  const row = entry as Record<string, unknown>;
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
  const content = String(row.content || '').trim().slice(0, 1000);
  return role && content ? [{ role, content }] : [];
}) : [];

const normalizedQuestion = (value: string) => value
  .toLocaleLowerCase('vi-VN')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const matches = (question: string, words: string[]) => words.some((word) => question.includes(word));

const hasPersonalAcademicCue = (question: string) =>
  matches(question, ['tôi', 'mình', 'của tôi', 'của mình', 'đã tích lũy', 'còn thiếu', 'bảng điểm của']);

const POLICY_DOCUMENT_CUES = [
  'quy chế', 'quy định', 'văn bản', 'hướng dẫn', 'sổ tay', 'điều lệ',
];

const POLICY_DOMAIN_CUES: Array<[AdvisorDocumentDomain, string[]]> = [
  ['grading', [
    'quy đổi điểm', 'thang điểm', 'điểm chữ', 'hệ 4', 'hệ 10', 'điểm f', 'điểm i', 'điểm r', 'điểm p',
    'xếp loại học lực', 'xếp loại tốt nghiệp', 'học lại', 'cải thiện điểm',
  ]],
  ['graduation', ['điều kiện tốt nghiệp', 'xét tốt nghiệp', 'khóa luận tốt nghiệp', 'thực tập cuối khóa']],
  ['course_registration', ['đăng ký học phần', 'rút học phần', 'bảo lưu', 'nghỉ học tạm thời', 'học hai chương trình', 'song ngành', 'chuyển ngành', 'chuyển trường']],
  ['academic_warning', ['cảnh báo học vụ', 'buộc thôi học']],
  ['tuition', ['học phí']],
  ['scholarship', ['học bổng']],
  ['discipline', ['kỷ luật', 'vi phạm']],
  ['student_handbook', ['sổ tay sinh viên', 'student handbook']],
  ['training_regulation', ['chương trình đào tạo', 'quy định tín chỉ']],
];

const academicYearFromQuestion = (question: string) =>
  normalizedQuestion(question).match(/\b(20\d{2}\s*-\s*20\d{2})\b/u)?.[1]?.replace(/\s+/g, '') || null;

const documentDomainForText = (text: string) =>
  POLICY_DOMAIN_CUES.find(([, cues]) => matches(text, cues))?.[0] || null;

const recentUserQuestions = (history: unknown) => safeHistory(history)
  .filter((entry) => entry.role === 'user')
  .slice(-3)
  .map((entry) => entry.content);

const isEllipticalDocumentFollowup = (text: string) => text.length <= 100 && (
  /(?:^|\s)(?:còn|vậy|thế|sao|nữa|khóa|khoá|k20\d{2}|tuyển sinh|từ năm|20\d{2})(?:\s|$)/iu.test(text)
);

/**
 * Scope comes only from the user's current wording. A bare year is resolved
 * as an intake year solely for an elliptical follow-up whose prior user turn
 * already established an official-policy domain. Academic years stay distinct.
 */
export const extractAdvisorPolicyScope = (question: string, allowImplicitCohort = false): AdvisorPolicyScope => {
  const text = normalizedQuestion(question);
  const academicYear = academicYearFromQuestion(question);
  const fromMatch = text.match(/(?:từ\s+(?:các\s+)?khóa(?:\s+tuyển\s+sinh)?(?:\s+năm)?|từ\s+năm)\s*(20\d{2})\b/iu)
    || text.match(/(?:các\s+)?khóa\s+tuyển\s+sinh\s+từ\s+(?:năm\s*)?(20\d{2})\b/iu);
  const cohortMatch = text.match(/(?:khóa|khoá)(?:\s+tuyển\s+sinh)?(?:\s+năm)?\s*(20\d{2})\b/iu)
    || text.match(/\bk\s*(20\d{2})\b/iu)
    || text.match(/tuyển\s+sinh(?:\s+năm)?\s*(20\d{2})\b/iu);
  const bareYear = allowImplicitCohort && !academicYear
    ? text.match(/(?:^|\s)(20\d{2})(?:\s|$)/u)?.[1]
    : undefined;
  return {
    academicYear,
    cohortYear: fromMatch ? null : Number(cohortMatch?.[1] || bareYear || 0) || null,
    fromCohortYear: Number(fromMatch?.[1] || 0) || null,
  };
};

const isCoverageQuestion = (text: string, domain: AdvisorDocumentDomain | null, scope: AdvisorPolicyScope) => {
  if (!domain || scope.cohortYear || scope.fromCohortYear || scope.academicYear) return false;
  if (domain === 'grading') return matches(text, ['quy đổi điểm', 'thang điểm', 'điểm chữ', 'hệ 4', 'hệ 10']);
  if (domain === 'scholarship') return matches(text, ['các loại học bổng', 'học bổng gì', 'có học bổng nào', 'các học bổng']);
  if (domain === 'graduation') return matches(text, ['điều kiện tốt nghiệp', 'xét tốt nghiệp']);
  return matches(text, ['quy chế', 'quy định', 'hướng dẫn']);
};

/**
 * This router picks a policy domain, not a document. Gemini File Search and
 * document metadata select the actual document, so new official documents do
 * not require a code change.
 */
export const routeAdvisorDocuments = (question: string, history: unknown = []): AdvisorDocumentRoute => {
  const text = normalizedQuestion(question);
  const domain = documentDomainForText(text);
  const hasOfficialCue = matches(text, POLICY_DOCUMENT_CUES);
  const hasInstitutionCue = matches(text, ['hub', 'buh', 'trường mình', 'nhà trường']);
  const followup = isEllipticalDocumentFollowup(text);
  // Assistant messages are deliberately excluded: they are not an authority
  // for routing a policy question. Recent user turns only resolve ellipsis.
  const inheritedDomain = followup
    ? [...recentUserQuestions(history)].reverse().map((item) => documentDomainForText(normalizedQuestion(item))).find(Boolean) || null
    : null;
  const resolvedDomain = domain || inheritedDomain;
  const documentSearch = Boolean(resolvedDomain || hasOfficialCue);
  const scope = extractAdvisorPolicyScope(question, Boolean(inheritedDomain));
  return {
    documentSearch,
    domain: resolvedDomain || (hasOfficialCue || hasInstitutionCue ? 'general_official_document' : null),
    scope,
    coverageMode: isCoverageQuestion(text, resolvedDomain, scope),
    academicYear: scope.academicYear,
  };
};

export const extractCourseCode = (question: string) => {
  const match = question.match(/(?:^|[^\p{L}\p{N}])([A-Za-z]{2,12}-?\d{2,}[A-Za-z0-9-]*)(?=$|[^\p{L}\p{N}])/u);
  return match?.[1]?.toLocaleLowerCase('vi-VN') || null;
};

export const classifyAdvisorIntents = (question: string, history: unknown = []): AdvisorIntent[] => {
  const text = normalizedQuestion(question);
  const intents = new Set<AdvisorIntent>();
  const documentRoute = routeAdvisorDocuments(question, history);
  const personalAcademic = hasPersonalAcademicCue(text)
    && matches(text, ['gpa', 'điểm', 'học lực', 'môn nợ', 'tín chỉ', 'tốt nghiệp', 'hồ sơ học tập', 'ngành học']);
  if (personalAcademic) intents.add('student_academic');
  if (matches(text, ['lịch học', 'thời khóa biểu', 'tkb', 'phòng học', 'ca học', 'lịch thi'])) intents.add('student_schedule');
  if (extractCourseCode(question) || matches(text, ['mã môn', 'môn học', 'môn ', 'học phần', 'tiên quyết', 'giảng viên', 'catalog'])) intents.add('course_catalog');
  if (matches(text, ['thông báo', 'tin trường', 'nhà trường', 'thông báo trường'])) intents.add('school_announcement');
  if (matches(text, ['sự kiện', 'đrl', 'điểm rèn luyện', 'đăng ký sự kiện'])) intents.add('event');
  if (matches(text, ['thất lạc', 'tìm đồ', 'nhặt được', 'đồ rơi', 'lost found'])) intents.add('lost_found');
  if (documentRoute.documentSearch) intents.add('regulation_document');
  return intents.size ? [...intents] : ['general'];
};

export const shouldUseDocumentSearch = (intents: AdvisorIntent[]) =>
  intents.includes('regulation_document');

const SEARCH_STOP_WORDS = new Set([
  'thông', 'báo', 'trường', 'cho', 'với', 'của', 'mình', 'học', 'sinh', 'viên', 'này', 'những',
  'môn', 'sự', 'kiện', 'tín', 'chỉ', 'có', 'mấy', 'bao', 'nhiêu', 'sắp', 'tới', 'mới', 'nhất',
  'là', 'gì', 'cho', 'về', 'cần', 'giúp', 'tìm', 'xin', 'hãy', 'được', 'không', 'của', 'theo',
]);

export const extractSearchTerms = (question: string) => {
  const words = normalizedQuestion(question).split(' ');
  return words
    .filter((word, index) => word.length >= 2 && (
      !SEARCH_STOP_WORDS.has(word)
      || (word === 'học' && words[index + 1] === 'phí')
    ))
    .slice(0, 3);
};

const parseJsonArray = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value || '[]')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const boundedValue = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validScore = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10);

const parseAcademicSubject = (value: unknown): Subject | null => {
  if (!isRecord(value)) return null;
  const credits = Number(value.credits);
  if (!Number.isFinite(credits) || credits <= 0 || credits > 30) return null;
  if (![value.scoreCC, value.scoreProcess, value.scoreMid, value.scoreFinal].every(validScore)) return null;
  const name = boundedValue(value.name, 180);
  if (!name) return null;
  return {
    id: boundedValue(value.id, 120) || name,
    name,
    credits,
    scoreCC: value.scoreCC as number | null,
    scoreProcess: value.scoreProcess as number | null,
    scoreMid: value.scoreMid as number | null,
    scoreFinal: value.scoreFinal as number | null,
    isNonGPA: value.isNonGPA === true,
  };
};

const parseAcademicSemesters = (value: unknown) => Array.isArray(value)
  ? value.slice(-32).flatMap((semester) => {
    if (!isRecord(semester) || !Array.isArray(semester.subjects)) return [];
    return [{ subjects: semester.subjects.slice(0, 120).flatMap((subject) => {
      const parsed = parseAcademicSubject(subject);
      return parsed ? [parsed] : [];
    }) }];
  })
  : [];

const academicSummary = (semestersValue: unknown, totalCreditsRequired: unknown) => {
  const semesters = parseAcademicSemesters(semestersValue);
  const stats = calculateCumulativeStats(semesters);
  const failedSubjectNames = semesters.flatMap((semester) => semester.subjects)
    .flatMap((subject) => {
      const average = calculateSubjectAverage(subject);
      return !subject.isNonGPA && average !== null && average < 4 ? [subject.name] : [];
    })
    .slice(0, 16);
  const required = Number(totalCreditsRequired);
  const totalCredits = Number.isInteger(required) && required > 0 ? required : null;
  return {
    currentGpa4: stats.hasData ? stats.gpa4 : null,
    currentGpa10: stats.hasData ? stats.gpa10 : null,
    gradedCredits: stats.hasData ? stats.totalCredits : 0,
    passedCredits: stats.passedCredits,
    accumulatedCredits: stats.passedCredits,
    totalCreditsRequired: totalCredits,
    remainingCredits: totalCredits === null ? null : Math.max(0, totalCredits - stats.passedCredits),
    failedSubjectNames,
  };
};

const summarizeSemesters = (value: unknown) => Array.isArray(value)
  ? value.slice(-8).flatMap((semester) => {
    if (!semester || typeof semester !== 'object' || Array.isArray(semester)) return [];
    const row = semester as Record<string, unknown>;
    const subjects = Array.isArray(row.subjects) ? row.subjects : [];
    return [{
      name: boundedValue(row.name || row.semester || row.title, 80),
      subjectCount: subjects.length,
      gpa: typeof row.gpa === 'number' ? row.gpa : typeof row.gpa4 === 'number' ? row.gpa4 : null,
    }];
  }) : [];

const source = (type: AdvisorSource['type'], row: Record<string, unknown>, title: string, options: Partial<AdvisorSource> = {}): AdvisorSource => ({
  type,
  title: boundedValue(row[title], 180) || 'Thông tin HUB Planner',
  ...options,
});

const queryRows = async (db: D1Database, sql: string, bindings: unknown[] = []) =>
  (await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>()).results || [];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

// Keep the normal path index-friendly. A bounded contains lookup is reserved for
// the genuine miss case, where a meaningful phrase occurs after a title prefix.
const queryPrefixThenContains = async (db: D1Database, sql: string, phrase: string) => {
  const escaped = escapeLike(phrase);
  const prefixRows = await queryRows(db, sql, [`${escaped}%`]);
  return prefixRows.length ? prefixRows : queryRows(db, sql, [`%${escaped}%`]);
};

const retrieveStudentAcademic = async (db: D1Database, userId: string) => {
  const row = await db.prepare(
    `SELECT student_name, cohort, major_name, specialization_name, program_name,
      target_gpa, total_credits_required, has_onboarded, semesters_json
     FROM user_profile_private WHERE user_id = ?1 LIMIT 1`,
  ).bind(userId).first<Record<string, unknown>>();
  if (!row) return { available: false };
  const semesters = parseJsonArray(row.semesters_json);
  return {
    available: true,
    summary: academicSummary(semesters, row.total_credits_required),
    profile: {
      name: boundedValue(row.student_name, 120),
      cohort: boundedValue(row.cohort, 80),
      major: boundedValue(row.major_name, 120),
      specialization: boundedValue(row.specialization_name, 120),
      program: boundedValue(row.program_name, 120),
      targetGpa: row.target_gpa ?? null,
      totalCreditsRequired: row.total_credits_required ?? null,
      hasOnboarded: Number(row.has_onboarded || 0) === 1,
      semesters: summarizeSemesters(semesters),
    },
  };
};

const retrieveStudentSchedule = async (db: D1Database, userId: string) => {
  const rows = await queryRows(db,
    `SELECT us.semester, cs.course_code, cs.subject_name, cs.credits, cs.instructor,
      cs.shift, cs.day_of_week, cs.room, cs.campus
     FROM user_schedules us
     LEFT JOIN course_schedules cs ON cs.id = us.course_id
     WHERE us.user_id = ?1
     ORDER BY us.semester DESC, us.created_at DESC, us.id DESC
     LIMIT 24`, [userId]);
  return rows.map((row) => ({
    semester: boundedValue(row.semester, 64),
    courseCode: boundedValue(row.course_code, 64),
    courseName: boundedValue(row.subject_name, 180),
    credits: row.credits ?? null,
    instructor: boundedValue(row.instructor, 120),
    shift: boundedValue(row.shift, 64),
    dayOfWeek: boundedValue(row.day_of_week, 64),
    room: boundedValue(row.room, 80),
    campus: boundedValue(row.campus, 80),
  }));
};

const retrieveCourseCatalog = async (db: D1Database, question: string) => {
  const code = extractCourseCode(question);
  const terms = extractSearchTerms(question);
  const phrase = terms.join(' ');
  const rows = code
    ? await queryRows(db,
      `SELECT id, course_code, subject_name, credits, prerequisite, instructor, semester, managing_faculty
       FROM course_schedules
       WHERE catalogue_visibility = 'published' AND retired_at IS NULL AND course_code_search = ?1
       LIMIT 8`, [code])
    : phrase
      ? await queryPrefixThenContains(db,
        `SELECT id, course_code, subject_name, credits, prerequisite, instructor, semester, managing_faculty
         FROM course_schedules
         WHERE catalogue_visibility = 'published' AND retired_at IS NULL
           AND subject_name_search LIKE ?1 ESCAPE '\\'
         ORDER BY source_position ASC LIMIT 8`, phrase)
      : [];
  return rows;
};

const retrieveAnnouncements = async (db: D1Database, question: string) => {
  const phrase = extractSearchTerms(question).join(' ');
  return phrase
    ? queryPrefixThenContains(db,
      `SELECT id, title, link, date FROM school_announcements
       WHERE is_hidden = 0 AND title_search LIKE ?1 ESCAPE '\\'
       ORDER BY date DESC, created_at DESC LIMIT 8`, phrase)
    : queryRows(db,
      `SELECT id, title, link, date FROM school_announcements
       WHERE is_hidden = 0 ORDER BY date DESC, created_at DESC LIMIT 8`);
};

const retrieveEvents = async (db: D1Database, question: string) => {
  const phrase = extractSearchTerms(question).join(' ');
  return phrase
    ? queryPrefixThenContains(db,
      `SELECT id, title, organizer, deadline, event_date, location_type, status, link
       FROM public_events
       WHERE is_deleted = 0 AND COALESCE(status, '') != 'pending'
         AND title_search LIKE ?1 ESCAPE '\\'
       ORDER BY created_at DESC LIMIT 8`, phrase)
    : queryRows(db,
      `SELECT id, title, organizer, deadline, event_date, location_type, status, link
       FROM public_events
       WHERE is_deleted = 0 AND COALESCE(status, '') != 'pending'
       ORDER BY created_at DESC LIMIT 8`);
};

const retrieveLostFound = async (db: D1Database, question: string) => {
  const phrase = extractSearchTerms(question).join(' ');
  return phrase
    ? queryPrefixThenContains(db,
      `SELECT id, title, type, location, created_at FROM public_lost_found_items
       WHERE is_deleted = 0 AND status IN ('approved', 'resolved')
         AND title_search LIKE ?1 ESCAPE '\\'
       ORDER BY created_at DESC LIMIT 8`, phrase)
    : queryRows(db,
      `SELECT id, title, type, location, created_at FROM public_lost_found_items
       WHERE is_deleted = 0 AND status IN ('approved', 'resolved')
       ORDER BY created_at DESC LIMIT 8`);
};

export const retrieveAdvisorContext = async (
  env: AiAdvisorEnv,
  userId: string,
  question: string,
  history: unknown = [],
): Promise<AdvisorRetrieval> => {
  const db = requireDb(env);
  const intents = classifyAdvisorIntents(question, history);
  const documentRoute = routeAdvisorDocuments(question, history);
  const context: Record<string, unknown> = {};
  const sources: AdvisorSource[] = [];
  const missingAuthoritativeIntents: AdvisorIntent[] = [];
  if (intents.includes('student_academic')) {
    const academic = await retrieveStudentAcademic(db, userId);
    context.studentAcademic = academic;
    if ((academic as { available?: boolean }).available === true) {
      sources.push({ type: 'student_academic', title: 'Hồ sơ học tập hiện tại của bạn' });
    } else {
      missingAuthoritativeIntents.push('student_academic');
    }
  }
  if (intents.includes('student_schedule')) {
    const rows = await retrieveStudentSchedule(db, userId);
    context.studentSchedule = rows;
    sources.push(...rows.map((row) => ({ type: 'student_schedule' as const, title: row.courseName || row.courseCode || 'Lịch học cá nhân' })));
    if (!rows.length) missingAuthoritativeIntents.push('student_schedule');
  }
  if (intents.includes('course_catalog')) {
    const rows = await retrieveCourseCatalog(db, question);
    context.courses = rows;
    sources.push(...rows.map((row) => source('course', row, 'subject_name', { id: String(row.id || '') || undefined })));
    if (!rows.length) missingAuthoritativeIntents.push('course_catalog');
  }
  if (intents.includes('school_announcement')) {
    const rows = await retrieveAnnouncements(db, question);
    context.announcements = rows;
    sources.push(...rows.map((row) => source('announcement', row, 'title', { id: Number(row.id) || undefined, url: boundedValue(row.link, 500) || undefined, date: boundedValue(row.date, 64) || undefined })));
    if (!rows.length) missingAuthoritativeIntents.push('school_announcement');
  }
  if (intents.includes('event')) {
    const rows = await retrieveEvents(db, question);
    context.events = rows;
    sources.push(...rows.map((row) => source('event', row, 'title', { id: Number(row.id) || undefined, url: boundedValue(row.link, 500) || undefined, date: boundedValue(row.event_date || row.deadline, 64) || undefined })));
    if (!rows.length) missingAuthoritativeIntents.push('event');
  }
  if (intents.includes('lost_found')) {
    const rows = await retrieveLostFound(db, question);
    context.lostFound = rows;
    sources.push(...rows.map((row) => source('lost_found', row, 'title', { id: Number(row.id) || undefined, date: boundedValue(row.created_at, 64) || undefined })));
    if (!rows.length) missingAuthoritativeIntents.push('lost_found');
  }
  return {
    intents,
    context,
    sources: sources.slice(0, 24),
    needsAuthoritativeSource: intents.some((intent) => !['general', 'regulation_document'].includes(intent)),
    missingAuthoritativeIntents,
    documentRoute,
  };
};

const validConversationId = (value: unknown) => typeof value === 'string'
  && CONVERSATION_ID_PATTERN.test(value.trim());

const resolveConversationId = async (env: AiAdvisorEnv, userId: string, suppliedId: unknown) => {
  if (suppliedId == null || suppliedId === '') return crypto.randomUUID();
  if (!validConversationId(suppliedId)) throw new AiAdvisorError(400, 'Cuộc trò chuyện không hợp lệ.');
  const conversationId = String(suppliedId).trim();
  const existing = await requireDb(env).prepare(
    `SELECT user_id FROM ai_chat_logs
     WHERE conversation_id = ?1 AND is_deleted = 0 LIMIT 1`,
  ).bind(conversationId).first<{ user_id: string | null }>();
  if (!existing || existing.user_id !== userId) throw new AiAdvisorError(404, 'Không tìm thấy cuộc trò chuyện.');
  return conversationId;
};

const createLog = async (env: AiAdvisorEnv, userId: string, conversationId: string, question: string) => {
  const result = await requireDb(env).prepare(
    `INSERT INTO ai_chat_logs (created_at, user_id, conversation_id, user_message, bot_reply)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(new Date().toISOString(), userId, conversationId, question, 'Đang xử lý').run();
  const id = Number(result.meta.last_row_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const patchTurnLog = async (env: AiAdvisorEnv, userId: string, id: number, patch: Record<string, unknown>) => {
  const columns = new Map<string, string>([
    ['bot_reply', 'bot_reply'],
    ['is_helpful', 'is_helpful'],
    ['document_sources', 'document_sources_json'],
    ['answer_sources', 'notice_sources_json'],
    ['document_search_unavailable', 'document_search_unavailable'],
  ]);
  const entries = Object.entries(patch).filter(([key]) => columns.has(key));
  if (!entries.length) return;
  const assignments = entries.map(([key], index) => `${columns.get(key)} = ?${index + 3}`).join(', ');
  const values = entries.map(([key, value]) => (key === 'document_sources' || key === 'answer_sources')
    ? JSON.stringify(Array.isArray(value) ? value : [])
    : typeof value === 'boolean' ? (value ? 1 : 0) : value);
  await requireDb(env).prepare(`UPDATE ai_chat_logs SET ${assignments} WHERE id = ?1 AND user_id = ?2`)
    .bind(id, userId, ...values).run();
};

const publicLog = (row: Record<string, unknown>) => ({
  id: row.id,
  ...(row.conversation_id === undefined ? {} : { conversationId: String(row.conversation_id || '') }),
  ...(row.user_message === undefined ? {} : { user_message: row.user_message }),
  ...(row.bot_reply === undefined ? {} : { bot_reply: row.bot_reply }),
  created_at: row.created_at,
  is_helpful: row.is_helpful == null ? null : Number(row.is_helpful) === 1,
  title: row.title,
  is_deleted: Number(row.is_deleted || 0) === 1,
  is_pinned: Number(row.is_pinned || 0) === 1,
  ...(row.document_sources_json === undefined ? {} : { document_sources: parseJsonArray(row.document_sources_json) }),
  ...(row.notice_sources_json === undefined ? {} : { answer_sources: parseJsonArray(row.notice_sources_json) }),
  ...(row.document_search_unavailable === undefined ? {} : { document_search_unavailable: Number(row.document_search_unavailable || 0) === 1 }),
});

const publicConversation = (row: Record<string, unknown>) => ({
  conversationId: String(row.conversation_id || ''),
  title: boundedValue(row.title, 160) || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isPinned: Number(row.is_pinned || 0) === 1,
  messageCount: Number(row.message_count || 0),
});

const readConversation = async (env: AiAdvisorEnv, userId: string, conversationId: string) => {
  const rows = await requireDb(env).prepare(
    `SELECT id, conversation_id, user_message, bot_reply, created_at, is_helpful, title, is_deleted, is_pinned,
      document_sources_json, notice_sources_json, document_search_unavailable
     FROM ai_chat_logs
     WHERE user_id = ?1 AND conversation_id = ?2 AND is_deleted = 0
     ORDER BY created_at ASC, id ASC LIMIT 80`,
  ).bind(userId, conversationId).all<Record<string, unknown>>();
  const turns = (rows.results || []).map(publicLog);
  return turns.length ? { conversationId, turns } : null;
};

const patchConversation = async (env: AiAdvisorEnv, userId: string, conversationId: string, body: Record<string, unknown>) => {
  const existing = await requireDb(env).prepare(
    `SELECT id FROM ai_chat_logs
     WHERE user_id = ?1 AND conversation_id = ?2 AND is_deleted = 0 LIMIT 1`,
  ).bind(userId, conversationId).first<{ id: number }>();
  if (!existing) throw new AiAdvisorError(404, 'Không tìm thấy cuộc trò chuyện.');
  const assignments: string[] = [];
  const assignmentValues: unknown[] = [];
  const comparisonValues: unknown[] = [];
  const changes: string[] = [];
  if (typeof body.title === 'string' && body.title.trim()) {
    const title = body.title.trim().slice(0, 160);
    assignments.push('title = ?'); assignmentValues.push(title); changes.push("COALESCE(title, '') <> ?"); comparisonValues.push(title);
  }
  if (typeof body.is_pinned === 'boolean') {
    const pinned = body.is_pinned ? 1 : 0;
    assignments.push('is_pinned = ?'); assignmentValues.push(pinned); changes.push('is_pinned <> ?'); comparisonValues.push(pinned);
  }
  if (body.is_deleted === true) {
    assignments.push('is_deleted = 1'); changes.push('is_deleted = 0');
  }
  if (!assignments.length) throw new AiAdvisorError(400, 'Không có thay đổi hợp lệ.');
  await requireDb(env).prepare(
    `UPDATE ai_chat_logs SET ${assignments.join(', ')}
     WHERE user_id = ? AND conversation_id = ? AND (${changes.join(' OR ')})`,
  ).bind(...assignmentValues, userId, conversationId, ...comparisonValues).run();
};

type ResolvedDocumentSource = {
  documentId: string;
  fileName: string;
  title: string;
  pageNumber: number | null;
  locators?: string[];
  applicability?: GeminiDocumentApplicability[];
  category: string | null;
  academicYear: string | null;
  programCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  inferredCurrent: true;
};

const mergeGroundedLocators = (...values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value)
  ? value.flatMap((locator) => extractOfficialDocumentLocators(locator))
  : []))].slice(0, 3);

/** Re-parse only grounded raw labels before persisting/returning scope metadata. */
const mergeGroundedApplicability = (...values: unknown[]) => {
  const byKey = new Map<string, GeminiDocumentApplicability>();
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const candidate of value) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const rawLabel = String((candidate as Record<string, unknown>).rawLabel || '').trim();
      for (const extracted of extractOfficialDocumentApplicability(rawLabel)) {
        const key = [extracted.cohortYear || '', extracted.fromCohortYear || '', extracted.academicYear || '', extracted.effectiveFrom || '', extracted.rawLabel].join('|');
        if (!byKey.has(key)) byKey.set(key, extracted);
      }
    }
  }
  return [...byKey.values()].slice(0, 3);
};

const mergeResolvedDocumentSources = (sources: ResolvedDocumentSource[]) => {
  const byDocumentId = new Map<string, ResolvedDocumentSource>();
  for (const source of sources) {
    const existing = byDocumentId.get(source.documentId);
    if (!existing) {
      byDocumentId.set(source.documentId, source);
      continue;
    }
    const locators = mergeGroundedLocators(existing.locators, source.locators);
    if (locators.length) existing.locators = locators;
    const applicability = mergeGroundedApplicability(existing.applicability, source.applicability);
    if (applicability.length) existing.applicability = applicability;
  }
  return [...byDocumentId.values()];
};

type DocumentCitationRow = {
  id: string;
  title: string;
  original_file_name: string;
  gemini_document_name: string | null;
  category: string | null;
  academic_year: string | null;
  program_code: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  indexing_status: string;
  visibility: string;
};

type DocumentSourceResolution = {
  sources: ResolvedDocumentSource[];
  reason: Extract<GeminiFileSearchFailureReason,
    'D1_CITATION_NOT_FOUND' | 'D1_CITATION_NOT_ACTIVE' | 'D1_CITATION_CATEGORY_REJECTED' | 'SUCCESS'>;
  citationCount: number;
  resolvedCitationCount: number;
};

const sourceCoversRequestedScope = (source: Pick<ResolvedDocumentSource, 'applicability' | 'academicYear'>, scope: AdvisorPolicyScope) => {
  const hasScope = Boolean(scope.cohortYear || scope.fromCohortYear || scope.academicYear);
  if (!hasScope) return true;
  const applicability = source.applicability || [];
  if (scope.cohortYear) {
    return applicability.some((item) => item.cohortYear === scope.cohortYear
      || (typeof item.fromCohortYear === 'number' && item.fromCohortYear <= scope.cohortYear!));
  }
  if (scope.fromCohortYear) {
    return applicability.some((item) => typeof item.fromCohortYear === 'number'
      && item.fromCohortYear <= scope.fromCohortYear!);
  }
  // D1 metadata may confirm an academic year, but it must never be treated as
  // evidence of an intake/cohort year.
  return applicability.some((item) => item.academicYear === scope.academicYear)
    || source.academicYear === scope.academicYear;
};

export { sourceCoversRequestedScope };

const documentPrecedence = (route: AdvisorDocumentRoute, left: ResolvedDocumentSource, right: ResolvedDocumentSource) => {
  const categoryScore = (source: ResolvedDocumentSource) => {
    if (!route.domain || route.domain === 'general_official_document') return 0;
    const categories = OFFICIAL_CATEGORY_COMPATIBILITY[route.domain];
    const index = categories.indexOf(normalizeAiDocumentCategory(source.category));
    return index < 0 ? 0 : categories.length - index;
  };
  const scopeScore = (source: ResolvedDocumentSource) => Number(sourceCoversRequestedScope(source, route.scope));
  const academicYearScore = (source: ResolvedDocumentSource) => Number(Boolean(route.academicYear) && source.academicYear === route.academicYear);
  return scopeScore(right) - scopeScore(left)
    || academicYearScore(right) - academicYearScore(left)
    || categoryScore(right) - categoryScore(left)
    || right.version - left.version
    || String(right.updatedAt).localeCompare(String(left.updatedAt))
    || String(right.createdAt).localeCompare(String(left.createdAt));
};

const OFFICIAL_CATEGORY_COMPATIBILITY: Readonly<Record<Exclude<AdvisorDocumentDomain, 'general_official_document'>, readonly AiDocumentCategory[]>> = {
  grading: ['grading', 'training_regulation', 'student_handbook', 'general'],
  scholarship: ['scholarship', 'student_handbook', 'general'],
  graduation: ['graduation', 'training_regulation', 'student_handbook', 'general'],
  course_registration: ['course_registration', 'training_regulation', 'student_handbook', 'general'],
  academic_warning: ['academic_warning', 'training_regulation', 'student_handbook', 'general'],
  tuition: ['tuition', 'student_handbook', 'general'],
  discipline: ['discipline', 'student_handbook', 'general'],
  student_handbook: ['student_handbook', 'general'],
  training_regulation: ['training_regulation', 'student_handbook', 'general'],
};

const compatibleDocumentCategory = (route: AdvisorDocumentRoute, category: string | null) => {
  if (!route.domain || route.domain === 'general_official_document') return true;
  const normalized = normalizeAiDocumentCategory(category);
  return OFFICIAL_CATEGORY_COMPATIBILITY[route.domain].includes(normalized);
};

/** D1, not model output, is the authority for every official citation. */
export const resolveDocumentSourcesWithDiagnostics = async (
  env: AiAdvisorEnv,
  sources: Array<Record<string, unknown>>,
  route: AdvisorDocumentRoute,
): Promise<DocumentSourceResolution> => {
  const db = requireDb(env);
  const externalIds = [...new Set(sources.map((source) => String(source.documentId || '').trim()).filter(Boolean))].slice(0, 12);
  if (!externalIds.length) {
    return { sources: [], reason: 'D1_CITATION_NOT_FOUND', citationCount: sources.length, resolvedCitationCount: 0 };
  }
  const rows = await db.prepare(
    `SELECT id, title, original_file_name, gemini_document_name, category, academic_year,
       program_code, version, created_at, updated_at, deleted_at, indexing_status, visibility
     FROM ai_documents
      WHERE (id IN (${externalIds.map(() => '?').join(', ')})
          OR gemini_document_name IN (${externalIds.map(() => '?').join(', ')}))`,
  ).bind(...externalIds, ...externalIds.map((id) => `documents/${id}`)).all<DocumentCitationRow>();
  const byExternalId = new Map<string, DocumentCitationRow>();
  for (const row of rows.results || []) {
    byExternalId.set(row.id, row);
    if (row.gemini_document_name) byExternalId.set(String(row.gemini_document_name).replace(/^documents\//, ''), row);
  }
  let found = 0;
  let inactive = 0;
  let categoryRejected = 0;
  const resolved = sources.flatMap((entry) => {
    const row = byExternalId.get(String(entry.documentId || '').trim());
    if (!row) return [];
    found += 1;
    if (row.deleted_at || row.indexing_status !== 'completed' || row.visibility !== 'public') {
      inactive += 1;
      return [];
    }
    if (!compatibleDocumentCategory(route, row.category)) {
      categoryRejected += 1;
      return [];
    }
    const locators = mergeGroundedLocators(entry.locators);
    const applicability = mergeGroundedApplicability(entry.applicability);
    return [{
      documentId: row.id,
      title: row.title,
      fileName: row.original_file_name,
      pageNumber: Number(entry.pageNumber || 0) || null,
      ...(locators.length ? { locators } : {}),
      ...(applicability.length ? { applicability } : {}),
      category: normalizeAiDocumentCategory(row.category),
      academicYear: row.academic_year || null,
      programCode: String(row.program_code || 'all'),
      version: Number(row.version || 1),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      inferredCurrent: true as const,
    }];
  }).sort((left, right) => documentPrecedence(route, left, right));
  const deduplicated = mergeResolvedDocumentSources(resolved);
  const reason: DocumentSourceResolution['reason'] = deduplicated.length
    ? 'SUCCESS'
    : categoryRejected > 0
      ? 'D1_CITATION_CATEGORY_REJECTED'
      : inactive > 0
        ? 'D1_CITATION_NOT_ACTIVE'
        : found > 0
          ? 'D1_CITATION_NOT_ACTIVE'
          : 'D1_CITATION_NOT_FOUND';
  return { sources: deduplicated, reason, citationCount: sources.length, resolvedCitationCount: deduplicated.length };
};

/** Compatibility helper for focused D1 authority tests and other callers. */
export const resolveDocumentSources = async (
  env: AiAdvisorEnv,
  sources: Array<Record<string, unknown>>,
  route: AdvisorDocumentRoute,
) => (await resolveDocumentSourcesWithDiagnostics(env, sources, route)).sources;

const logFileSearchDiagnostic = (
  reason: GeminiFileSearchFailureReason,
  route: AdvisorDocumentRoute,
  narrowed: boolean,
  citationCount: number,
  resolvedCitationCount: number,
  extra: { errorName?: string; status?: number; model?: string } = {},
) => {
  // Deliberately omit the question, document ID/name, store, keys, raw SDK
  // response, and errors. This is enough to locate the failed stage safely.
  console.warn(JSON.stringify({
    component: 'ai-file-search',
    reason,
    domain: route.domain || 'general_official_document',
    narrowed,
    citationCount,
    resolvedCitationCount,
    ...extra,
  }));
};

const chat = async (env: AiAdvisorEnv, body: Record<string, unknown>, userId: string) => {
  const question = String(body.question || body.message || '').trim().slice(0, 2000);
  if (!question) throw new AiAdvisorError(400, 'Vui lòng nhập câu hỏi.');
  const conversationId = await resolveConversationId(env, userId, body.conversationId);
  const logId = await createLog(env, userId, conversationId, question);
  const sensitive = /api.?key|secret|password|token|source code|supabase|database|backend|prompt/i.test(question);
  if (sensitive) {
    if (logId) await patchTurnLog(env, userId, logId, { bot_reply: SAFE_TECH_REPLY });
    return { reply: SAFE_TECH_REPLY, logId, conversationId };
  }
  // Routing sees a strictly bounded set of prior user turns so short follow-up
  // questions retain their policy domain without treating model output as fact.
  const routingHistory = recentUserQuestions(body.history).map((content) => ({ role: 'user', content }));
  const retrieval = await retrieveAdvisorContext(env, userId, question, routingHistory);
  const documentIntent = retrieval.documentRoute.documentSearch;
  if (retrieval.needsAuthoritativeSource && !retrieval.sources.length && !documentIntent) {
    if (logId) await patchTurnLog(env, userId, logId, { bot_reply: EMPTY_AUTHORITATIVE_REPLY, answer_sources: [] });
    return { reply: EMPTY_AUTHORITATIVE_REPLY, logId, conversationId, documentSources: [], answerSources: [], documentSearchUnavailable: false };
  }
  const system = [
    'Bạn là AI Cố vấn học tập HUB Planner. Trả lời bằng tiếng Việt, thân thiện, rõ ràng.',
    'Không tiết lộ thông tin kỹ thuật, bí mật, khóa, token hoặc kiến trúc nội bộ.',
    'Ưu tiên nguồn theo thứ tự: dữ liệu riêng hiện tại của sinh viên đã xác thực, dữ liệu D1 hiện hành, tài liệu chính thức đã truy xuất, rồi mới đến kiến thức tổng quát.',
    'Không tự khẳng định thông tin riêng của HUB Planner hoặc BUH khi không có dữ liệu nguồn hiện hành. Nếu nguồn chính thức không đủ, hãy nói rõ không thể xác minh.',
    `Intent đã xác định: ${retrieval.intents.join(', ')}. Dữ liệu mục tiêu từ máy chủ: ${JSON.stringify(retrieval.context).slice(0, 14_000)}`,
    ...(documentIntent ? [
      `Câu hỏi cần tài liệu chính thức thuộc miền: ${retrieval.documentRoute.domain || 'general_official_document'}.`,
      `Phạm vi người dùng hỏi (chưa phải kết luận): ${JSON.stringify(retrieval.documentRoute.scope)}.`,
      'Chỉ trả lời quy định HUB/BUH dựa trên tài liệu đã truy xuất và được trích dẫn. Không thay bằng kiến thức đại học phổ biến, không tự tạo bảng quy đổi, và nói rõ khi nguồn chưa đủ.',
      'Khi đoạn tài liệu được truy xuất nêu rõ Phần/Chương/Mục/Điều/Khoản/Điểm/Tiểu mục, hãy nêu chính xác locator đó. Không suy ra locator từ số trang, tên tệp, tiêu đề hoặc câu hỏi.',
      'Khi tài liệu có phạm vi khóa hoặc năm học khác nhau, hãy nêu rõ phạm vi áp dụng; không gộp các phiên bản thành một quy định duy nhất.',
      ...(retrieval.documentRoute.coverageMode ? [
        'Đây là câu hỏi tổng quan. Hãy trả lời trực tiếp trước, rồi trình bày đầy đủ các trường hợp/phân loại có trong các tài liệu truy xuất. Nếu văn bản chia theo khóa tuyển sinh, năm học, chương trình hoặc thời điểm hiệu lực, phải tách rõ từng phạm vi và không bỏ qua một phạm vi chỉ vì câu hỏi ngắn.',
        'Không suy diễn khóa tuyển sinh từ năm học hoặc tên tài liệu. Khi nguồn có số liệu/bảng cụ thể, nêu rõ các số liệu/bảng đó; nếu một phạm vi không được nguồn nêu rõ thì nói rõ giới hạn này.',
      ] : []),
    ] : []),
    ...(retrieval.missingAuthoritativeIntents.length
      ? [`Không tìm thấy nguồn hiện hành cho các phần: ${retrieval.missingAuthoritativeIntents.join(', ')}. Chỉ trả lời phần có nguồn; không suy đoán hoặc bù thêm dữ kiện cho các phần thiếu nguồn.`]
      : []),
  ].join('\n');
  let documentSearchUnavailable = false;
  if (documentIntent) {
    if (!geminiFileSearchConfigured(env)) {
      logFileSearchDiagnostic('CONFIG_DISABLED', retrieval.documentRoute, false, 0, 0);
      documentSearchUnavailable = true;
    } else {
      type DocumentSearchOutcome =
        | { success: true; result: NonNullable<Awaited<ReturnType<typeof answerWithGeminiFileSearch>>>; documentSources: ResolvedDocumentSource[] }
        | { success: false; reason: GeminiFileSearchFailureReason };
      const search = async (metadataFilter: string, narrowed: boolean): Promise<DocumentSearchOutcome> => {
        const answer = env.fileSearchAnswer || answerWithGeminiFileSearch;
        try {
          const result = await answer(env, system, safeHistory(body.history), question, { metadataFilter });
          if (!result) {
            logFileSearchDiagnostic('CONFIG_DISABLED', retrieval.documentRoute, narrowed, 0, 0);
            return { success: false, reason: 'CONFIG_DISABLED' };
          }
          const citations = Array.isArray(result.documentSources)
            ? result.documentSources as unknown as Array<Record<string, unknown>>
            : [];
          if (!citations.length) {
            logFileSearchDiagnostic('GEMINI_NO_FILE_CITATION', retrieval.documentRoute, narrowed, 0, 0);
            return { success: false, reason: 'GEMINI_NO_FILE_CITATION' };
          }
          const resolution = await resolveDocumentSourcesWithDiagnostics(env, citations, retrieval.documentRoute);
          if (!resolution.sources.length) {
            logFileSearchDiagnostic(resolution.reason, retrieval.documentRoute, narrowed, resolution.citationCount, resolution.resolvedCitationCount);
            return { success: false, reason: resolution.reason };
          }
          return { success: true, result, documentSources: resolution.sources };
        } catch (error) {
          const fileSearchError = error instanceof GeminiFileSearchError ? error : null;
          const reason = fileSearchError?.reason || 'GEMINI_REQUEST_FAILED';
          logFileSearchDiagnostic(reason, retrieval.documentRoute, narrowed, 0, 0, fileSearchError?.diagnostics);
          return { success: false, reason };
        }
      };
      const domain = retrieval.documentRoute.domain;
      const narrowed = domain && domain !== 'general_official_document'
        ? await search(publicDocumentMetadataFilter(domain), true)
        : null;
      // A metadata/category miss must not exclude legacy documents. Coverage
      // questions intentionally use one broad follow-up search even after a
      // valid narrowed result so File Search can ground multiple applicable
      // ranges. This is bounded to two interactions per user turn.
      let shouldSearchBroadly = true;
      let narrowedCoversRequestedScope = false;
      if (narrowed?.success === true) {
        const explicitScope = retrieval.documentRoute.scope;
        narrowedCoversRequestedScope = narrowed.documentSources.some((source) => sourceCoversRequestedScope(source, explicitScope));
        shouldSearchBroadly = retrieval.documentRoute.coverageMode || !narrowedCoversRequestedScope;
      }
      else if (narrowed) shouldSearchBroadly = (narrowed as Extract<DocumentSearchOutcome, { success: false }>).reason !== 'GEMINI_REQUEST_FAILED';
      const broad = shouldSearchBroadly
        ? await search(publicDocumentMetadataFilter(), false)
        : null;
      const narrowedSuccess = narrowed?.success ? narrowed : null;
      const broadSuccess = broad?.success ? broad : null;
      const hasExplicitScope = Boolean(
        retrieval.documentRoute.scope.cohortYear
        || retrieval.documentRoute.scope.fromCohortYear
        || retrieval.documentRoute.scope.academicYear,
      );
      const scopedNarrowMiss = Boolean(narrowedSuccess) && hasExplicitScope && !narrowedCoversRequestedScope;
      const grounded = retrieval.documentRoute.coverageMode && narrowedSuccess && broadSuccess
        ? {
            success: true as const,
            // The broad interaction receives the same coverage instruction and
            // is the answer candidate; sources are merged from both searches.
            result: broadSuccess.result,
            documentSources: mergeResolvedDocumentSources([...narrowedSuccess.documentSources, ...broadSuccess.documentSources]),
          }
        : broadSuccess && (!narrowedSuccess || !narrowedCoversRequestedScope)
          ? broadSuccess
          : scopedNarrowMiss
            ? null
            : narrowedSuccess || broadSuccess;
      if (grounded) {
        const { result, documentSources } = grounded;
        // Current FileCitation annotations expose identifiers and byte spans but
        // not a guaranteed retrieved passage. When exactly one D1-authorized
        // document grounds the answer, parse an explicit locator from that
        // grounded answer only; never infer from title, filename, or page.
        const replyLocators = documentSources.length === 1 && !(documentSources[0]?.locators?.length)
          ? extractOfficialDocumentLocators(result.reply)
          : [];
        const replyApplicability = documentSources.length === 1 && !(documentSources[0]?.applicability?.length)
          ? extractOfficialDocumentApplicability(result.reply)
          : [];
        const sourcesWithGrounding = documentSources.map((document) => {
          const locators = mergeGroundedLocators(document.locators, replyLocators);
          const applicability = mergeGroundedApplicability(document.applicability, replyApplicability);
          return {
            ...document,
            ...(locators.length ? { locators } : {}),
            ...(applicability.length ? { applicability } : {}),
          };
        });
        const answerSources = [...retrieval.sources, ...sourcesWithGrounding.map((document) => ({ type: 'document' as const, title: String(document.title || document.fileName || 'Tài liệu chính thức'), id: document.documentId || undefined }))];
        if (logId) await patchTurnLog(env, userId, logId, { bot_reply: result.reply, document_sources: sourcesWithGrounding, answer_sources: answerSources, document_search_unavailable: false });
        return { reply: result.reply, logId, conversationId, documentSources: sourcesWithGrounding, answerSources, documentSearchUnavailable: false };
      }
      documentSearchUnavailable = true;
    }
  }
  if (documentIntent) {
    if (logId) await patchTurnLog(env, userId, logId, { bot_reply: UNVERIFIED_HUB_REPLY, answer_sources: retrieval.sources, document_search_unavailable: true });
    return { reply: UNVERIFIED_HUB_REPLY, logId, conversationId, documentSources: [], answerSources: retrieval.sources, documentSearchUnavailable: true };
  }
  const availableKeys = keys(env);
  if (!availableKeys.length) throw new AiAdvisorError(503, 'Dịch vụ trợ lý tạm thời chưa sẵn sàng.');
  let lastStatus = 502;
  for (const key of availableKeys.slice(0, 3)) {
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: String(env.GROQ_MODEL || 'openai/gpt-oss-20b'),
          messages: [{ role: 'system', content: system }, ...safeHistory(body.history), { role: 'user', content: question }],
          temperature: 0.2,
          max_completion_tokens: 2048,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = response.status;
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      if (!response.ok) continue;
      const reply = String(payload.choices?.[0]?.message?.content || '').trim();
      if (!reply) continue;
      if (logId) await patchTurnLog(env, userId, logId, { bot_reply: reply, document_sources: [], answer_sources: retrieval.sources, document_search_unavailable: documentSearchUnavailable });
      return { reply, logId, conversationId, documentSources: [], answerSources: retrieval.sources, documentSearchUnavailable };
    } catch { lastStatus = 502; }
  }
  if (logId) await patchTurnLog(env, userId, logId, { bot_reply: 'Hệ thống AI đang tạm thời không phản hồi.' });
  throw new AiAdvisorError(lastStatus === 429 ? 429 : 502, 'Hệ thống AI đang tạm thời không phản hồi.');
};

export const handleAiAdvisor = async (request: Request, url: URL, env: AiAdvisorEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (request.method === 'GET') {
    const conversationId = url.searchParams.get('conversationId');
    if (conversationId !== null) {
      if (!validConversationId(conversationId)) throw new AiAdvisorError(400, 'Cuộc trò chuyện không hợp lệ.');
      return { success: true, data: await readConversation(env, identity.userId, conversationId) };
    }
    const id = Number(url.searchParams.get('id') || 0);
    const select = id > 0
      ? 'id,conversation_id,user_message,bot_reply,created_at,is_helpful,title,is_deleted,is_pinned,document_sources_json,notice_sources_json,document_search_unavailable'
      : '';
    if (id > 0) {
      const row = await requireDb(env).prepare(`SELECT ${select} FROM ai_chat_logs WHERE user_id = ? AND id = ? LIMIT 1`)
        .bind(identity.userId, id).first<Record<string, unknown>>();
      return { success: true, data: row ? publicLog(row) : null };
    }
    const rows = await requireDb(env).prepare(
      `SELECT conversation_id,
        MIN(created_at) AS created_at,
        MAX(created_at) AS updated_at,
        MAX(is_pinned) AS is_pinned,
        COUNT(*) AS message_count,
        COALESCE(MAX(NULLIF(title, '')), (
          SELECT first_turn.user_message
          FROM ai_chat_logs AS first_turn
          WHERE first_turn.user_id = logs.user_id
            AND first_turn.conversation_id = logs.conversation_id
          ORDER BY first_turn.created_at ASC, first_turn.id ASC LIMIT 1
        )) AS title
       FROM ai_chat_logs AS logs
       WHERE logs.user_id = ?1 AND logs.is_deleted = 0 AND logs.conversation_id IS NOT NULL
       GROUP BY logs.user_id, logs.conversation_id
       ORDER BY MAX(is_pinned) DESC, MAX(created_at) DESC
       LIMIT 50`,
    ).bind(identity.userId).all<Record<string, unknown>>();
    return { success: true, data: (rows.results || []).map(publicConversation) };
  }
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'role' in body) throw new AiAdvisorError(400, 'Không cho phép chỉ định chủ sở hữu.');
  if (request.method === 'POST') return chat(env, body, identity.userId);
  if (request.method === 'PATCH') {
    if (body.conversationId !== undefined) {
      if (!validConversationId(body.conversationId)) throw new AiAdvisorError(400, 'Cuộc trò chuyện không hợp lệ.');
      if ('is_helpful' in body) throw new AiAdvisorError(400, 'Đánh giá chỉ áp dụng cho từng phản hồi.');
      await patchConversation(env, identity.userId, String(body.conversationId).trim(), body);
      return { success: true };
    }
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof body.is_helpful !== 'boolean') throw new AiAdvisorError(400, 'Đánh giá phản hồi không hợp lệ.');
    const patch: Record<string, unknown> = {};
    patch.is_helpful = body.is_helpful;
    await patchTurnLog(env, identity.userId, id, patch);
    return { success: true };
  }
  throw new AiAdvisorError(405, 'Phương thức không được hỗ trợ.');
};

export const aiAdvisorErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AiAdvisorError ? error.status : 500;
