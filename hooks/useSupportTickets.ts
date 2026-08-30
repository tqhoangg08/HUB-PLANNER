import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSupportTicketPage,
  fetchSupportTickets,
  SupportTicket,
  TicketFilters,
} from '../utils/supportTicketsApi';

export const useSupportTickets = (filters: TicketFilters = {}) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const reloadTimerRef = useRef<number | null>(null);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (filters.pageSize) {
        const result = await fetchSupportTicketPage(filters);
        setTickets(result.tickets);
        setTotal(result.total);
      } else {
        const nextTickets = await fetchSupportTickets(filters);
        setTickets(nextTickets);
        setTotal(nextTickets.length);
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải danh sách ticket.');
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const scheduleReload = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void reload();
      }, 900);
    };

    const intervalId = window.setInterval(scheduleReload, 30_000);

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      window.clearInterval(intervalId);
    };
  }, [filterKey, reload]);

  return { tickets, total, loading, error, reload, setTickets };
};
