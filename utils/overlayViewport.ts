/** Match a modal to the visible area while preserving its existing preferred panel size. */
export function attachOverlayViewport(element: HTMLElement | null) {
  const viewport = window.visualViewport;
  if (!element) return;
  const padding = getComputedStyle(element);
  element.style.paddingTop = `max(${padding.paddingTop}, env(safe-area-inset-top, 0px))`;
  element.style.paddingBottom = `max(${padding.paddingBottom}, env(safe-area-inset-bottom, 0px))`;
  element.style.paddingLeft = `max(${padding.paddingLeft}, env(safe-area-inset-left, 0px))`;
  element.style.paddingRight = `max(${padding.paddingRight}, env(safe-area-inset-right, 0px))`;
  const panels = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'BUTTON');
  const originalMax = panels.map(panel => [panel.style.getPropertyValue('max-height'), panel.style.getPropertyPriority('max-height')]);
  const originalOverflow = panels.map(panel => [panel.style.getPropertyValue('overflow-y'), panel.style.getPropertyPriority('overflow-y')]);
  const originalPosition = panels.map(panel => [panel.style.getPropertyValue('position'), panel.style.getPropertyPriority('position')]);
  panels.forEach(panel => {
    // Contain absolutely positioned descendants (including sr-only table heads)
    // within the panel's clipping/scrolling box rather than the outer backdrop.
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    if (getComputedStyle(panel).overflowY === 'visible') panel.style.overflowY = 'auto';
  });
  const update = () => {
    // VisualViewport already reports CSS pixels, including keyboard and input auto-zoom.
    // Follow its geometry without changing the browser's native scale or moving on blur.
    const height = viewport?.height ?? window.innerHeight;
    element.style.setProperty('--overlay-height', `${height}px`);
    element.style.setProperty('--overlay-top', viewport ? `${viewport.offsetTop}px` : '0px');
    const style = getComputedStyle(element);
    // WebKit can report the previous clientHeight during the resize callback.
    // Use the same viewport measurement for the wrapper and its panel cap.
    const available = Math.max(0, height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth));
    panels.forEach((panel, index) => {
      const [value, priority] = originalMax[index];
      if (value) panel.style.setProperty('max-height', value, priority);
      else panel.style.removeProperty('max-height');
      const preferred = getComputedStyle(panel).maxHeight;
      panel.style.setProperty('max-height', preferred === 'none' ? `${available}px` : `min(${preferred}, ${available}px)`, 'important');
    });
  };
  update();
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return () => {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    panels.forEach((panel, index) => {
      const [value, priority] = originalMax[index];
      if (value) panel.style.setProperty('max-height', value, priority);
      else panel.style.removeProperty('max-height');
      const [overflow, overflowPriority] = originalOverflow[index];
      if (overflow) panel.style.setProperty('overflow-y', overflow, overflowPriority);
      else panel.style.removeProperty('overflow-y');
      const [position, positionPriority] = originalPosition[index];
      if (position) panel.style.setProperty('position', position, positionPriority);
      else panel.style.removeProperty('position');
    });
  };
}
