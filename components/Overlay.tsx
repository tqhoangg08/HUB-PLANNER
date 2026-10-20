import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { attachOverlayViewport } from '../utils/overlayViewport';
import './overlay.css';

/** A body portal keeps overlays outside transformed layouts and locked scroll containers.
 * Owns only scroll/viewport behavior: callers retain dismissal, focus, roles and z-index.
 */
export function Overlay({ className = '', children, ...props }: ComponentPropsWithoutRef<'div'>) {
  const root = useRef<HTMLDivElement>(null);
  useOverlayScrollLock(root);
  useLayoutEffect(() => {
    return attachOverlayViewport(root.current);
  }, []);
  const content = <div {...props} ref={root} data-overlay-root="" className={`overlay-root ${className}`}>{children}</div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
