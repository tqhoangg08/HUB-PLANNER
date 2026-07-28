import type { Semester } from '../../types';

export interface TranscriptYearRange {
    start: number;
    end: number;
}

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
