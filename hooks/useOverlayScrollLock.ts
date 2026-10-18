import { useLayoutEffect, type RefObject } from 'react';
import { acquireOverlayScrollLock } from '../utils/overlayScrollLock';

/** The ref must point to an overlay outside every background scroll root. */
export function useOverlayScrollLock(ref: RefObject<HTMLElement | null>, active = true) {
  useLayoutEffect(() => {
    if (active && ref.current) return acquireOverlayScrollLock(ref.current);
  }, [active, ref]);
}
