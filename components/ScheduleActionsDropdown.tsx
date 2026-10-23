import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BookPlus, CalendarDays, ChevronDown, FileUp, List, Loader2 } from 'lucide-react';
import './schedule-actions.css';

interface Props {
  isAuthenticated: boolean;
  hasCourses: boolean;
  isProcessingPdf: boolean;
  actionActive: boolean;
  onExport: () => void;
  onReport: () => void;
  onRequest: () => void;
  onImport: () => void;
}

/** Presentation only: each schedule surface retains its existing forms and handlers. */
export function ScheduleActionsDropdown({ isAuthenticated, hasCourses, isProcessingPdf, actionActive, onExport, onReport, onRequest, onImport }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const lastOnOpen = useRef(false);
  const actionLaunched = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const actions = [
    { label: 'Thêm vào lịch', icon: CalendarDays, disabled: !isAuthenticated || !hasCourses, run: onExport },
    { label: 'Báo lỗi môn', icon: AlertTriangle, disabled: !isAuthenticated, run: onReport },
    { label: 'Yêu cầu thêm môn', icon: BookPlus, disabled: !isAuthenticated, run: onRequest },
    { label: 'Nhập PDF', icon: isProcessingPdf ? Loader2 : FileUp, disabled: !isAuthenticated || isProcessingPdf, run: onImport },
  ];
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  useLayoutEffect(() => {
    if (actionActive) {
      setOpen(false);
    } else if (actionLaunched.current) {
      setOpen(false);
      actionLaunched.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [actionActive, isProcessingPdf]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const style = menu.current && getComputedStyle(menu.current);
      const safe = (edge: string) => Math.max(12, parseFloat(style?.getPropertyValue(`--actions-safe-${edge}`) || '0') || 0);
      const leftEdge = (viewport?.offsetLeft ?? 0) + safe('left');
      const topEdge = (viewport?.offsetTop ?? 0) + safe('top');
      const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - safe('right');
      const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - safe('bottom');
      if (rect.bottom < topEdge || rect.top > bottomEdge) {
        setOpen(false);
        return;
      }
      const width = Math.min(252, rightEdge - leftEdge);
      const below = Math.max(0, bottomEdge - rect.bottom - 6);
      const above = Math.max(0, rect.top - topEdge - 6);
      const desiredHeight = menu.current?.scrollHeight ?? 200;
      const placeBelow = below >= desiredHeight || below >= above;
      const maxHeight = Math.max(0, placeBelow ? below : above);
      const height = Math.min(desiredHeight, maxHeight);
      setPosition({
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)),
        top: placeBelow ? rect.bottom + 6 : rect.top - 6 - height,
        width, maxHeight,
      });
    };
    update();
    // Focus without scrolling the toolbar or the page behind the menu.
    const focusFrame = requestAnimationFrame(() => {
      const enabled = items();
      (lastOnOpen.current ? enabled.at(-1) : enabled[0])?.focus({ preventScroll: true });
      if (!enabled.length) menu.current?.focus({ preventScroll: true });
    });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', focusOutside);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', focusOutside);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === 'Tab') {
      // Put Tab back into the trigger's DOM order rather than the body portal.
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const enabled = items();
      const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      enabled[index]?.focus({ preventScroll: true });
    }
  };

  return <div className="schedule-actions">
    <button ref={trigger} type="button" className="schedule-actions-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => { lastOnOpen.current = false; setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); lastOnOpen.current = event.key === 'ArrowUp'; setOpen(true);
        } else if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
      }}>
      <List size={17} aria-hidden="true" /> Thao tác <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" tabIndex={-1} aria-label="Thao tác thời khóa biểu" className="schedule-actions-menu" style={position} onKeyDown={onMenuKey}>
      {actions.map(({ label, icon: Icon, disabled, run }) => <button key={label} type="button" role="menuitem" tabIndex={-1} disabled={disabled} aria-disabled={disabled}
        onClick={() => { if (!disabled) { actionLaunched.current = true; close(true); run(); } }}>
        <Icon size={18} aria-hidden="true" className={label === 'Nhập PDF' && isProcessingPdf ? 'animate-spin' : ''} />
        <span>{label}</span>
      </button>)}
    </div>, document.body)}
  </div>;
}
