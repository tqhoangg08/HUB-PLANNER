import type { Semester, Subject, UserData } from '../types';

export interface PositionedPdfItem {
    text: string;
    x: number;
    y: number;
    width: number;
}

export interface PositionedPdfRow {
    pageNumber: number;
    y: number;
    items: PositionedPdfItem[];
    text: string;
}

interface TranscriptColumnLayout {
    sequenceLeft: number;
    codeLeft: number;
    nameLeft: number;
    creditLeft: number;
    typeLeft: number;
    scoreLeft: number;
    resultLeft: number;
    detailLeft: number;
}

interface DirectHubSemester extends Semester {
    expectedCredits: number | null;
}

export interface DirectHubParseResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: { start: number; end: number }[];
    detectedSemesterCount: number;
    subjectCount: number;
    creditChecks: Array<{
        semesterId: string;
        expected: number | null;
        actual: number;
        valid: boolean;
    }>;
    reliable: boolean;
}

const NON_GPA_KEYWORDS = [
    'gdtc',
    'thể chất',
    'the chat',
    'quốc phòng',
    'quoc phong',
    'an ninh',
    'đầu vào',
    'dau vao',
    'quân sự',
    'quan su',
    'chiến đấu',
    'chien dau',
];

const normalizeForMatch = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeScore = (value?: string): { score: number | null; isNonGPA: boolean } => {
    if (!value) return { score: null, isNonGPA: false };
    const numeric = Number.parseFloat(value.replace(',', '.'));
    if (!Number.isNaN(numeric)) return { score: numeric, isNonGPA: false };
    return { score: null, isNonGPA: value.trim().length > 0 };
};

const midpoint = (left: number, right: number) => (left + right) / 2;

const detectColumnLayout = (row: PositionedPdfRow): TranscriptColumnLayout | null => {
    const findHeader = (predicate: (text: string) => boolean) => row.items.find(item => predicate(normalizeForMatch(item.text)));
    const sequence = findHeader(text => text === 'stt');
    const code = findHeader(text => text.includes('ma hoc phan'));
    const name = findHeader(text => text.includes('ten hoc phan'));
    const credit = findHeader(text => text === 'tin chi' || text === 'so tin chi' || text === 'tc');
    const type = findHeader(text => text.includes('loai mon hoc'));
    const score = findHeader(text => text === 'tong diem' || text === 'diem trung binh' || text === 'diem tb');
    const result = findHeader(text => text === 'ket qua');
    const detail = findHeader(text => text === 'chi tiet');

    if (!sequence || !code || !name || !credit || !type || !score || !result || !detail) return null;

    return {
        sequenceLeft: sequence.x - Math.max(8, sequence.width * 0.5),
        codeLeft: midpoint(sequence.x, code.x),
        nameLeft: midpoint(code.x, name.x),
        creditLeft: midpoint(name.x, credit.x),
        typeLeft: midpoint(credit.x, type.x),
        scoreLeft: midpoint(type.x, score.x),
        resultLeft: midpoint(score.x, result.x),
        detailLeft: midpoint(result.x, detail.x),
    };
};

const findColumnItem = (
    row: PositionedPdfRow,
    minX: number,
    maxX: number,
    predicate?: (text: string) => boolean,
) => row.items.find(item => item.x >= minX && item.x < maxX && (!predicate || predicate(item.text)));

const getColumnText = (row: PositionedPdfRow, minX: number, maxX: number) => row.items
    .filter(item => item.x >= minX && item.x < maxX)
    .map(item => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSummaryValue = (row: PositionedPdfRow, label: RegExp): number | null => {
    const normalized = normalizeForMatch(row.text);
    if (!label.test(normalized)) return null;
    const match = normalized.match(/(?:=|\|)\s*(\d+(?:[.,]\d+)?)/);
    return match ? Number.parseFloat(match[1].replace(',', '.')) : null;
};

export const extractPageRows = (items: any[], pageNumber: number): PositionedPdfRow[] => {
    const positionedItems = items
        .filter((item: any) => typeof item?.str === 'string' && item.str.trim())
        .map((item: any) => ({
            text: item.str.trim(),
            x: Number(item.transform?.[4] ?? 0),
            y: Number(item.transform?.[5] ?? 0),
            width: Number(item.width ?? 0),
        }));

    const rows: Array<{ y: number; items: PositionedPdfItem[] }> = [];
    for (const item of positionedItems.sort((a: PositionedPdfItem, b: PositionedPdfItem) => b.y - a.y || a.x - b.x)) {
        let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2.5);
        if (!row) {
            row = { y: item.y, items: [] };
            rows.push(row);
        }
        row.items.push(item);
    }

    return rows
        .sort((a, b) => b.y - a.y)
        .map(row => {
            const sortedItems = row.items.sort((a, b) => a.x - b.x);
            let previousEnd: number | null = null;
            const text = sortedItems.map(item => {
                const gap = previousEnd === null ? 0 : item.x - previousEnd;
                const separator = previousEnd === null ? '' : gap > 8 ? ' | ' : ' ';
                previousEnd = Math.max(previousEnd ?? item.x, item.x + item.width);
                return `${separator}${item.text}`;
            }).join('').trim();
            return { pageNumber, y: row.y, items: sortedItems, text };
        })
        .filter(row => row.text);
};

export const renderPageRows = (rows: PositionedPdfRow[]) => rows.map(row => row.text).join('\n');

export const parseHubTranscriptRows = (rows: PositionedPdfRow[]): DirectHubParseResult => {
    const studentInfo: Partial<UserData> = {};
    const parsedSemesters: DirectHubSemester[] = [];
    const yearRanges: { start: number; end: number }[] = [];
    let currentSemester: DirectHubSemester | null = null;
    let currentLayout: TranscriptColumnLayout | null = null;
    let detectedSemesterCount = 0;
    let lastCourse: { subject: Subject; pageNumber: number; y: number } | null = null;
    let pendingNameLine: { text: string; pageNumber: number; y: number } | null = null;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const studentMatch = row.text.match(/(.+?)\s*\[\s*Mã\s*số\s*:\s*([^\]]+)\]/i);
        if (studentMatch) {
            (studentInfo as any).studentName = studentMatch[1].trim();
            (studentInfo as any).studentCode = studentMatch[2].trim();
        }

        const programMatch = row.text.match(/Chương trình đào tạo\s*:\s*(.+?)(?:\s*\|\s*Kết quả\s*:|$)/i);
        if (programMatch) {
            (studentInfo as any).majorName = programMatch[1].replace(/\s*\|\s*/g, ' ').trim();
        }

        const normalizedRow = normalizeForMatch(row.text);
        const semesterMatch = normalizedRow.match(/hoc\s*ky\s*(1|2|3|he)\s*\/\s*(20\d{2})\s*-\s*(20\d{2})/i);
        if (semesterMatch) {
            const rawSemester = semesterMatch[1].toLowerCase();
            const semesterNo: 1 | 2 | 'Hè' = rawSemester === '1' ? 1 : rawSemester === '2' ? 2 : 'Hè';
            const startYear = Number(semesterMatch[2]);
            const endYear = Number(semesterMatch[3]);
            const semesterId = `imported_${startYear}_${endYear}_hk${semesterNo}`;
            currentSemester = {
                id: semesterId,
                name: `Học kỳ ${semesterNo} Năm học ${startYear}-${endYear}`,
                subjects: [],
                trainingScore: null,
                expectedCredits: null,
            };
            parsedSemesters.push(currentSemester);
            detectedSemesterCount += 1;
            lastCourse = null;
            pendingNameLine = null;
            if (!yearRanges.some(range => range.start === startYear && range.end === endYear)) {
                yearRanges.push({ start: startYear, end: endYear });
            }
            continue;
        }

        const detectedLayout = detectColumnLayout(row);
        if (detectedLayout) {
            currentLayout = detectedLayout;
            lastCourse = null;
            pendingNameLine = null;
            continue;
        }

        if (!currentSemester || !currentLayout) continue;

        const trainingLabel = row.items.find(item => item.x >= currentLayout.nameLeft && /diem ren luyen/i.test(normalizeForMatch(item.text)));
        if (trainingLabel) {
            const trainingScore = parseSummaryValue(row, /diem ren luyen/i)
                ?? Number.parseInt(findColumnItem(row, currentLayout.creditLeft, currentLayout.typeLeft, text => /^\d{1,3}$/.test(text.trim()))?.text ?? '', 10);
            if (Number.isFinite(trainingScore)) currentSemester.trainingScore = trainingScore;
            lastCourse = null;
            pendingNameLine = null;
            continue;
        }

        if (/stc dau/i.test(normalizedRow)) {
            const passedAndFailed = normalizedRow.match(/stc dau\s*\((\d+)\)\s*\+\s*stc rot\s*\((\d+)\)/i);
            const expectedCredits = passedAndFailed
                ? Number(passedAndFailed[1]) + Number(passedAndFailed[2])
                : parseSummaryValue(row, /stc dau/i);
            if (Number.isFinite(expectedCredits)) currentSemester.expectedCredits = expectedCredits;
            lastCourse = null;
            pendingNameLine = null;
            continue;
        }

        const sequenceItem = findColumnItem(row, currentLayout.sequenceLeft, currentLayout.codeLeft, text => /^\d+$/.test(text.trim()));
        const codeItem = findColumnItem(row, currentLayout.codeLeft, currentLayout.nameLeft, text => /^[A-Z0-9][A-Z0-9_.-]*$/i.test(text.trim()));
        const creditItem = findColumnItem(row, currentLayout.creditLeft, currentLayout.typeLeft, text => /^\d+(?:[.,]\d+)?$/.test(text.trim()));

        if (sequenceItem && codeItem && creditItem) {
            const inlineName = getColumnText(row, currentLayout.nameLeft, currentLayout.creditLeft);
            const prefixedName = pendingNameLine
                && pendingNameLine.pageNumber === row.pageNumber
                && pendingNameLine.y - row.y > 0
                && pendingNameLine.y - row.y <= 10
                ? pendingNameLine.text
                : '';
            const name = [prefixedName, inlineName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            pendingNameLine = null;
            const rawCredits = Number.parseFloat(creditItem.text.replace(',', '.'));
            const scoreItem = findColumnItem(
                row,
                currentLayout.scoreLeft,
                currentLayout.resultLeft,
                text => /^-?\d+(?:[.,]\d+)?$|^(?:M|Đạt)$/i.test(text.trim()),
            );
            const { score, isNonGPA: nonNumericScore } = normalizeScore(scoreItem?.text);
            const normalizedName = name || codeItem.text.trim();
            const nameLower = normalizedName.toLowerCase();
            const isNonGPA = nonNumericScore
                || rawCredits === 0
                || NON_GPA_KEYWORDS.some(keyword => nameLower.includes(keyword));
            const subject: Subject = {
                id: `hub_pdf_${currentSemester.id}_${currentSemester.subjects.length}`,
                name: normalizedName,
                credits: Number.isFinite(rawCredits) ? rawCredits : 0,
                scoreCC: score,
                scoreProcess: score,
                scoreMid: score,
                scoreFinal: score,
                isNonGPA,
            };
            currentSemester.subjects.push(subject);
            lastCourse = { subject, pageNumber: row.pageNumber, y: row.y };
            continue;
        }

        const potentialNameLine = getColumnText(row, currentLayout.nameLeft, currentLayout.creditLeft);
        if (
            potentialNameLine
            && !/ten hoc phan|diem trung binh|stc|diem ren luyen/i.test(normalizeForMatch(potentialNameLine))
        ) {
            const nextRow = rows[rowIndex + 1];
            const distanceFromPrevious = lastCourse?.pageNumber === row.pageNumber
                ? lastCourse.y - row.y
                : Number.POSITIVE_INFINITY;
            const distanceToNext = nextRow?.pageNumber === row.pageNumber
                ? row.y - nextRow.y
                : Number.POSITIVE_INFINITY;
            const nextRowStartsCourse = Boolean(
                nextRow
                && nextRow.pageNumber === row.pageNumber
                && distanceToNext > 0
                && distanceToNext <= 10
                && distanceToNext < distanceFromPrevious
                && findColumnItem(nextRow, currentLayout.sequenceLeft, currentLayout.codeLeft, text => /^\d+$/.test(text.trim()))
                && findColumnItem(nextRow, currentLayout.codeLeft, currentLayout.nameLeft, text => /^[A-Z0-9][A-Z0-9_.-]*$/i.test(text.trim()))
                && findColumnItem(nextRow, currentLayout.creditLeft, currentLayout.typeLeft, text => /^\d+(?:[.,]\d+)?$/.test(text.trim())),
            );

            if (
                !nextRowStartsCourse
                && lastCourse
                && lastCourse.pageNumber === row.pageNumber
                && lastCourse.y - row.y > 0
                && lastCourse.y - row.y <= 10
            ) {
                lastCourse.subject.name = `${lastCourse.subject.name} ${potentialNameLine}`.replace(/\s+/g, ' ').trim();
                continue;
            }

            pendingNameLine = { text: potentialNameLine, pageNumber: row.pageNumber, y: row.y };
        }
    }

    const creditChecks = parsedSemesters.map(semester => {
        const actual = semester.subjects.reduce((total, subject) => total + subject.credits, 0);
        return {
            semesterId: semester.id,
            expected: semester.expectedCredits,
            actual,
            valid: semester.expectedCredits === null || Math.abs(actual - semester.expectedCredits) < 0.001,
        };
    });
    const semesters = parsedSemesters.map(({ expectedCredits: _expectedCredits, ...semester }) => semester);
    const subjectCount = semesters.reduce((total, semester) => total + semester.subjects.length, 0);
    const reliable = detectedSemesterCount > 0
        && semesters.length === detectedSemesterCount
        && semesters.every(semester => semester.subjects.length > 0)
        && creditChecks.every(check => check.valid);

    return {
        studentInfo,
        semesters,
        yearRanges,
        detectedSemesterCount,
        subjectCount,
        creditChecks,
        reliable,
    };
};
