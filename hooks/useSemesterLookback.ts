import { useCallback, useEffect, useMemo, useState } from 'react';
import { Semester, UserData } from '../types';
import { calculateSemesterStats, calculateSubjectAverage, getGradeDetails, getScholarshipStatus } from '../utils/calculations';
import { normalizeSemesterId } from '../utils/rankingData';
import { getLocalSessionUser } from '../utils/clientSession';
import { fetchOwnPrivateProfile } from '../utils/privateProfileApi';
import { fetchCloudflareOwnRanking } from '../utils/benchmarkRankingsApi';

export const LOOKBACK_SEMESTER_ID = '2025-2026_HK2';
export const LOOKBACK_SEMESTER_LABEL = 'Học kỳ 2, Năm học 2025-2026';

export interface SemesterLookbackData {
    semester: Semester | null;
    gpa4: number;
    gpa10: number;
    credits: number;
    trainingScore: number;
    rank: number | null;
    totalStudents: number | null;
    rankInClass: number | null;
    totalInClass: number | null;
    rankInMajor: number | null;
    totalInMajor: number | null;
    major: string | null;
    classCode: string | null;
    topPercent: number | null;
    scholarshipLabel: string;
    officialScholarship: boolean;
    exactRankingFound: boolean;
    bestSubject: {
        name: string;
        score10: number;
        scale4: number;
        letter: string;
        credits: number;
    } | null;
    excellentSubjectCount: number;
    passedSubjectCount: number;
    totalSubjectCount: number;
}

const findLookbackSemester = (semesters?: Semester[] | null): Semester | null => {
    return (semesters || []).find(sem => normalizeSemesterId(sem.name) === LOOKBACK_SEMESTER_ID) || null;
};

const getCurrentUserIdentity = async (): Promise<{ userId: string | null }> => {
    const user = await getLocalSessionUser();
    return { userId: user?.id || null };
};

export const useSemesterLookback = (activeData: UserData, enabled: boolean) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [lookback, setLookback] = useState<SemesterLookbackData | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const semester = useMemo(() => findLookbackSemester(activeData.semesters), [activeData.semesters]);

    const open = useCallback(() => {
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        getCurrentUserIdentity().then(identity => {
            if (!cancelled) {
                setUserId(identity.userId);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !isOpen || !userId) return;

        let cancelled = false;

        const loadLookback = async () => {
            setLoading(true);
            try {
                let resolvedSemester = semester;
                let privateData: Record<string, any> | null = null;

                if (userId) {
                    const profile = await fetchOwnPrivateProfile();
                    privateData = (profile.privateProfile?.data as Record<string, any> | null) || null;
                    const privateSemester = findLookbackSemester((privateData as UserData | null | undefined)?.semesters);
                    if ((privateSemester?.subjects?.length || 0) > (resolvedSemester?.subjects?.length || 0)) {
                        resolvedSemester = privateSemester;
                    }
                }

                const semesterStats = resolvedSemester ? calculateSemesterStats(resolvedSemester.subjects) : null;
                const scoredSubjects = (resolvedSemester?.subjects || [])
                    .filter(subject => !subject.isNonGPA)
                    .map(subject => {
                        const score10 = calculateSubjectAverage(subject);
                        if (score10 === null) return null;
                        const details = getGradeDetails(score10);
                        return {
                            name: subject.name,
                            score10,
                            scale4: details.scale4,
                            letter: details.letter,
                            credits: subject.credits
                        };
                    })
                    .filter((subject): subject is NonNullable<typeof subject> => subject !== null);
                const bestSubject = scoredSubjects
                    .slice()
                    .sort((a, b) => b.score10 - a.score10 || b.credits - a.credits)[0] || null;
                const excellentSubjectCount = scoredSubjects.filter(subject => subject.letter.startsWith('A')).length;
                const passedSubjectCount = scoredSubjects.filter(subject => subject.score10 >= 4).length;
                const ownRanking = await fetchCloudflareOwnRanking(LOOKBACK_SEMESTER_ID);
                const exactRanking = ownRanking && 'rankingMode' in ownRanking && ownRanking.rankingMode === 'exact'
                    ? ownRanking : null;
                const rank = exactRanking?.found && typeof exactRanking.rank === 'number'
                    ? exactRanking.rank : null;
                const totalStudents = exactRanking?.totalStudents ?? null;

                const gpa4 = semesterStats?.hasData ? semesterStats.gpa4 : 0;
                const gpa10 = semesterStats?.hasData ? semesterStats.gpa10 : 0;
                const credits = semesterStats?.hasData ? semesterStats.totalCredits : 0;
                const trainingScore = resolvedSemester?.trainingScore ?? 0;
                const scholarship = getScholarshipStatus(gpa4, trainingScore, credits);

                if (cancelled) return;

                const nextLookback: SemesterLookbackData = {
                    semester: resolvedSemester,
                    gpa4,
                    gpa10,
                    credits,
                    trainingScore,
                    rank,
                    totalStudents,
                    rankInClass: exactRanking?.rankInClass ?? null,
                    totalInClass: exactRanking?.totalInClass ?? null,
                    rankInMajor: exactRanking?.rankInMajor ?? null,
                    totalInMajor: exactRanking?.totalInMajor ?? null,
                    major: exactRanking?.major || activeData.majorName || null,
                    classCode: exactRanking?.classCode || null,
                    topPercent: rank && totalStudents ? (rank / totalStudents) * 100 : null,
                    scholarshipLabel: exactRanking?.found
                        ? exactRanking.scholarshipStatus || 'Chưa có dữ liệu'
                        : credits > 0 ? scholarship.label : 'Chưa đủ dữ liệu',
                    officialScholarship: Boolean(exactRanking?.found),
                    exactRankingFound: Boolean(exactRanking?.found),
                    bestSubject,
                    excellentSubjectCount,
                    passedSubjectCount,
                    totalSubjectCount: scoredSubjects.length
                };

                setLookback(nextLookback);
            } catch (error) {
                console.error('Lookback load error:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadLookback();

        return () => {
            cancelled = true;
        };
    }, [activeData.majorName, enabled, isOpen, semester, userId]);

    return {
        lookback,
        loading,
        isOpen,
        open,
        close
    };
};
