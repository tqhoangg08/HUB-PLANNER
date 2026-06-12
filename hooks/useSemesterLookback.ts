import { useCallback, useEffect, useMemo, useState } from 'react';
import { Semester, UserData } from '../types';
import { calculateSemesterStats, calculateSubjectAverage, getGradeDetails, getScholarshipStatus } from '../utils/calculations';
import { getBenchmarkRankingTotal } from '../utils/benchmarkRankings';
import { normalizeSemesterId } from '../utils/rankingData';
import { supabase } from '../utils/supabase';
import { fetchProfilePrivate, updateProfilePrivate } from '../utils/profilePrivate';

export const LOOKBACK_SEMESTER_ID = '2025-2026_HK1';
export const LOOKBACK_SEMESTER_LABEL = 'Học kỳ 1, Năm học 2025-2026';

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

const STORAGE_PREFIX = 'hub_lookback_seen';
const LOOKBACK_SEEN_FIELD = 'lookbackSeen';

const findLookbackSemester = (semesters?: Semester[] | null): Semester | null => {
    return (semesters || []).find(sem => normalizeSemesterId(sem.name) === LOOKBACK_SEMESTER_ID) || null;
};

const getCurrentUserIdentity = async (): Promise<{ studentCode: string | null; userId: string | null }> => {
    if (!supabase) return { studentCode: null, userId: null };

    const { data: { user } } = await supabase.auth.getUser();
    const emailCode = user?.email?.split('@')[0]?.trim();
    if (emailCode) return { studentCode: emailCode, userId: user?.id || null };
    if (!user?.id) return { studentCode: null, userId: null };

    const { data } = await supabase
        .from('profiles')
        .select('student_code')
        .eq('id', user.id)
        .maybeSingle();

    return { studentCode: data?.student_code?.trim() || null, userId: user.id };
};

const hasRemoteLookbackSeen = (privateData?: Record<string, any> | null) => {
    return Boolean(privateData?.[LOOKBACK_SEEN_FIELD]?.[LOOKBACK_SEMESTER_ID]);
};

const markRemoteLookbackSeen = async (userId: string, privateData?: Record<string, any> | null) => {
    const nextData = {
        ...(privateData || {}),
        [LOOKBACK_SEEN_FIELD]: {
            ...((privateData?.[LOOKBACK_SEEN_FIELD] as Record<string, boolean> | undefined) || {}),
            [LOOKBACK_SEMESTER_ID]: true
        }
    };

    await updateProfilePrivate(userId, {
        data: nextData,
        updated_at: new Date().toISOString()
    });
};

export const useSemesterLookback = (activeData: UserData, enabled: boolean) => {
    const [studentCode, setStudentCode] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [lookback, setLookback] = useState<SemesterLookbackData | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const semester = useMemo(() => findLookbackSemester(activeData.semesters), [activeData.semesters]);

    const storageKey = useMemo(
        () => `${STORAGE_PREFIX}_${LOOKBACK_SEMESTER_ID}_${studentCode || 'unknown'}`,
        [studentCode]
    );

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
                setStudentCode(identity.studentCode);
                setUserId(identity.userId);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !studentCode) return;

        let cancelled = false;

        const loadLookback = async () => {
            setLoading(true);
            try {
                let resolvedSemester = semester;
                let privateData: Record<string, any> | null = null;

                if (userId) {
                    const privateRow = await fetchProfilePrivate(userId);
                    privateData = (privateRow?.data as Record<string, any> | null) || null;
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
                let rankRow: any = null;

                const { data, error } = await supabase
                    .from('benchmark_rankings')
                    .select('student_rank,rank_in_class,total_in_class,class_code,rank_in_major,total_in_major,major,gpa,credits,training_score,scholarship_status')
                    .eq('semester', LOOKBACK_SEMESTER_ID)
                    .eq('student_code', studentCode)
                    .maybeSingle();

                if (error) throw error;
                rankRow = data;

                const rank = typeof rankRow?.student_rank === 'number' ? rankRow.student_rank : null;
                const totalStudents = rankRow ? await getBenchmarkRankingTotal(LOOKBACK_SEMESTER_ID) : null;

                const gpa4 = semesterStats?.hasData ? semesterStats.gpa4 : Number(rankRow?.gpa || 0);
                const gpa10 = semesterStats?.hasData ? semesterStats.gpa10 : 0;
                const credits = semesterStats?.hasData ? semesterStats.totalCredits : Number(rankRow?.credits || 0);
                const trainingScore = resolvedSemester?.trainingScore ?? Number(rankRow?.training_score || 0);
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
                    rankInClass: rankRow?.rank_in_class ?? null,
                    totalInClass: rankRow?.total_in_class ?? null,
                    rankInMajor: rankRow?.rank_in_major ?? null,
                    totalInMajor: rankRow?.total_in_major ?? null,
                    major: rankRow?.major || activeData.majorName || null,
                    classCode: rankRow?.class_code || null,
                    topPercent: rank && totalStudents ? (rank / totalStudents) * 100 : null,
                    scholarshipLabel: rankRow?.scholarship_status || scholarship.label,
                    bestSubject,
                    excellentSubjectCount,
                    passedSubjectCount,
                    totalSubjectCount: scoredSubjects.length
                };

                setLookback(nextLookback);

                const hasLookbackData = Boolean(semesterStats?.hasData || rankRow);
                const hasSeenLookback = localStorage.getItem(storageKey) || hasRemoteLookbackSeen(privateData);

                if (!hasSeenLookback && hasLookbackData) {
                    setIsOpen(true);
                    localStorage.setItem(storageKey, '1');
                    if (userId) {
                        markRemoteLookbackSeen(userId, privateData).catch(error => {
                            console.error('Lookback seen save error:', error);
                        });
                    }
                }
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
    }, [activeData.majorName, enabled, semester, storageKey, studentCode, userId]);

    return {
        lookback,
        loading,
        isOpen,
        open,
        close
    };
};
