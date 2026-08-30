import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSupportTicket,
  fetchTicketMessages,
  SupportTicket,
  SupportTicketMessage,
} from '../utils/supportTicketsApi';

export const useTicketMessages = (ticketId?: string) => {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(ticketId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!ticketId) return;

    setLoading(true);
    setError(null);
    try {
      const [nextTicket, nextMessages] = await Promise.all([
        fetchSupportTicket(ticketId),
        fetchTicketMessages(ticketId),
      ]);
      setTicket(nextTicket);
      setMessages(nextMessages);
      setHasOlder(nextMessages.length >= 50);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải nội dung ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const loadOlder = useCallback(async () => {
    if (!ticketId || loadingOlder || messages.length === 0 || !hasOlder) return;

    setLoadingOlder(true);
    try {
      const olderMessages = await fetchTicketMessages(ticketId, 50, messages[0].created_at);
      setMessages((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [
          ...olderMessages.filter((item) => !existingIds.has(item.id)),
          ...current,
        ];
      });
      setHasOlder(olderMessages.length >= 50);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải tin nhắn cũ hơn.');
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, messages, ticketId]);

  useEffect(() => {
    if (!ticketId) {
      setTicket(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    reload();
  }, [ticketId, reload]);

  useEffect(() => {
    if (!ticketId) return;

    const scheduleReload = (delay = 1000) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void reload();
      }, delay);
    };

    const intervalId = window.setInterval(() => scheduleReload(0), 15_000);

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      window.clearInterval(intervalId);
    };
  }, [ticketId, reload]);

  return { ticket, messages, loading, loadingOlder, hasOlder, error, reload, loadOlder, setMessages, setTicket };
};
