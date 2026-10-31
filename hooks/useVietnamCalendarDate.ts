import { useEffect, useState } from 'react';
import { millisecondsUntilVietnamMidnight, vietnamCalendarDate } from '../utils/schoolAnnouncementRecency';

export const useVietnamCalendarDate = (): string => {
  const [today, setToday] = useState(() => vietnamCalendarDate());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const now = Date.now();
      setToday(vietnamCalendarDate(now));
      timer = setTimeout(sync, millisecondsUntilVietnamMidnight(now));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return today;
};
