import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export type AppPlatform = 'ios' | 'android';

const detectPlatform = (): AppPlatform => {
  if (typeof window === 'undefined') return 'android';

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const isIOSDevice = /iPhone|iPad|iPod/i.test(ua)
    || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  if (isIOSDevice) return 'ios';
  return 'android';
};

export const getForcedPlatform = (search: string): AppPlatform | null => {
  const forced = new URLSearchParams(search).get('platform');
  return forced === 'ios' || forced === 'android' ? forced : null;
};

export const usePlatform = (): AppPlatform => {
  const location = useLocation();

  const platform = useMemo<AppPlatform>(() => {
    return getForcedPlatform(location.search) || detectPlatform();
  }, [location.search]);

  useEffect(() => {
    const roots = [document.documentElement, document.body];
    roots.forEach(root => {
      root.classList.remove('platform-ios', 'platform-android');
      root.classList.add(`platform-${platform}`);
    });
  }, [platform]);

  return platform;
};
