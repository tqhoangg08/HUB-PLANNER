import type { AdvisorCacheScope } from './ai-advisor-cache.ts';

export type ZeroAiStructuredAnswer = {
  reply: string;
  cacheScope: AdvisorCacheScope;
  structuredRows: Record<string, unknown>[];
  intent: 'student_academic' | 'student_schedule' | 'course_catalog' | 'school_announcement' | 'event';
};

type ZeroAiInput = {
  question: string;
  intents: readonly string[];
  documentSearch: boolean;
  context: Record<string, unknown>;
  userId: string;
};

const normalized = (value: string) => value
  .toLocaleLowerCase('vi-VN')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const rows = (value: unknown) => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
  : [];

const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

const isNarrowDirectQuestion = (question: string) => !/(?:tại sao|vì sao|giải thích|so sánh|nên |có nên|theo quy|quy chế|quy định|điều kiện|tư vấn|gợi ý)/iu.test(question);
const onlyIntent = (intents: readonly string[], intent: string) => intents.length === 1 && intents[0] === intent;

/**
 * A deliberately small allow-list. It never interprets a policy or infers a
 * fact not present in the authoritative D1 retrieval supplied by the core.
 */
export const resolveZeroAiStructuredAnswer = (input: ZeroAiInput): ZeroAiStructuredAnswer | null => {
  const question = normalized(input.question);
  if (input.documentSearch || !isNarrowDirectQuestion(question)) return null;

  if (onlyIntent(input.intents, 'course_catalog') && /(?:bao nhiêu|mấy|số) tín chỉ$/iu.test(question)) {
    const courses = rows(input.context.courses);
    if (courses.length !== 1) return null;
    const course = courses[0];
    const credits = number(course.credits);
    const name = text(course.subject_name);
    if (credits === null || !name) return null;
    const code = text(course.course_code);
    return {
      reply: `Môn ${name}${code ? ` (${code})` : ''} có ${credits} tín chỉ.`,
      cacheScope: { kind: 'PUBLIC' }, structuredRows: courses, intent: 'course_catalog',
    };
  }

  if (onlyIntent(input.intents, 'student_schedule') && /^(?:lịch học|thời khóa biểu|tkb)(?: của (?:tôi|mình))?$/iu.test(question)) {
    const schedule = rows(input.context.studentSchedule);
    if (!schedule.length) return null;
    const lines = schedule.slice(0, 8).flatMap((row) => {
      const name = text(row.courseName) || text(row.courseCode);
      if (!name) return [];
      const details = [text(row.semester), text(row.dayOfWeek), text(row.shift), text(row.room)].filter(Boolean);
      return [`- ${name}${details.length ? ` — ${details.join(', ')}` : ''}`];
    });
    if (!lines.length) return null;
    return {
      reply: `Lịch học hiện có của bạn:\n${lines.join('\n')}`,
      cacheScope: { kind: 'USER', userId: input.userId }, structuredRows: schedule, intent: 'student_schedule',
    };
  }

  if (onlyIntent(input.intents, 'student_academic') && /(?:đã )?(?:tích lũy|tích luỹ) bao nhiêu tín chỉ$/iu.test(question)) {
    const academic = input.context.studentAcademic as Record<string, unknown> | undefined;
    const summary = academic && typeof academic.summary === 'object' && academic.summary && !Array.isArray(academic.summary)
      ? academic.summary as Record<string, unknown> : null;
    const accumulated = summary && number(summary.accumulatedCredits);
    if (accumulated === null) return null;
    return {
      reply: `Bạn đã tích lũy ${accumulated} tín chỉ.`,
      cacheScope: { kind: 'USER', userId: input.userId }, structuredRows: [summary], intent: 'student_academic',
    };
  }

  if (onlyIntent(input.intents, 'school_announcement') && /(?:thông báo|tin trường)(?: (?:mới nhất|gần đây))?(?: là gì)?$/iu.test(question)) {
    const announcements = rows(input.context.announcements);
    if (!announcements.length) return null;
    const lines = announcements.slice(0, 3).flatMap((row) => {
      const title = text(row.title);
      return title ? [`- ${title}${text(row.date) ? ` (${text(row.date)})` : ''}`] : [];
    });
    if (!lines.length) return null;
    return {
      reply: `Thông báo hiện có:\n${lines.join('\n')}`,
      cacheScope: { kind: 'PUBLIC' }, structuredRows: announcements, intent: 'school_announcement',
    };
  }

  if (onlyIntent(input.intents, 'event') && /^(?:danh sách )?sự kiện(?: là gì)?$/iu.test(question)) {
    const events = rows(input.context.events);
    if (!events.length) return null;
    const lines = events.slice(0, 3).flatMap((row) => {
      const title = text(row.title);
      const date = text(row.event_date) || text(row.deadline);
      return title ? [`- ${title}${date ? ` (${date})` : ''}`] : [];
    });
    if (!lines.length) return null;
    return {
      reply: `Sự kiện hiện có:\n${lines.join('\n')}`,
      cacheScope: { kind: 'PUBLIC' }, structuredRows: events, intent: 'event',
    };
  }

  return null;
};
