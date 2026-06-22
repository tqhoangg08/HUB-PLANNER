import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import {
  fetchSupportTickets,
  SupportTicket,
  TicketFilters,
} from '../utils/supportTicketsApi';

export const useSupportTickets = (filters: TicketFilters = {}) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextTickets = await fetchSupportTickets(filters);
      setTickets(nextTickets);
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

    const channel = supabase
      .channel(`support-tickets:${filterKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        scheduleReload();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, () => {
        scheduleReload();
      })
      .subscribe();

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [filterKey, reload]);

  return { tickets, loading, error, reload, setTickets };
};
