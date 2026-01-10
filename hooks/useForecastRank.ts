import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';

interface ForecastRankResult {
    rank: number;
    totalStudents: number;
    topPercent: number;
    semesterId: string; // To know which semester was used
}

export const useForecastRank = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ForecastRankResult | null>(null);
    
    // New state for available reference semesters
    const [availableSemesters, setAvailableSemesters] = useState<string[]>([]);
    const [loadingSemesters, setLoadingSemesters] = useState(false);

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

    // 2. Calculate Rank
    const fetchRank = useCallback(async (semesterId: string, myGpa: number) => {
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

            // Count students with higher GPA
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

    return { 
        fetchRank, 
        result, 
        loading, 
        error, 
        resetResult,
        fetchAvailableSemesters,
        availableSemesters,
        loadingSemesters
    };
};
