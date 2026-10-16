import { useEffect, useState } from 'react';
import { adminError, checkedAdminPage } from '../../utils/scholarshipAdminModel';

export function useScholarshipAdminPage<T extends {total: number; page: number; limit: number}>(
  scope: string, enabled: boolean, fetchPage: (page: number, signal: AbortSignal) => Promise<T>,
) {
  const [position, setPosition] = useState({scope, page: 1});
  const page = position.scope === scope ? position.page : 1;
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{key: string; data?: T; error?: string}>({key: ''});
  const key = `${scope}:${page}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) {
      setResult({key});
      fetchPage(page, controller.signal).then(value => {
        if (controller.signal.aborted) return;
        const data = checkedAdminPage(value, page);
        const last = Math.max(1, Math.ceil(data.total / data.limit));
        if (page > last) { setPosition({scope, page: last}); return; }
        setResult({key, data});
      }).catch(error => { if (!controller.signal.aborted) setResult({key, error: adminError(error)}); });
    }
    return () => controller.abort();
  }, [key, enabled, fetchPage]);
  const current = enabled && result.key === key;
  return {page, data: current ? result.data : undefined, error: current ? result.error : undefined,
    loading: enabled && (!current || (!result.data && !result.error)),
    setPage: (page: number) => setPosition({scope, page}), reload: () => setVersion(value => value + 1)};
}
