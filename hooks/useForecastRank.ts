import { useState, useCallback, useEffect } from 'react';
import { normalizeSemesterId } from '../utils/rankingData';
import {
  fetchCloudflareOwnRanking,
  fetchCloudflareRankingSemesters,
  forecastCloudflareRankings,
  type RankingMode,
} from '../utils/benchmarkRankingsApi';

interface ForecastRankResult {
  rank: number | null;
  totalStudents: number;
  topPercent: number | null;
  semesterId: string;
  rankingMode: RankingMode;
  found: boolean;
  scholarshipStatus?: string | null;
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
  classCode?: string | null;
  major?: string | null;
  currentSemesterId?: string | null;
}

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
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
  const [semesterModes, setSemesterModes] = useState<Record<string, RankingMode>>({});
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [semesterRanks, setSemesterRanks] = useState<Record<string, number>>({});
  const [loadingSemesterRanks, setLoadingSemesterRanks] = useState(false);
  const [rankInputs, setRankInputs] = useState<RankInputs | null>(null);

  const fetchAvailableSemesters = useCallback(async () => {
    if (availableSemesters.length > 0) return;
    setLoadingSemesters(true);
    try {
      const rows = await fetchCloudflareRankingSemesters();
      setSemesterModes(Object.fromEntries(rows.map((item) => [
        item.semester, item.rankingMode === 'exact' ? 'exact' : 'forecast',
      ])));
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
      setSemesterModes({});
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
      const forecastSemesters = semesters.filter((semester) => semesterModes[semester] !== 'exact');
      const exactSemesters = semesters.filter((semester) => semesterModes[semester] === 'exact');
      const rows = forecastSemesters.length ? await forecastCloudflareRankings({
        semesters: forecastSemesters,
        ...normalizeInputs(inputs),
      }) : [];
      const nextRanks = rows.reduce<Record<string, number>>((accumulator, row) => {
        if (row.semester && Number.isFinite(row.rank)) {
          accumulator[row.semester] = row.rank;
        }
        return accumulator;
      }, {});
      for (const semester of exactSemesters) {
        const own = await fetchCloudflareOwnRanking(semester);
        if (own && 'rankingMode' in own && own.rankingMode === 'exact' &&
            own.found && Number.isFinite(own.rank)) {
          nextRanks[semester] = own.rank as number;
        }
      }
      setSemesterRanks(nextRanks);
    } catch {
      setSemesterRanks({});
    } finally {
      setLoadingSemesterRanks(false);
    }
  }, [semesterModes]);

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

      if (semesterModes[selectedSemester] === 'exact') {
        const own = await fetchCloudflareOwnRanking(selectedSemester);
        if (!own || !('rankingMode' in own) || own.rankingMode !== 'exact') {
          throw new Error('Invalid exact ranking response');
        }
        const rank = own.found ? finiteNumber(own.rank) : null;
        if (own.found && !rank) throw new Error('Invalid exact ranking rank');
        setResult({
          semesterId: selectedSemester,
          rankingMode: 'exact',
          found: own.found,
          rank,
          totalStudents: own.totalStudents,
          topPercent: rank ? (rank / own.totalStudents) * 100 : null,
          rankInClass: own.rankInClass ?? null,
          totalInClass: own.totalInClass ?? null,
          classCode: own.classCode ?? null,
          rankInMajor: own.rankInMajor ?? null,
          totalInMajor: own.totalInMajor ?? null,
          major: own.major ?? null,
          scholarshipStatus: own.scholarshipStatus ?? null,
        });
        return;
      }

      const ownRanking = isCurrentSemester
        ? await fetchCloudflareOwnRanking(semesterId).catch(() => null)
        : null;
      const legacyOwn = ownRanking && !('rankingMode' in ownRanking)
        ? ownRanking : null;
      const rows = await forecastCloudflareRankings({
        semesters: [semesterId],
        ...normalizeInputs({
          gpa: myGpa,
          credits: myCredits,
          trainingScore: myTrainingScore,
        }),
        major: legacyOwn?.major || context?.major || null,
      });
      const forecast = rows[0];
      const rank = finiteNumber(legacyOwn?.studentRank) ?? finiteNumber(forecast?.rank);
      const totalStudents = finiteNumber(legacyOwn?.totalStudents) ??
        finiteNumber(forecast?.totalStudents);

      if (!rank || !totalStudents) {
        throw new Error('Invalid ranking response');
      }

      setResult({
        rank,
        totalStudents,
        topPercent: (rank / totalStudents) * 100,
        semesterId,
        rankingMode: 'forecast',
        found: true,
        rankInClass: legacyOwn?.rankInClass ?? null,
        totalInClass: legacyOwn?.totalInClass ?? null,
        classCode: legacyOwn?.classCode ?? context?.classCode ?? null,
        rankInMajor: legacyOwn?.rankInMajor ?? forecast?.rankInMajor ?? null,
        totalInMajor: legacyOwn?.totalInMajor ?? forecast?.totalInMajor ?? null,
        major: legacyOwn?.major ?? forecast?.major ?? context?.major ?? null,
      });
    } catch {
      setError('Lỗi kết nối máy chủ xếp hạng.');
    } finally {
      setLoading(false);
    }
  }, [semesterModes]);

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
    semesterModes,
    loadingSemesters,
    prepareSemesterRanks,
    resetSemesterRanks,
    semesterRanks,
    loadingSemesterRanks,
  };
};
