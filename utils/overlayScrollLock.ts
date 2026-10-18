/** One owner per mounted overlay. All background styles belong to the first/last owner. */
const owners = new Map<symbol, HTMLElement>();
let releaseBackground: (() => void) | undefined;

type Restore = () => void;

function setStyles(element: HTMLElement, values: Record<string, string>): Restore {
  const original = Object.keys(values).map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
  for (const [property, value] of Object.entries(values)) element.style.setProperty(property, value, 'important');
  return () => {
    for (const [property, value, priority] of original) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
  };
}

function topOverlay() {
  let top: HTMLElement | undefined;
  let highest = -Infinity;
  for (const element of owners.values()) {
    const zIndex = Number.parseInt(getComputedStyle(element).zIndex, 10) || 0;
    if (element.isConnected && zIndex >= highest) { top = element; highest = zIndex; }
  }
  return top;
}

/** Allow a gesture only if a scrollable ancestor inside this overlay can consume it. */
function canScroll(target: EventTarget | null, root: HTMLElement, dx: number, dy: number) {
  const horizontal = Math.abs(dx) > Math.abs(dy);
  for (let element = target instanceof Element ? target : null; element && root.contains(element); element = element.parentElement) {
    const style = getComputedStyle(element);
    const overflow = horizontal ? style.overflowX : style.overflowY;
    const position = horizontal ? element.scrollLeft : element.scrollTop;
    const limit = horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
    const delta = horizontal ? dx : dy;
    if (/(auto|scroll)/.test(overflow) && limit > 0 && (delta < 0 ? position > 0 : position < limit - 1)) return true;
    if (element === root) break;
  }
  return false;
}

function guardGestures(): Restore {
  let point: { x: number; y: number } | undefined;
  const start = (event: TouchEvent) => {
    point = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
  };
  const move = (event: TouchEvent) => {
    if (!point || event.touches.length !== 1) return; // Preserve pinch zoom and native picker taps.
    const touch = event.touches[0];
    const dx = point.x - touch.clientX, dy = point.y - touch.clientY;
    point = { x: touch.clientX, y: touch.clientY };
    const root = topOverlay();
    // Range controls consume horizontal drags natively, even without a scrollable ancestor.
    if (root && Math.abs(dx) > Math.abs(dy) && event.target instanceof Element && root.contains(event.target) && event.target.closest('input[type="range"]')) return;
    if (root && !canScroll(event.target, root, dx, dy) && event.cancelable) event.preventDefault();
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;
    const root = topOverlay();
    if (root && !canScroll(event.target, root, event.deltaX, event.deltaY) && event.cancelable) event.preventDefault();
  };
  const key = (event: KeyboardEvent) => {
    const root = topOverlay();
    if (root && event.target instanceof Node && !root.contains(event.target) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) event.preventDefault();
  };
  document.addEventListener('touchstart', start, { capture: true, passive: true });
  document.addEventListener('touchmove', move, { capture: true, passive: false });
  document.addEventListener('wheel', wheel, { capture: true, passive: false });
  document.addEventListener('keydown', key, true);
  return () => {
    document.removeEventListener('touchstart', start, true);
    document.removeEventListener('touchmove', move, true);
    document.removeEventListener('wheel', wheel, true);
    document.removeEventListener('keydown', key, true);
  };
}

function lockBackground(): Restore {
  const html = document.documentElement, body = document.body;
  const x = window.scrollX, y = window.scrollY;
  const isIOS = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const documentScrolls = (document.scrollingElement?.scrollHeight || 0) > window.innerHeight || x !== 0 || y !== 0;
  // Browser-mode CSS deliberately uses !important overflow:auto and position:static.
  // Snapshot individual properties (including priority), never replace the entire style attribute.
  const background = Array.from(document.querySelectorAll<HTMLElement>('[data-overlay-scroll-root]'))
    .filter(element => !Array.from(owners.values()).some(root => element.contains(root) || root.contains(element)))
    .map(element => {
      const left = element.scrollLeft, top = element.scrollTop;
      const style = getComputedStyle(element);
      const gap = style.scrollbarGutter?.includes('stable') ? 0 : Math.max(0, element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth));
      const values: Record<string, string> = { 'overflow-x': 'hidden', 'overflow-y': 'hidden', 'overscroll-behavior-x': 'none', 'overscroll-behavior-y': 'none' };
      if (gap) values['padding-right'] = `calc(${style.paddingRight} + ${gap}px)`;
      const restore = setStyles(element, values);
      return () => { restore(); element.scrollTo({ left, top, behavior: 'instant' }); };
    });
  const gap = getComputedStyle(html).scrollbarGutter?.includes('stable') ? 0 : Math.max(0, window.innerWidth - html.clientWidth);
  const paddingRight = getComputedStyle(body).paddingRight;
  const restoreHtml = setStyles(html, { 'overflow-x': 'hidden', 'overflow-y': 'hidden', 'overscroll-behavior-x': 'none', 'overscroll-behavior-y': 'none', 'scroll-behavior': 'auto' });
  const bodyStyles: Record<string, string> = { 'overflow-x': 'hidden', 'overflow-y': 'hidden', 'overscroll-behavior-x': 'none', 'overscroll-behavior-y': 'none' };
  if (gap) bodyStyles['padding-right'] = `calc(${paddingRight} + ${gap}px)`;
  // iOS document scrolling needs a fixed body; internal scrollers and other browsers do not.
  if (isIOS && documentScrolls) Object.assign(bodyStyles, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%' });
  const restoreBody = setStyles(body, bodyStyles);
  const removeGuards = guardGestures();
  return () => {
    removeGuards();
    restoreBody();
    // Restore before re-enabling smooth scrolling; route scroll effects run after layout cleanup.
    for (const restore of background) restore();
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    restoreHtml();
  };
}

export function acquireOverlayScrollLock(element: HTMLElement): Restore {
  const owner = Symbol('overlay');
  owners.set(owner, element);
  if (owners.size === 1) releaseBackground = lockBackground();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners.delete(owner);
    if (!owners.size) { releaseBackground?.(); releaseBackground = undefined; }
  };
}
