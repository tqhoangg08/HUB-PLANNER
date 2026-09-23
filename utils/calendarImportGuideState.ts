const STORAGE_KEY = 'hub-calendar-import-guide';
const MAX_AGE_MS = 10 * 60 * 1000;

interface PendingGuide {
  eventCount: number;
  createdAt: number;
}

const readStoredGuide = (): PendingGuide | null => {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as PendingGuide;
    if (Number.isSafeInteger(parsed.eventCount) && parsed.eventCount > 0
      && Number.isFinite(parsed.createdAt) && Date.now() - parsed.createdAt < MAX_AGE_MS) return parsed;
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled in private browsing; the in-memory guide still works.
  }
  return null;
};

let currentGuide: PendingGuide | null = null;
const listeners = new Set<() => void>();

export const getCalendarImportGuideSnapshot = () => currentGuide;
export const subscribeCalendarImportGuide = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const publish = (guide: PendingGuide | null) => {
  currentGuide = guide;
  for (const listener of listeners) listener();
};

export const restoreCalendarImportGuide = () => {
  const stored = readStoredGuide();
  if (stored) publish(stored);
};

export const openCalendarImportGuide = (eventCount: number) => {
  const guide = { eventCount, createdAt: Date.now() };
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(guide)); } catch { /* in-memory only */ }
  publish(guide);
};

export const closeCalendarImportGuide = () => {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* in-memory only */ }
  publish(null);
};
