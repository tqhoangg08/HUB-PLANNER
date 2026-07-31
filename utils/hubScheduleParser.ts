export interface SchedulePdfTextItem {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    sourcePage?: number;
}

export interface SchedulePdfLayoutPage {
    pageNumber: number;
    width: number;
    height: number;
    items: SchedulePdfTextItem[];
}

export interface ImportedScheduleMeeting {
    day: string;
    shift: string;
    room: string;
    campus: string;
    startTime: string;
    endTime: string;
}

export interface ImportedScheduleCourse {
    course_code: string;
    subject_name: string;
    credits: number;
    instructor: string;
    day_of_week: string;
    shift: string;
    room: string;
    campus: string;
    weeks: string;
    start_date: string;
    end_date: string;
    meetings: ImportedScheduleMeeting[];
}

export interface HubScheduleParseResult {
    semester: string;
    courses: ImportedScheduleCourse[];
    reliable: boolean;
    diagnostics: {
        isHubSchedule: boolean;
        detectedCourseCount: number;
        parsedCourseCount: number;
        completeCourseCount: number;
    };
}

const COURSE_CODE_PATTERN = /^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*(?:_[A-Z0-9]+)+$/i;
const DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const DAY_PATTERN = /((?:Thứ\s+(?:Hai|Ba|Tư|Năm|Sáu|Bảy))|Chủ\s*Nhật)/i;
const MEETING_PATTERN = new RegExp(
    `${DAY_PATTERN.source}\\s*,\\s*(\\d{1,2})\\s*[Hh]\\s*(\\d{2})\\s*-\\s*(\\d{1,2})\\s*[Hh]\\s*(\\d{2})\\s*,\\s*([^,]+?)\\s*,\\s*(.*?)(?=${DAY_PATTERN.source}\\s*,|$)`,
    'giu',
);

const normalizeText = (value: string) => value
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const median = (values: number[]) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

const groupIntoLines = (items: SchedulePdfTextItem[], tolerance = 2.2) => {
    const lines: { y: number; items: SchedulePdfTextItem[] }[] = [];
    [...items]
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .forEach(item => {
            let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= tolerance);
            if (!line) {
                line = { y: item.y, items: [] };
                lines.push(line);
            }
            line.items.push(item);
        });
    return lines.sort((a, b) => b.y - a.y);
};

const mergeAdjacentLineItems = (items: SchedulePdfTextItem[]) => {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const merged: SchedulePdfTextItem[] = [];

    sorted.forEach(item => {
        const text = normalizeText(item.text);
        if (!text) return;

        const previous = merged[merged.length - 1];
        if (!previous) {
            merged.push({ ...item, text });
            return;
        }

        const previousEnd = previous.x + previous.width;
        const gap = item.x - previousEnd;
        if (gap <= 1.6) {
            const itemEnd = item.x + item.width;
            previous.text += text;
            previous.width = Math.max(previousEnd, itemEnd) - previous.x;
            previous.height = Math.max(previous.height, item.height);
            return;
        }

        merged.push({ ...item, text });
    });

    return merged;
};

const getLogicalItems = (items: SchedulePdfTextItem[]) => (
    groupIntoLines(items).flatMap(line => mergeAdjacentLineItems(line.items))
);

const joinLine = (items: SchedulePdfTextItem[]) => {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    let output = '';
    let previousEnd = 0;

    sorted.forEach((item, index) => {
        const text = normalizeText(item.text);
        if (!text) return;
        if (index === 0 || !output) {
            output = text;
        } else {
            const gap = item.x - previousEnd;
            output += gap <= 1.6 ? text : ` ${text}`;
        }
        previousEnd = item.x + Math.max(item.width || 0, text.length * 2);
    });

    return normalizeText(output);
};

const joinBlock = (items: SchedulePdfTextItem[]) => normalizeText(
    groupIntoLines(items)
        .map(line => joinLine(line.items))
        .filter(Boolean)
        .join(' '),
);

const findHeader = (items: SchedulePdfTextItem[], pattern: RegExp) => (
    getLogicalItems(items).find(item => pattern.test(normalizeText(item.text)))
);

const normalizeDate = (value: string) => {
    const match = normalizeText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`;
};

const normalizeTime = (hour: string, minute: string) => (
    `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
);

const getDayNumber = (rawDay: string) => {
    const normalized = normalizeText(rawDay).toLocaleLowerCase('vi');
    if (normalized.includes('chủ nhật')) return '8';
    if (normalized.includes('hai')) return '2';
    if (normalized.includes('ba')) return '3';
    if (normalized.includes('tư')) return '4';
    if (normalized.includes('năm')) return '5';
    if (normalized.includes('sáu')) return '6';
    if (normalized.includes('bảy')) return '7';
    return '';
};

const getCampusCode = (rawCampus: string) => {
    const campus = normalizeText(rawCampus).toLocaleLowerCase('vi');
    if (campus.includes('hoàng diệu 2') || campus.includes('thủ đức')) return 'TD';
    if (campus.includes('tôn thất đạm') || campus.includes('quận 1')) return 'Q1';
    return normalizeText(rawCampus);
};

const parseMeetings = (rawInformation: string): ImportedScheduleMeeting[] => {
    const information = normalizeText(rawInformation);
    const meetings: ImportedScheduleMeeting[] = [];
    MEETING_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = MEETING_PATTERN.exec(information)) !== null) {
        const day = getDayNumber(match[1]);
        const startTime = normalizeTime(match[2], match[3]);
        const endTime = normalizeTime(match[4], match[5]);
        const room = normalizeText(match[6]);
        const campus = getCampusCode(match[7]);
        if (!day || !room) continue;

        meetings.push({
            day,
            shift: `${startTime}-${endTime}`,
            room,
            campus,
            startTime,
            endTime,
        });
    }

    return meetings;
};

const parseSemester = (text: string) => {
    const normalized = normalizeText(text);
    const match = normalized.match(/\bHK\s*0?([123])\s*\/\s*(20\d{2})\s*-\s*(20\d{2})\b/i);
    if (!match) return '';
    const semester = match[1] === '3' ? 'HE' : match[1];
    return `HK${semester}_${match[2]}_${match[3]}`;
};

const getCourseBoundary = (
    upperCode: SchedulePdfTextItem,
    lowerCode: SchedulePdfTextItem,
) => {
    if (
        upperCode.sourcePage !== undefined
        && lowerCode.sourcePage !== undefined
        && upperCode.sourcePage !== lowerCode.sourcePage
    ) {
        return lowerCode.y + 20;
    }
    return (upperCode.y + lowerCode.y) / 2;
};

const parsePageCourses = (page: SchedulePdfLayoutPage): ImportedScheduleCourse[] => {
    const items = page.items.filter(item => normalizeText(item.text));
    const codeItems = items
        .filter(item => COURSE_CODE_PATTERN.test(normalizeText(item.text)))
        .sort((a, b) => b.y - a.y);
    if (!codeItems.length) return [];

    // Depending on the print width, HUB Portal renders this header either as
    // "Tên học phần" on one line or as "Tên học" / "phần" on two lines.
    const nameHeader = findHeader(items, /^Tên\s+học(?:\s+phần)?$/i);
    const infoHeader = findHeader(items, /^Thông\s+tin$/i);
    const instructorHeader = findHeader(items, /^Giảng$/i);
    if (!nameHeader || !infoHeader || !instructorHeader) return [];

    const creditPositions: number[] = [];
    const firstDatePositions: number[] = [];

    codeItems.forEach((codeItem, index) => {
        const previousCode = codeItems[index - 1];
        const nextCode = codeItems[index + 1];
        const upper = previousCode
            ? getCourseBoundary(previousCode, codeItem)
            : codeItem.y + Math.abs(codeItem.y - (nextCode?.y ?? codeItem.y - 50)) * 0.52;
        const lower = nextCode
            ? getCourseBoundary(codeItem, nextCode)
            : codeItem.y - Math.abs((previousCode?.y ?? codeItem.y + 50) - codeItem.y) * 0.45;
        const block = items.filter(item => item.y <= upper && item.y > lower);
        const dates = block
            .filter(item => DATE_PATTERN.test(normalizeText(item.text)))
            .sort((a, b) => a.x - b.x);
        if (dates[0]) firstDatePositions.push(dates[0].x);

        const credit = block
            .filter(item => item.x > nameHeader.x && item.x < infoHeader.x)
            .filter(item => /^\d+(?:[.,]\d+)?$/.test(normalizeText(item.text)))
            .sort((a, b) => Math.abs(a.y - codeItem.y) - Math.abs(b.y - codeItem.y))[0];
        if (credit) creditPositions.push(credit.x);
    });

    const creditX = median(creditPositions);
    const startDateX = median(firstDatePositions);
    if (!creditX || !startDateX) return [];

    return codeItems.map((codeItem, index) => {
        const previousCode = codeItems[index - 1];
        const nextCode = codeItems[index + 1];
        const upper = previousCode
            ? getCourseBoundary(previousCode, codeItem)
            : codeItem.y + Math.abs(codeItem.y - (nextCode?.y ?? codeItem.y - 50)) * 0.52;
        const lower = nextCode
            ? getCourseBoundary(codeItem, nextCode)
            : codeItem.y - Math.abs((previousCode?.y ?? codeItem.y + 50) - codeItem.y) * 0.45;
        const block = items.filter(item => item.y <= upper && item.y > lower);

        const dates = block
            .filter(item => DATE_PATTERN.test(normalizeText(item.text)))
            .sort((a, b) => a.x - b.x)
            .map(item => normalizeDate(item.text));
        const creditItem = block
            .filter(item => Math.abs(item.x - creditX) <= Math.max(8, page.width * 0.018))
            .filter(item => /^\d+(?:[.,]\d+)?$/.test(normalizeText(item.text)))
            .sort((a, b) => Math.abs(a.y - codeItem.y) - Math.abs(b.y - codeItem.y))[0];

        const subjectName = joinBlock(
            // HUB Portal can place the first glyph 6-7pt to the left of the
            // visible "Tên học phần" header (especially with accented text).
            block.filter(item => item.x >= nameHeader.x - 12 && item.x < creditX - 4),
        ).replace(/\s*\(\s*\)\s*$/g, '').trim();
        const instructor = joinBlock(
            block.filter(item => item.x >= instructorHeader.x - 18 && item.x < startDateX - 5),
        );
        const information = joinBlock(
            block.filter(item => item.x >= infoHeader.x - 45 && item.x < instructorHeader.x - 18),
        );
        const meetings = parseMeetings(information);
        const campuses = [...new Set(meetings.map(meeting => meeting.campus).filter(Boolean))];

        return {
            course_code: normalizeText(codeItem.text).replace(/\s+/g, '_'),
            subject_name: subjectName,
            credits: Number.parseFloat(normalizeText(creditItem?.text || '0').replace(',', '.')) || 0,
            instructor,
            day_of_week: meetings.map(meeting => meeting.day).join('\n'),
            shift: meetings.map(meeting => meeting.shift).join('\n'),
            room: meetings.map(meeting => meeting.room).join('\n'),
            campus: campuses.join('\n') || 'TD',
            weeks: '',
            start_date: dates[0] || '',
            end_date: dates[1] || '',
            meetings,
        };
    });
};

export const parseHubScheduleLayout = (pages: SchedulePdfLayoutPage[]): HubScheduleParseResult => {
    const allText = pages
        .flatMap(page => groupIntoLines(page.items).map(line => joinLine(line.items)))
        .join(' ');
    const isHubSchedule = /THỜI\s+KHÓA\s+BIỂU\s+SINH\s+VIÊN/i.test(normalizeText(allText));
    const semester = parseSemester(allText);
    const detectedCourseCount = pages.reduce(
        (total, page) => total + page.items.filter(item => COURSE_CODE_PATTERN.test(normalizeText(item.text))).length,
        0,
    );
    // HUB Portal only prints the column headers on page 1. Treat all PDF
    // pages as one continuous coordinate space so rows that cross a page
    // boundary (and headerless continuation pages) are parsed together.
    let followingPagesHeight = pages.reduce((total, page) => total + page.height, 0);
    const stitchedItems = pages.flatMap(page => {
        followingPagesHeight -= page.height;
        return page.items.map(item => ({
            ...item,
            y: item.y + followingPagesHeight,
            sourcePage: page.pageNumber,
        }));
    });
    const courses = parsePageCourses({
        pageNumber: 1,
        width: Math.max(0, ...pages.map(page => page.width)),
        height: pages.reduce((total, page) => total + page.height, 0),
        items: stitchedItems,
    });
    const completeCourseCount = courses.filter(course => (
        course.course_code
        && course.subject_name
        && course.credits > 0
        && course.start_date
        && course.end_date
        && course.meetings.length > 0
    )).length;
    const reliable = isHubSchedule
        && Boolean(semester)
        && detectedCourseCount > 0
        && courses.length === detectedCourseCount
        && completeCourseCount === courses.length;

    return {
        semester,
        courses,
        reliable,
        diagnostics: {
            isHubSchedule,
            detectedCourseCount,
            parsedCourseCount: courses.length,
            completeCourseCount,
        },
    };
};
