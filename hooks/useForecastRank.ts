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
            const lookupStudentCode = isSameSemester ? context?.studentCode || null : null;
            const lookupClassCode = isSameSemester ? context?.classCode || null : null;

            const { data: detailData, error: detailError } = await supabase.rpc('get_smart_rank_details', {
                p_semester: semesterId,
                p_gpa: normalizedGpa,
                p_credits: normalizedCredits,
                p_drl: normalizedTrainingScore,
                p_student_code: lookupStudentCode,
                p_class_code: lookupClassCode,
                p_major: context?.major || null
            });

            let rankRow: any = null;
            let resolvedRank: number | null = null;
            let resolvedTotal = total;

            if (!detailError && detailData) {
                rankRow = Array.isArray(detailData) ? detailData[0] : detailData;
                resolvedRank = typeof rankRow?.rank === 'number' ? rankRow.rank : null;
                resolvedTotal = typeof rankRow?.total_students === 'number' ? rankRow.total_students : total;
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
                        ? rankData[0]?.rank
                        : (rankData as { rank?: number } | null)?.rank ?? null;
            }

            if (!resolvedRank) {
                throw new Error('Invalid rank response');
            }

            setResult({
                rank: resolvedRank,
                totalStudents: resolvedTotal,
                topPercent: (resolvedRank / resolvedTotal) * 100,
                semesterId,
                rankInClass: isSameSemester ? rankRow?.rank_in_class ?? null : null,
                totalInClass: isSameSemester ? rankRow?.total_in_class ?? null : null,
                classCode: isSameSemester ? rankRow?.class_code ?? context?.classCode ?? null : null,
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
