import { supabase } from './supabase';

const totalStudentsCache = new Map<string, Promise<number | null>>();

export const getBenchmarkRankingTotal = (semesterId: string): Promise<number | null> => {
  const key = semesterId.trim();
  if (!key || !supabase) return Promise.resolve(null);

  const cached = totalStudentsCache.get(key);
  if (cached) return cached;

  const promise = supabase
    .from('benchmark_rankings')
    .select('*', { count: 'exact', head: true })
    .eq('semester', key)
    .then(({ count, error }) => {
      if (error) throw error;
      return count ?? null;
    })
    .catch((error) => {
      totalStudentsCache.delete(key);
      throw error;
    });

  totalStudentsCache.set(key, promise);
  return promise;
};
