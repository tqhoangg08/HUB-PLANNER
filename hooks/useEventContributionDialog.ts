import { useEffect, useId, useRef } from 'react';

/** Contribution-only focus behavior. Scroll ownership/viewport sizing stay in Overlay. */
export function useEventContributionDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.focus({ preventScroll: true });
    let frame = 0;
    const revealFocusedControl = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !dialog.contains(active)) return;
        const scroller = active.closest<HTMLElement>('[data-contribution-scroll]');
        if (!scroller || scroller === active) return;
        const bounds = scroller.getBoundingClientRect(), rect = active.getBoundingClientRect();
        // Move only this form's scroller after Overlay has applied its viewport cap.
        if (rect.top < bounds.top + 4) scroller.scrollTop -= bounds.top + 4 - rect.top;
        else if (rect.bottom > bounds.bottom - 4) scroller.scrollTop += rect.bottom - bounds.bottom + 4;
      });
    };
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (event.defaultPrevented || !(active instanceof HTMLElement) || active.closest('[role="dialog"]') !== dialog) return;
      if (event.key === 'Escape') {
        // Let native pickers consume/cancel Escape. Leave the control before
        // using Escape to dismiss the modal; nested confirmations own their keys.
        if (active.matches('input[type="date"], input[type="time"], select')) return;
        event.preventDefault(); close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(node => node.getClientRects().length && node.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('focusin', revealFocusedControl);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', revealFocusedControl);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', revealFocusedControl);
    viewport?.addEventListener('scroll', revealFocusedControl);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('focusin', revealFocusedControl);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', revealFocusedControl);
      viewport?.removeEventListener('resize', revealFocusedControl);
      viewport?.removeEventListener('scroll', revealFocusedControl);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen]);
  return { dialogRef, titleId };
}
