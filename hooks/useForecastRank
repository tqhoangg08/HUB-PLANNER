import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';

interface ForecastRankResult {
    rank: number;
    totalStudents: number;
    topPercent: number;
}

export const useForecastRank = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ForecastRankResult | null>(null);

    const fetchRank = useCallback(async (semesterId: string, myGpa: number) => {
        if (!supabase) {
            setError("Chưa kết nối Database.");
            return;
        }

        if (!semesterId) {
            setError("Không xác định được mã học kỳ.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            // 1. Get Total Students for this semester
            const { count: total, error: countError } = await supabase
                .from('benchmark_rankings')
                .select('*', { count: 'exact', head: true })
                .eq('semester', semesterId);

            if (countError) throw countError;

            if (total === 0 || total === null) {
                setError(`Chưa có dữ liệu xếp hạng cho ${semesterId}`);
                setLoading(false);
                return;
            }

            // 2. Count students with higher GPA
            // Note: Using 'gt' (Greater Than). If GPA is 4.0, 'gt' 4.0 is 0 people better. Rank = 1.
            const { count: betterCount, error: rankError } = await supabase
                .from('benchmark_rankings')
                .select('*', { count: 'exact', head: true })
                .eq('semester', semesterId)
                .gt('gpa', myGpa);

            if (rankError) throw rankError;

            const betterStudents = betterCount || 0;
            const myRank = betterStudents + 1;
            const topPercent = (myRank / total) * 100;

            setResult({
                rank: myRank,
                totalStudents: total,
                topPercent: topPercent
            });

        } catch (err: any) {
            console.error("Forecast Rank Error:", err);
            setError("Lỗi kết nối máy chủ xếp hạng.");
        } finally {
            setLoading(false);
        }
    }, []);

    return { fetchRank, result, loading, error };
};
