import type { Semester } from '../../types';

export interface TranscriptYearRange {
    start: number;
    end: number;
}

/** Source evidence is captured before AI mapping or editable preview changes. */
export interface TranscriptImportIntegrity {
    detectedSemesterCount: number;
    semesters: Array<{ id: string; subjectCount: number; credits: number }>;
    sourceReliable: boolean;
}

export const getTranscriptImportIssue = (
    semesters: Semester[],
    integrity?: TranscriptImportIntegrity,
): string | null => {
    if (!integrity || integrity.detectedSemesterCount === 0) {
        return 'Chưa xác minh được tính đầy đủ của PDF. Không thể xác nhận nhập; bảng điểm cũ được giữ nguyên.';
    }
    const imported = semesters.filter(semester => semester.subjects.length > 0);
    const expectedSubjects = integrity.semesters.reduce((sum, semester) => sum + semester.subjectCount, 0);
    if (imported.length !== integrity.detectedSemesterCount
        || new Set(imported.map(semester => semester.id)).size !== imported.length
        || countTranscriptSubjects(imported) !== expectedSubjects
        || integrity.semesters.some(expected => {
            const actual = imported.find(semester => semester.id === expected.id);
            return !actual || actual.subjects.length !== expected.subjectCount
                || Math.abs(actual.subjects.reduce((sum, subject) => sum + subject.credits, 0) - expected.credits) > 0.001;
        })) {
        return `Dữ liệu chưa đầy đủ: PDF có ${integrity.detectedSemesterCount} học kỳ / ${expectedSubjects} môn, `
            + `xem trước có ${imported.length} học kỳ / ${countTranscriptSubjects(imported)} môn. `
            + 'Không thể xác nhận nhập khi thiếu học kỳ, môn hoặc sai tổng tín chỉ; bảng điểm cũ được giữ nguyên.';
    }
    if (!integrity.sourceReliable) {
        return `Chưa xác minh đủ dòng môn học hoặc tổng tín chỉ trong ${integrity.detectedSemesterCount} học kỳ / ${expectedSubjects} môn của PDF. `
            + 'Vui lòng xuất lại PDF gốc từ BUH Portal. Không thể xác nhận nhập; bảng điểm cũ được giữ nguyên.';
    }
    if (imported.some(semester => semester.subjects.some(subject => (
        !subject.name.trim() || !Number.isFinite(subject.credits) || subject.credits < 0
        || [subject.scoreCC, subject.scoreProcess, subject.scoreMid, subject.scoreFinal].some(score => (
            score !== null && (!Number.isFinite(score) || score < 0 || score > 10)
        ))
    )))) return 'Tên môn, tín chỉ hoặc điểm không hợp lệ. Không thể xác nhận nhập; bảng điểm cũ được giữ nguyên.';
    return null;
};

/** Both the draft callback and persisted update must pass the same guard. */
export const applyTranscriptImport = (
    semesters: Semester[],
    integrity: TranscriptImportIntegrity | undefined,
    apply: (semesters: Semester[]) => void,
): string | null => {
    const issue = getTranscriptImportIssue(semesters, integrity);
    if (!issue) apply(semesters);
    return issue;
};

export const countTranscriptSubjects = (semesters: Semester[]) => (
    semesters.reduce((total, semester) => total + semester.subjects.length, 0)
);

export const reconstructTranscriptSemesters = (
    importedSemesters: Semester[],
    yearRanges: TranscriptYearRange[],
    fallbackYear = new Date().getFullYear(),
) => {
    const startYear = yearRanges.length > 0
        ? Math.min(...yearRanges.map(year => year.start))
        : fallbackYear;
    const reconstructed: Semester[] = [];

    for (let index = 0; index < 4; index += 1) {
        const currentStart = startYear + index;
        const currentEnd = currentStart + 1;
        const yearLabel = `Năm học ${currentStart}-${currentEnd}`;
        const semesterPrefix = `imported_${currentStart}_${currentEnd}`;
        const semesterOneId = `${semesterPrefix}_hk1`;
        const semesterTwoId = `${semesterPrefix}_hk2`;
        const importedSemesterOne = importedSemesters.find(semester => semester.id === semesterOneId);
        const importedSemesterTwo = importedSemesters.find(semester => semester.id === semesterTwoId);

        reconstructed.push(importedSemesterOne ?? {
            id: `generated_${currentStart}_hk1`,
            name: `Học kỳ 1 ${yearLabel}`,
            subjects: [],
            trainingScore: null,
        });
        reconstructed.push(importedSemesterTwo ?? {
            id: `generated_${currentStart}_hk2`,
            name: `Học kỳ 2 ${yearLabel}`,
            subjects: [],
            trainingScore: null,
        });

        reconstructed.push(...importedSemesters.filter(semester => (
            semester.id.startsWith(semesterPrefix)
            && !semester.id.endsWith('hk1')
            && !semester.id.endsWith('hk2')
        )));
    }

    const reconstructedIds = new Set(reconstructed.map(semester => semester.id));
    reconstructed.push(...importedSemesters.filter(semester => !reconstructedIds.has(semester.id)));

    return reconstructed;
};
