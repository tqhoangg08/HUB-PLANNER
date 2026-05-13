import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { normalizeSemesterId } from '../utils/rankingData';

interface ForecastRankResult {
    rank: number;
    totalStudents: number;
    topPercent: number;
    semesterId: string;
    rankInClass?: number | null;
    totalInClass?: number | null;
    classCode?: string | null;
    rankInMajor?: number | null;
    totalInMajor?: number | null;
    major?: string | null;
}

interface SemesterRankRow {
    semester_name: string;
    rank: number;
}

interface RankInputs {
    gpa: number;
    credits: number;
    trainingScore: number;
}

interface RankContext {
    studentCode?: string | null;
    classCode?: string | null;
    major?: string | null;
    currentSemesterId?: string | null;
}

const toNumberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const toRankValue = (value: unknown): number => toNumberOrNull(value) ?? -Infinity;

const getCurrentStudentCode = async (): Promise<string | null> => {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    const emailCode = user?.email?.split('@')[0]?.trim();
    if (emailCode) return emailCode;
    if (!user?.id) return null;

    const { data } = await supabase
        .from('profiles')
        .select('student_code')
        .eq('id', user.id)
        .maybeSingle();

    return data?.student_code?.trim() || null;
};

export const useForecastRank = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ForecastRankResult | null>(null);
    const [availableSemesters, setAvailableSemesters] = useState<string[]>([]);
    const [loadingSemesters, setLoadingSemesters] = useState(false);
    const [semesterRanks, setSemesterRanks] = useState<Record<string, number>>({});
    const [loadingSemesterRanks, setLoadingSemesterRanks] = useState(false);
    const [rankInputs, setRankInputs] = useState<RankInputs | null>(null);

    const fetchAvailableSemesters = useCallback(async () => {
        if (!supabase) return;
        if (availableSemesters.length > 0) return;

        setLoadingSemesters(true);
        try {
            const { data, error } = await supabase.rpc('get_semesters');
            if (error) throw error;

            const uniqueSemesters = (data ?? [])
                .map((item: any) => item.semester)
                .filter(Boolean)
                .sort()
                .reverse();

            setAvailableSemesters(uniqueSemesters);
        } catch (err: any) {
            console.error('Error fetching semesters:', err);
        } finally {
            setLoadingSemesters(false);
        }
    }, [availableSemesters.length]);

    const fetchSemesterRanks = useCallback(async (semesters: string[], inputs: RankInputs) => {
        if (!supabase || !semesters.length) return;

        setLoadingSemesterRanks(true);
        try {
            const normalizedInputs: RankInputs = {
                gpa: Number.isFinite(inputs.gpa) ? inputs.gpa : 0,
                credits: Number.isFinite(inputs.credits) ? inputs.credits : 0,
                trainingScore: Number.isFinite(inputs.trainingScore) ? inputs.trainingScore : 0
            };

            const { data, error } = await supabase.rpc('get_ranks_for_all_semesters', {
                p_gpa: normalizedInputs.gpa,
                p_credits: normalizedInputs.credits,
                p_drl: normalizedInputs.trainingScore,
                p_semesters: semesters
            });

            if (error) throw error;

            const mappedRanks = (data as SemesterRankRow[] | null)?.reduce<Record<string, number>>(
                (acc, row) => {
                    if (row?.semester_name && Number.isFinite(row.rank)) {
                        acc[row.semester_name] = row.rank;
                    }
                    return acc;
                },
                {}
            ) ?? {};

            setSemesterRanks(mappedRanks);
        } catch (err: any) {
            console.error('Error fetching semester ranks:', err);
        } finally {
            setLoadingSemesterRanks(false);
        }
    }, []);

    const prepareSemesterRanks = useCallback((gpa: number, credits: number, trainingScore: number) => {
        setRankInputs({ gpa, credits, trainingScore });
    }, []);

    const resetSemesterRanks = useCallback(() => {
        setSemesterRanks({});
        setRankInputs(null);
    }, []);

    const fetchRank = useCallback(async (
        semesterId: string,
        myGpa: number,
        myCredits: number,
        myTrainingScore: number,
        context?: RankContext
    ) => {
        if (!supabase) {
            setError('Chưa kết nối Database.');
            return;
        }

        if (!semesterId) {
            setError('Chưa chọn kỳ dữ liệu.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const { count: total, error: countError } = await supabase
                .from('benchmark_rankings')
                .select('*', { count: 'exact', head: true })
                .eq('semester', semesterId);

            if (countError) throw countError;

            if (total === 0 || total === null) {
                setError(`Dữ liệu ${semesterId} đang trống.`);
                setLoading(false);
                return;
            }

            const normalizedGpa = Number.isFinite(myGpa) ? myGpa : 0;
            const normalizedCredits = Number.isFinite(myCredits) ? myCredits : 0;
            const normalizedTrainingScore = Number.isFinite(myTrainingScore) ? myTrainingScore : 0;
            const selectedSemesterKey = normalizeSemesterId(semesterId) || semesterId;
            const currentSemesterKey = normalizeSemesterId(context?.currentSemesterId) || context?.currentSemesterId || null;
            const isSameSemester = Boolean(currentSemesterKey && selectedSemesterKey && currentSemesterKey === selectedSemesterKey);
            const studentCode = context?.studentCode?.trim() || await getCurrentStudentCode();

            let exactStudentRow: any = null;
            if (isSameSemester && studentCode) {
                const { data, error } = await supabase
                    .from('benchmark_rankings')
                    .select('*')
                    .eq('semester', semesterId)
                    .eq('student_code', studentCode)
                    .maybeSingle();

                if (error) throw error;
                exactStudentRow = data;
            }

            const lookupStudentCode = isSameSemester ? studentCode : null;
            const lookupClassCode = exactStudentRow?.class_code || (isSameSemester ? context?.classCode || null : null);
            const lookupMajor = exactStudentRow?.major || context?.major || null;

            const { data: detailData, error: detailError } = await supabase.rpc('get_smart_rank_details', {
                p_semester: semesterId,
                p_gpa: normalizedGpa,
                p_credits: normalizedCredits,
                p_drl: normalizedTrainingScore,
                p_student_code: lookupStudentCode,
                p_class_code: lookupClassCode,
                p_major: lookupMajor
            });

            let rankRow: any = null;
            let resolvedRank: number | null = null;
            let resolvedTotal = total;

            if (!detailError && detailData) {
                rankRow = Array.isArray(detailData) ? detailData[0] : detailData;
                resolvedRank = toNumberOrNull(rankRow?.rank);
                resolvedTotal = toNumberOrNull(rankRow?.total_students) ?? total;
            } else {
                const { data: rankData, error: rankError } = await supabase.rpc('get_smart_rank', {
                    p_semester: semesterId,
                    p_gpa: normalizedGpa,
                    p_credits: normalizedCredits,
                    p_drl: normalizedTrainingScore
                });

                if (rankError) throw detailError || rankError;

                resolvedRank = typeof rankData === 'number'
                    ? rankData
                    : Array.isArray(rankData)
                        ? toNumberOrNull(rankData[0]?.rank)
                        : toNumberOrNull((rankData as { rank?: number } | null)?.rank);
            }

            if (exactStudentRow) {
                resolvedRank = toNumberOrNull(exactStudentRow.student_rank) ?? resolvedRank;
                rankRow = {
                    ...rankRow,
                    rank_in_class: exactStudentRow.rank_in_class ?? rankRow?.rank_in_class ?? null,
                    total_in_class: exactStudentRow.total_in_class ?? rankRow?.total_in_class ?? null,
                    class_code: exactStudentRow.class_code ?? rankRow?.class_code ?? null,
                    rank_in_major: exactStudentRow.rank_in_major ?? rankRow?.rank_in_major ?? null,
                    total_in_major: exactStudentRow.total_in_major ?? rankRow?.total_in_major ?? null,
                    major: exactStudentRow.major ?? rankRow?.major ?? null
                };
            }

            if (exactStudentRow?.class_code && (!rankRow?.rank_in_class || !rankRow?.total_in_class)) {
                const { data: classRows, error: classError } = await supabase
                    .from('benchmark_rankings')
                    .select('student_code,gpa,training_score,credits')
                    .eq('semester', semesterId)
                    .eq('class_code', exactStudentRow.class_code);

                if (classError) throw classError;

                const sortedRows = [...(classRows ?? [])].sort((a: any, b: any) => {
                    const byGpa = toRankValue(b.gpa) - toRankValue(a.gpa);
                    if (byGpa !== 0) return byGpa;
                    const byTraining = toRankValue(b.training_score) - toRankValue(a.training_score);
                    if (byTraining !== 0) return byTraining;
                    return toRankValue(b.credits) - toRankValue(a.credits);
                });

                let currentRank = 0;
                let previousSignature = '';
                const matchedIndex = sortedRows.findIndex((row: any, index) => {
                    const signature = `${toRankValue(row.gpa)}|${toRankValue(row.training_score)}|${toRankValue(row.credits)}`;
                    if (signature !== previousSignature) {
                        currentRank = index + 1;
                        previousSignature = signature;
                    }
                    if (row.student_code === studentCode) {
                        rankRow = {
                            ...rankRow,
                            rank_in_class: currentRank,
                            total_in_class: sortedRows.length
                        };
                        return true;
                    }
                    return false;
                });

                if (matchedIndex < 0) {
                    rankRow = {
                        ...rankRow,
                        total_in_class: sortedRows.length
                    };
                }
            }

            if (!resolvedRank) {
                throw new Error('Invalid rank response');
            }

            setResult({
                rank: resolvedRank,
                totalStudents: resolvedTotal,
                topPercent: (resolvedRank / resolvedTotal) * 100,
                semesterId,
                rankInClass: rankRow?.rank_in_class ?? null,
                totalInClass: rankRow?.total_in_class ?? null,
                classCode: rankRow?.class_code ?? null,
                rankInMajor: rankRow?.rank_in_major ?? null,
                totalInMajor: rankRow?.total_in_major ?? null,
                major: rankRow?.major ?? context?.major ?? null
            });
        } catch (err: any) {
            console.error('Forecast Rank Error:', err);
            setError('Lỗi kết nối máy chủ xếp hạng.');
        } finally {
            setLoading(false);
        }
    }, []);

    const resetResult = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    useEffect(() => {
        if (!rankInputs || availableSemesters.length === 0) return;
        fetchSemesterRanks(availableSemesters, rankInputs);
    }, [availableSemesters, fetchSemesterRanks, rankInputs]);

    return {
        fetchRank,
        result,
        loading,
        error,
        resetResult,
        fetchAvailableSemesters,
        availableSemesters,
        loadingSemesters,
        prepareSemesterRanks,
        resetSemesterRanks,
        semesterRanks,
        loadingSemesterRanks
    };
};
