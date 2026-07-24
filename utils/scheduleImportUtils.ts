import { getSemesterMaxWeek, getWeekNumberForDate } from './academicCalendar';

interface ImportedCourseDateFields {
    weeks?: string;
    start_date?: string;
    end_date?: string;
    phase?: string | number;
}

const parseVietnameseDate = (value?: string) => {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeImportedSemester = (rawSemester: unknown, fallback: string) => {
    const raw = String(rawSemester || fallback).trim().toUpperCase();
    const match = raw.match(/HK\s*0?([123]|HE|HÈ)[/_-](20\d{2})[/_-](20\d{2})/i);
    if (!match) return fallback;
    const semester = ['3', 'HE', 'HÈ'].includes(match[1].toUpperCase()) ? 'HE' : match[1];
    return `HK${semester}_${match[2]}_${match[3]}`;
};

export const resolveImportedScheduleMetadata = (
    course: ImportedCourseDateFields,
    semester: string,
) => {
    const existingWeeks = String(course.weeks || '').trim();
    const startDate = parseVietnameseDate(course.start_date);
    const endDate = parseVietnameseDate(course.end_date);
    const maxWeek = getSemesterMaxWeek(semester);

    let weeks = existingWeeks;
    if ((!weeks || weeks === '1-15') && startDate && endDate) {
        const startWeek = Math.min(maxWeek, Math.max(1, getWeekNumberForDate(startDate, semester)));
        const endWeek = Math.min(maxWeek, Math.max(startWeek, getWeekNumberForDate(endDate, semester)));
        weeks = startWeek === endWeek ? String(startWeek) : `${startWeek}-${endWeek}`;
    }

    const explicitPhase = String(course.phase || '').trim();
    const startWeek = startDate ? getWeekNumberForDate(startDate, semester) : 1;
    const phase = explicitPhase || (startWeek >= 14 ? '2' : '1');

    return {
        weeks: weeks || '1-15',
        phase,
    };
};
