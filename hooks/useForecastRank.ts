import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../utils/supabase';

interface ForecastRankResult {
    rank: number;
    totalStudents: number;
    topPercent: number;
    semesterId: string; // To know which semester was used
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

export const useForecastRank = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ForecastRankResult | null>(null);
    
    // New state for available reference semesters
    const [availableSemesters, setAvailableSemesters] = useState<string[]>([]);
    const [loadingSemesters, setLoadingSemesters] = useState(false);
    const [semesterRanks, setSemesterRanks] = useState<Record<string, number>>({});
    const [loadingSemesterRanks, setLoadingSemesterRanks] = useState(false);
    const [rankInputs, setRankInputs] = useState<RankInputs | null>(null);

    // 1. Fetch distinct semesters available in DB using RPC
    const fetchAvailableSemesters = useCallback(async () => {
        if (!supabase) return;
        
        // If we already have data, don't refetch unnecessarily unless forced
        if (availableSemesters.length > 0) return;

        setLoadingSemesters(true);
        try {
            // Use RPC 'get_semesters' to fetch distinct values efficiently
            // This avoids the 1000-row limit of standard .select()
            const { data, error } = await supabase.rpc('get_semesters');

            if (error) throw error;

            if (data) {
                // Data structure is expected to be [{ semester: 'HK1...' }, ...]
                const uniqueSemesters = data
                    .map((item: any) => item.semester)
                    .filter(Boolean)
                    .sort()
                    .reverse(); // Sort descending (Newest first)
                
                setAvailableSemesters(uniqueSemesters);
            }
        } catch (err: any) {
            console.error("Error fetching semesters:", err);
            // Don't set global error here to avoid blocking UI, just log it
        } finally {
            setLoadingSemesters(false);
        }
    }, [availableSemesters.length]);

    const fetchSemesterRanks = useCallback(async (semesters: string[], inputs: RankInputs) => {
        if (!supabase) return;
        if (!semesters.length) return;

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
            console.error("Error fetching semester ranks:", err);
        } finally {
            setLoadingSemesterRanks(false);
        }
    }, []);

    const prepareSemesterRanks = useCallback((gpa: number, credits: number, trainingScore: number) => {
        setRankInputs({
            gpa,
            credits,
            trainingScore
        });
    }, []);

    const resetSemesterRanks = useCallback(() => {
        setSemesterRanks({});
        setRankInputs(null);
    }, []);

    // 2. Calculate Rank
    const fetchRank = useCallback(async (semesterId: string, myGpa: number, myCredits: number, myTrainingScore: number) => {
        if (!supabase) {
            setError("Chưa kết nối Database.");
            return;
        }

        if (!semesterId) {
            setError("Chưa chọn kỳ dữ liệu.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            // Get Total Students for this specific reference semester
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

            const { data: rankData, error: rankError } = await supabase.rpc('get_smart_rank', {
                p_semester: semesterId,
                p_gpa: normalizedGpa,
                p_credits: normalizedCredits,
                p_drl: normalizedTrainingScore
            });

            if (rankError) throw rankError;

            const resolvedRank = typeof rankData === 'number'
                ? rankData
                : Array.isArray(rankData)
                    ? rankData[0]?.rank
                    : (rankData as { rank?: number } | null)?.rank;

            if (!resolvedRank) {
                throw new Error('Invalid rank response');
            }

            const topPercent = (resolvedRank / total) * 100;

            setResult({
                rank: resolvedRank,
                totalStudents: total,
                topPercent: topPercent,
                semesterId: semesterId
            });

        } catch (err: any) {
            console.error("Forecast Rank Error:", err);
            setError("Lỗi kết nối máy chủ xếp hạng.");
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
