// Runs inside the page, against actual rendered components (no copied modal UI).
export function designMeasurements() {
  // One synchronous layout snapshot: avoid re-reading the same ancestor styles
  // for every label, while preserving actual computed cascade/geometry.
  const styles = new WeakMap(),
    boxes = new WeakMap();
  const cssOf = element => {
    if (!styles.has(element)) styles.set(element, getComputedStyle(element));
    return styles.get(element);
  };
  const boxOf = element => {
    if (!boxes.has(element)) boxes.set(element, element.getBoundingClientRect());
    return boxes.get(element);
  };
  const visible = element => {
    const style = cssOf(element),
      box = boxOf(element);
    return box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[aria-hidden="true"],.sr-only');
  };
  const geometry = element => {
    const {
      x,
      y,
      width,
      height
    } = boxOf(element);
    return {
      x,
      y,
      width,
      height
    };
  };
  const clipping = element => {
    const issues = [];
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = cssOf(parent),
            box = boxOf(parent);
          // Scrollable content is reachable by user interaction. Its clipping
          // boundary is tested separately by scrolling the region to its end.
          if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1)) issues.push(`horizontal clip at ${parent.tagName}.${parent.className}`);
          if (['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY)) break;
          if (['hidden', 'clip'].includes(style.overflowY) && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) issues.push(`vertical clip at ${parent.tagName}.${parent.className}: text ${rect.top}..${rect.bottom}, container ${box.top}..${box.bottom}`);
        }
      }
    }
    return [...new Set(issues)];
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', {
    willReadFrequently: true
  });
  function rgba(color) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }
  const over = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])).concat(1);
  const luminance = color => color.slice(0, 3).map(v => {
    const c = v / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = element => {
    const chain = [];
    for (let current = element; current; current = current.parentElement) chain.unshift(current);
    let background = [255, 255, 255, 1];
    for (const current of chain) {
      const style = cssOf(current);
      // A sibling scrim/image can paint behind the label. Ancestor background
      // colours alone cannot establish its contrast; do not manufacture a PASS.
      const target = boxOf(element);
      if ([...current.children].some(child => {
        if (child === element || child.contains(element)) return false;
        const sibling = cssOf(child),
          box = boxOf(child);
        return sibling.position === 'absolute' && (child.tagName === 'IMG' || sibling.backgroundImage !== 'none') && box.left < target.right && box.right > target.left && box.top < target.bottom && box.bottom > target.top;
      })) return {
        status: 'VISUAL_REVIEW_REQUIRED',
        reason: 'overlapping image/scrim'
      };
      if (style.backgroundImage !== 'none' || Number(style.opacity) < 1 || style.mixBlendMode !== 'normal' || style.backdropFilter !== 'none') {
        return {
          status: 'VISUAL_REVIEW_REQUIRED',
          reason: 'image/gradient, opacity or compositing'
        };
      }
      background = over(rgba(style.backgroundColor), background);
    }
    const style = cssOf(element),
      foreground = over(rgba(style.color), background);
    const a = luminance(foreground),
      b = luminance(background);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.6667 && Number(style.fontWeight) >= 700;
    const disabled = !!element.closest(':disabled,[aria-disabled="true"]');
    return {
      status: disabled ? 'INACTIVE_EXCEPTION' : ratio >= (large ? 3 : 4.5) ? 'PASS' : 'FAIL',
      ratio,
      minimum: large ? 3 : 4.5,
      foreground,
      background
    };
  };
  const roles = ['page-title', 'section-title', 'card-title', 'body', 'secondary', 'action', 'meta', 'input'];
  for (const element of document.querySelectorAll('[data-design-measure-id]')) element.removeAttribute('data-design-measure-id');
  const text = [...document.querySelectorAll('#root *,[data-overlay-root] *')].filter(element => visible(element) && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())).map((element, index) => {
    element.setAttribute('data-design-measure-id', String(index));
    const style = cssOf(element);
    const role = roles.find(role => element.classList.contains(`ui-${role}`));
    return {
      index,
      tag: element.tagName,
      text: element.textContent.trim().slice(0, 160),
      classes: element.className,
      role,
      size: parseFloat(style.fontSize),
      line: parseFloat(style.lineHeight),
      font: style.fontFamily,
      weight: style.fontWeight,
      color: style.color,
      background: style.backgroundColor,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      gap: style.gap,
      ...geometry(element),
      contrast: contrast(element),
      clamp: style.webkitLineClamp,
      nowrap: style.whiteSpace,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      clipping: clipping(element)
    };
  });
  const targets = [...document.querySelectorAll('#root button,#root a,#root input,#root select,#root textarea,[data-overlay-root] button')].filter(visible).map(element => ({
    tag: element.tagName,
    name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 100),
    classes: element.className,
    role: element.classList.contains('ui-action') ? 'action' : element.classList.contains('ui-input') ? 'input' : null,
    font: parseFloat(cssOf(element).fontSize),
    disabled: element.disabled || false,
    ...geometry(element)
  }));
  return {
    url: location.pathname + location.search,
    viewport: [innerWidth, innerHeight],
    shellHeader: (() => {
      const header = document.querySelector('.mobile-browser-header'),
        content = document.querySelector('.desktop-page-main');
      return header && content ? {
        header: geometry(header),
        content: geometry(content),
        fixed: cssOf(header).position === 'fixed'
      } : null;
    })(),
    layoutViewport: {
      clientWidth: document.documentElement.clientWidth,
      innerWidth,
      visualWidth: visualViewport?.width,
      scale: visualViewport?.scale
    },
    horizontalLeaks: [...document.querySelectorAll('#root *')].filter(e => {
      const r = boxOf(e);
      return r.width > 0 && r.left < innerWidth && r.right > innerWidth + 1 && r.top < innerHeight && r.bottom > 0;
    }).slice(0, 30).map(e => ({
      tag: e.tagName,
      classes: e.className,
      text: e.textContent.slice(0, 60),
      ...geometry(e)
    })),
    rootFont: parseFloat(cssOf(document.documentElement).fontSize),
    interLoaded: [...document.fonts].some(font => font.family.includes('Inter') && font.status === 'loaded'),
    floatingControls: [...document.querySelectorAll('.mobile-ai-advisor,.ui-floating-support-trigger')].filter(visible).map(geometry),
    scrollerGeometry: [...document.querySelectorAll('.mobile-main')].map(e => ({
      width: e.clientWidth,
      scrollWidth: e.scrollWidth,
      box: geometry(e)
    })),
    overflow: document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.mobile-main')].some(e => e.scrollWidth > e.clientWidth + 1),
    regions: [...document.querySelectorAll('.ui-card-space,.ui-page-gutter,.ui-section-inset,.ui-card-grid,.ui-section-gap,.ui-home-card,.ui-profile-facts')].filter(visible).map(e => ({
      classes: e.className,
      padding: [cssOf(e).paddingTop, cssOf(e).paddingRight, cssOf(e).paddingBottom, cssOf(e).paddingLeft].map(parseFloat),
      margin: [cssOf(e).marginLeft, cssOf(e).marginRight].map(parseFloat),
      gap: cssOf(e).gap,
      ...geometry(e)
    })),
    text,
    targets,
    scroll: {
      x: scrollX,
      y: scrollY,
      internal: document.querySelector('.mobile-main')?.scrollTop
    },
    tokens: Object.fromEntries(roles.map(role => [role, cssOf(document.documentElement).getPropertyValue(`--ui-font-${role.replace('-title', '')}`).trim()]))
  };
}
