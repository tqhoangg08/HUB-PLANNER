import { useState, useCallback, useEffect } from 'react';
import { normalizeSemesterId } from '../utils/rankingData';
import {
  fetchCloudflareOwnRanking,
  fetchCloudflareRankingSemesters,
  forecastCloudflareRankings,
} from '../utils/benchmarkRankingsApi';

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

const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeInputs = (inputs: RankInputs): RankInputs => ({
  gpa: Number.isFinite(inputs.gpa) ? inputs.gpa : 0,
  credits: Number.isFinite(inputs.credits) ? inputs.credits : 0,
  trainingScore: Number.isFinite(inputs.trainingScore) ? inputs.trainingScore : 0,
});

/**
 * Forecast rankings are served exclusively from the Public Worker/D1 mirror.
 * There is intentionally no browser Supabase RPC or table-read fallback.
 */
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
    if (availableSemesters.length > 0) return;
    setLoadingSemesters(true);
    try {
      const rows = await fetchCloudflareRankingSemesters();
      setAvailableSemesters(
        rows
          .map((item) => item.semester)
          .filter(Boolean)
          .sort()
          .reverse()
      );
    } catch {
      // Ranking controls remain empty until the Worker mirror is available.
      setAvailableSemesters([]);
    } finally {
      setLoadingSemesters(false);
    }
  }, [availableSemesters.length]);

  const fetchSemesterRanks = useCallback(async (
    semesters: string[],
    inputs: RankInputs
  ) => {
    if (!semesters.length) return;
    setLoadingSemesterRanks(true);
    try {
      const rows = await forecastCloudflareRankings({
        semesters,
        ...normalizeInputs(inputs),
      });
      setSemesterRanks(rows.reduce<Record<string, number>>((accumulator, row) => {
        if (row.semester && Number.isFinite(row.rank)) {
          accumulator[row.semester] = row.rank;
        }
        return accumulator;
      }, {}));
    } catch {
      setSemesterRanks({});
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
    if (!semesterId) {
      setError('Chưa chọn kỳ dữ liệu.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const selectedSemester = normalizeSemesterId(semesterId) || semesterId;
      const currentSemester = normalizeSemesterId(context?.currentSemesterId) ||
        context?.currentSemesterId || null;
      const isCurrentSemester = Boolean(currentSemester && currentSemester === selectedSemester);

      const ownRanking = isCurrentSemester
        ? await fetchCloudflareOwnRanking(semesterId).catch(() => null)
        : null;
      const rows = await forecastCloudflareRankings({
        semesters: [semesterId],
        ...normalizeInputs({
          gpa: myGpa,
          credits: myCredits,
          trainingScore: myTrainingScore,
        }),
        major: ownRanking?.major || context?.major || null,
      });
      const forecast = rows[0];
      const rank = finiteNumber(ownRanking?.studentRank) ?? finiteNumber(forecast?.rank);
      const totalStudents = finiteNumber(ownRanking?.totalStudents) ??
        finiteNumber(forecast?.totalStudents);

      if (!rank || !totalStudents) {
        throw new Error('Invalid ranking response');
      }

      setResult({
        rank,
        totalStudents,
        topPercent: (rank / totalStudents) * 100,
        semesterId,
        rankInClass: ownRanking?.rankInClass ?? null,
        totalInClass: ownRanking?.totalInClass ?? null,
        classCode: ownRanking?.classCode ?? context?.classCode ?? null,
        rankInMajor: ownRanking?.rankInMajor ?? forecast?.rankInMajor ?? null,
        totalInMajor: ownRanking?.totalInMajor ?? forecast?.totalInMajor ?? null,
        major: ownRanking?.major ?? forecast?.major ?? context?.major ?? null,
      });
    } catch {
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
    void fetchSemesterRanks(availableSemesters, rankInputs);
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
    loadingSemesterRanks,
  };
};
