import React, { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  closeCalendarImportGuide,
  getCalendarImportGuideSnapshot,
  restoreCalendarImportGuide,
  subscribeCalendarImportGuide,
} from '../utils/calendarImportGuideState';
import { CalendarImportGuideDialog } from './CalendarImportGuideDialog';

export const CalendarImportGuideHost: React.FC = () => {
  const guide = useSyncExternalStore(subscribeCalendarImportGuide, getCalendarImportGuideSnapshot);
  useEffect(() => { restoreCalendarImportGuide(); }, []);
  if (!guide) return null;
  return createPortal(
    <CalendarImportGuideDialog eventCount={guide.eventCount} onClose={closeCalendarImportGuide} />,
    document.body,
  );
};
