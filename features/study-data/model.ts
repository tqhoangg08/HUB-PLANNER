import type { Semester, UserData } from '../../types.ts';

export const DEFAULT_TRANSCRIPT_SEMESTER_NAME = 'Học kỳ 1 Năm học 2025-2026';
export const REMOTE_SAVE_DEBOUNCE_MS = 8_000;

const isValidTranscriptSemesterName = (name?: string) =>
    /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test((name || '').trim());

const parseTranscriptSemesterName = (name?: string) => {
    const match = (name || '').trim().match(/^Học kỳ (1|2) Năm học (\d{4})-\d{4}$/);
    if (!match) return null;
    return { term: Number(match[1]), year: Number(match[2]) };
};

const getFollowingTranscriptSemesterName = ({ term, year }: { term: number; year: number }) => {
    const nextTerm = term === 1 ? 2 : 1;
    const nextYear = term === 1 ? year : year + 1;
    return `Học kỳ ${nextTerm} Năm học ${nextYear}-${nextYear + 1}`;
};

export const getNextTranscriptSemesterName = (semesters: Semester[]) => {
    const selectedSemesters = semesters
        .map(semester => parseTranscriptSemesterName(semester.name))
        .filter((semester): semester is { term: number; year: number } => Boolean(semester));

    if (selectedSemesters.length === 0) {
        return DEFAULT_TRANSCRIPT_SEMESTER_NAME;
    }

    const latestSemester = selectedSemesters.reduce((latest, current) => {
        const latestWeight = latest.year * 2 + latest.term;
        const currentWeight = current.year * 2 + current.term;
        return currentWeight > latestWeight ? current : latest;
    });

    return getFollowingTranscriptSemesterName(latestSemester);
};

export const createInitialSemester = (): Semester => ({
    id: 'y1_hk1',
    name: DEFAULT_TRANSCRIPT_SEMESTER_NAME,
    subjects: [],
    trainingScore: null,
});

export const INITIAL_STUDY_DATA: UserData = {
    studentName: '',
    cohort: '',
    programName: '',
    majorName: '',
    specializationName: '',
    totalCreditsRequired: 125,
    hasOnboarded: false,
    semesters: [createInitialSemester()],
    targetGPA: 3.2,
};

export const hasMeaningfulStudyData = (value?: Partial<UserData> | null): boolean => {
    if (!value) return false;
    return Boolean(
        value.studentName?.trim()
        || value.cohort?.trim()
        || value.programName?.trim()
        || value.majorName?.trim()
        || value.specializationName?.trim()
        || value.semesters?.some(semester =>
            semester.subjects?.length > 0
            || semester.trainingScore !== null
            || Boolean(
                semester.name?.trim()
                && semester.name.trim() !== DEFAULT_TRANSCRIPT_SEMESTER_NAME,
            )
        )
    );
};

export const hasCompleteRequiredStudyProfile = (value?: Partial<UserData> | null): boolean => {
    if (!value) return false;
    return Boolean(
        value.studentName?.trim()
        && value.programName?.trim()
        && value.cohort?.trim()
        && value.majorName?.trim()
        && value.specializationName?.trim()
    );
};

const normalizeSemesterName = (name?: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    if (/^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(trimmed)) return trimmed;

    const compactMatch = trimmed.match(/^Học kỳ\s+(1|2|3|Hè)\s+(\d{4})-(\d{4})$/i);
    if (compactMatch) {
        return `Học kỳ ${compactMatch[1]} Năm học ${compactMatch[2]}-${compactMatch[3]}`;
    }

    return trimmed;
};

export const normalizeLoadedUserData = (value?: Partial<UserData> | null): UserData => {
    const loadedData = { ...INITIAL_STUDY_DATA, ...(value || {}) };
    const usedSemesterNames = new Set<string>();

    loadedData.semesters = (loadedData.semesters || [])
        .map(semester => ({
            ...semester,
            name: normalizeSemesterName(semester.name),
            subjects: Array.isArray(semester.subjects) ? semester.subjects : [],
        }))
        .reduce<Semester[]>((semesters, semester) => {
            const hasSemesterData = semester.subjects.length > 0 || semester.trainingScore !== null;
            const hasValidName = isValidTranscriptSemesterName(semester.name);

            if (!hasSemesterData && !hasValidName) return semesters;

            let nextSemester = semester;
            if (!hasValidName) {
                nextSemester = {
                    ...semester,
                    name: getNextTranscriptSemesterName(semesters),
                };
            }

            if (usedSemesterNames.has(nextSemester.name)) {
                nextSemester = {
                    ...nextSemester,
                    name: getNextTranscriptSemesterName(semesters),
                };
            }

            usedSemesterNames.add(nextSemester.name);
            semesters.push(nextSemester);
            return semesters;
        }, []);

    if (loadedData.semesters.length === 0) {
        loadedData.semesters = [createInitialSemester()];
    }

    return {
        ...loadedData,
        hasOnboarded: loadedData.hasOnboarded || hasMeaningfulStudyData(loadedData),
    };
};
