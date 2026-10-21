import { useLayoutEffect, type RefObject } from 'react';
import { attachOverlayViewport } from '../utils/overlayViewport';

/** Drawer interaction only; scroll ownership stays with useOverlayScrollLock. */
export function useMobileSidebarDialog(
  rootRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
) {
  useLayoutEffect(() => {
    const root = rootRef.current, panel = panelRef.current;
    if (!active || !root || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const detachViewport = attachOverlayViewport(root);
    const layer = Number(getComputedStyle(root).zIndex) || 0;
    const higherOverlays = () => Array.from(document.querySelectorAll<HTMLElement>('.overlay-root, [data-overlay-root]'))
      .filter(element => element !== root && !root.contains(element) && Number(getComputedStyle(element).zIndex) > layer && element.getClientRects().length > 0);
    const inertBefore = new Map<HTMLElement, boolean>();
    const isolate = () => {
      const higher = higherOverlays();
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName) || child === root || child.contains(root)) continue;
        if (!inertBefore.has(child)) inertBefore.set(child, child.inert);
        child.inert = higher.some(overlay => child === overlay || child.contains(overlay)) ? inertBefore.get(child)! : true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(document.body, { childList: true });
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
    const focusFirst = () => (panel.querySelector<HTMLElement>('[data-sidebar-close]') || focusable()[0] || panel).focus({ preventScroll: true });
    focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (higherOverlays().length) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== 'Tab') return;
      // Safari's default tab policy can skip links. Own the sequence so reverse
      // tabbing cannot leave a drawer whose first control is a brand link.
      event.preventDefault();
      const elements = focusable(), index = elements.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      (elements[next] || panel).focus({ preventScroll: true });
    };
    const focusin = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node) && !higherOverlays().length) focusFirst();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusin);
      detachViewport?.();
      inertBefore.forEach((inert, element) => { element.inert = inert; });
      if (previous?.isConnected && !higherOverlays().length) previous.focus({ preventScroll: true });
    };
  }, [active, rootRef, panelRef, close]);
}
