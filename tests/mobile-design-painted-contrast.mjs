import { designMeasurements as designMeasurementsForReveal } from './mobile-design-measurements.mjs';
// Resolve gradients, images and backdrop compositing from the browser's painted
// background. Hide glyph fill only: geometry and currentColor backgrounds stay
// intact. PNG decoding uses the browser's canvas, with no new dependency.
export async function paintedContrast(page, measurements, reveal = true, deep = false) {
  const candidates = measurements.text.filter(t => t.contrast.status === 'VISUAL_REVIEW_REQUIRED' && t.x < measurements.viewport[0] && t.x + t.width > 0 && t.y < measurements.viewport[1] && t.y + t.height > 0);
  if (!candidates.length && !deep) return;
  const data = await page.evaluate(indices => {
    const visible = element => {
      const style = getComputedStyle(element),
        box = element.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[aria-hidden="true"],.sr-only');
    };
    const fixed = [...document.querySelectorAll('body *')].filter(other => ['fixed', 'sticky'].includes(getComputedStyle(other).position)).map(other => ({
      other,
      box: other.getBoundingClientRect()
    }));
    window.__task10PaintStyles = [];
    return indices.map(index => {
      const element = document.querySelector(`[data-design-measure-id="${index}"]`);
      if (!element) throw new Error(`Measured element ${index} was replaced; retry after rendering settles`);
      const style = getComputedStyle(element),
        rects = [];
      const occluders = fixed.filter(({
        other,
        box
      }) => {
        if (other.contains(element) || element.contains(other)) return false;
        const target = element.getBoundingClientRect();
        const x = (Math.max(box.left, target.left, 0) + Math.min(box.right, target.right, innerWidth)) / 2;
        const y = (Math.max(box.top, target.top, 0) + Math.min(box.bottom, target.bottom, innerHeight)) / 2;
        if (box.right <= target.left || box.left >= target.right || box.bottom <= target.top || box.top >= target.bottom) return false;
        const stack = document.elementsFromPoint(x, y);
        const front = stack.findIndex(hit => other.contains(hit));
        const behind = stack.findIndex(hit => element.contains(hit));
        return front >= 0 && (behind < 0 || front < behind);
      }).map(({
        box: r
      }) => ({
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom
      }));
      let opacity = 1;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity);
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          let x = Math.max(0, r.x),
            y = Math.max(0, r.y);
          let right = Math.min(innerWidth, r.right),
            bottom = Math.min(innerHeight, r.bottom);
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const cs = getComputedStyle(ancestor),
              box = ancestor.getBoundingClientRect();
            if (['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX)) {
              x = Math.max(x, box.left);
              right = Math.min(right, box.right);
            }
            if (['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowY)) {
              y = Math.max(y, box.top);
              bottom = Math.min(bottom, box.bottom);
            }
          }
          if (right > x && bottom > y) rects.push({
            x,
            y,
            width: right - x,
            height: bottom - y
          });
        }
      }
      // SVG text ranges may be empty although the glyph has a real screen box.
      // The before/hidden-text pixel difference still selects only painted ink.
      if (!rects.length && element instanceof SVGElement) {
        const r = element.getBoundingClientRect(),
          svg = element.closest('svg')?.getBoundingClientRect();
        const x = Math.max(0, r.left, svg?.left ?? 0),
          y = Math.max(0, r.top, svg?.top ?? 0);
        const right = Math.min(innerWidth, r.right, svg?.right ?? innerWidth),
          bottom = Math.min(innerHeight, r.bottom, svg?.bottom ?? innerHeight);
        if (right > x && bottom > y) rects.push({
          x,
          y,
          width: right - x,
          height: bottom - y
        });
      }
      const record = {
        index,
        foreground: element instanceof SVGElement ? style.fill : style.color,
        opacity,
        rects,
        occluders,
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        disabled: !!element.closest(':disabled,[aria-disabled="true"]')
      };
      window.__task10PaintStyles.push({
        element,
        style: element.getAttribute('style')
      });
      return record;
    });
  }, candidates.map(t => t.index));
  let png;
  const original = (await page.screenshot({
    scale: 'css'
  })).toString('base64');
  try {
    await page.evaluate(() => {
      for (const {
        element
      } of window.__task10PaintStyles) {
        element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        if (element instanceof SVGElement) element.style.setProperty('fill', 'transparent', 'important');
        element.style.setProperty('text-shadow', 'none', 'important');
        element.style.setProperty('text-decoration-color', 'transparent', 'important');
      }
    });
    await page.evaluate(() => {
      void document.body.offsetHeight;
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    png = (await page.screenshot({
      scale: 'css'
    })).toString('base64');
  } finally {
    await page.evaluate(() => {
      for (const {
        element,
        style
      } of window.__task10PaintStyles) {
        if (style === null) element.removeAttribute('style');else element.setAttribute('style', style);
      }
      delete window.__task10PaintStyles;
    });
  }
  const results = await page.evaluate(async ({
    png,
    original,
    data
  }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const originalImage = new Image();
    originalImage.src = `data:image/png;base64,${original}`;
    await originalImage.decode();
    if (originalImage.width !== canvas.width || originalImage.height !== canvas.height) throw new Error('Viewport changed during contrast sampling');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);
    const originalPixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const color = colorCanvas.getContext('2d', {
      willReadFrequently: true
    });
    const luminance = rgb => rgb.map(v => v / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return data.map(item => {
      if (item.disabled) return {
        index: item.index,
        status: 'INACTIVE_EXCEPTION',
        method: 'painted'
      };
      // Group opacity is not equivalent to foreground alpha compositing. Keep
      // that case unresolved rather than report a mathematically invalid PASS.
      if (item.opacity < 1 || !item.rects.length) return {
        index: item.index,
        status: 'VISUAL_REVIEW_REQUIRED',
        reason: 'group opacity or outside viewport',
        opacity: item.opacity,
        rectCount: item.rects.length
      };
      color.clearRect(0, 0, 1, 1);
      color.fillStyle = item.foreground;
      color.fillRect(0, 0, 1, 1);
      const fg = color.getImageData(0, 0, 1, 1).data;
      let minimum = Infinity,
        samples = 0,
        visiblePixels = 0,
        worst = null;
      for (const r of item.rects) for (let y = Math.ceil(r.y); y < Math.floor(r.y + r.height); y += 2) {
        for (let x = Math.ceil(r.x); x < Math.floor(r.x + r.width); x += 2) {
          if (item.occluders.some(r => x >= r.x && x < r.right && y >= r.y && y < r.bottom)) continue;
          const offset = (y * canvas.width + x) * 4,
            bg = [...pixels.slice(offset, offset + 3)];
          visiblePixels++;
          // Sample ink, not the whitespace/corners of a Range bounding box.
          if (bg.reduce((sum, v, i) => sum + Math.abs(v - originalPixels[offset + i]), 0) < 12) continue;
          const ink = bg.map((v, i) => fg[i] * fg[3] / 255 + v * (1 - fg[3] / 255));
          const a = luminance(ink),
            b = luminance(bg);
          const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          if (ratio < minimum) {
            minimum = ratio;
            worst = {
              x,
              y,
              background: bg,
              ink
            };
          }
          samples++;
        }
      }
      const threshold = item.size >= 24 || item.size >= 18.6667 && item.weight >= 700 ? 3 : 4.5;
      if (!samples) return {
        index: item.index,
        status: visiblePixels ? 'VISUAL_REVIEW_REQUIRED' : 'OCCLUDED_SCROLL_CONTENT',
        reason: visiblePixels ? 'No visible ink difference; inspect invisibility or occlusion' : 'covered scroll content',
        method: 'painted',
        occluders: item.occluders
      };
      return {
        index: item.index,
        status: minimum >= threshold ? 'PASS' : 'FAIL',
        ratio: minimum,
        minimum: threshold,
        method: 'painted',
        samples,
        worst
      };
    });
  }, {
    png,
    original,
    data
  });
  for (const result of results) measurements.text[result.index].contrast = result;
  // A fixed navigation/shadow can cover the edge of scrollable content. Reveal
  // the same DOM node and re-measure it; never call an unknown background PASS.
  const failures = deep ? measurements.text.filter(t => ['FAIL', 'VISUAL_REVIEW_REQUIRED', 'OCCLUDED_SCROLL_CONTENT'].includes(t.contrast.status) && !/^[•·|—–\-:]$/.test(t.text)).map(t => ({
    index: t.index
  })) : results.filter(r => r.status === 'FAIL');
  if (reveal && failures.length) {
    await page.evaluate(indices => {
      window.__task10ContrastTargets = new Map(indices.map(i => [i, document.querySelector(`[data-design-measure-id="${i}"]`)]));
      window.__task10ContrastScroll = {
        x: scrollX,
        y: scrollY,
        roots: [...document.querySelectorAll('body *')].filter(e => e.scrollTop || e.scrollLeft || ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)).map(e => ({
          e,
          x: e.scrollLeft,
          y: e.scrollTop
        }))
      };
    }, failures.map(r => r.index));
    try {
      for (const result of failures) {
        await page.evaluate(index => window.__task10ContrastTargets.get(index)?.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'instant'
        }), result.index);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const next = await page.evaluate(designMeasurementsForReveal);
        const index = await page.evaluate(i => Number(window.__task10ContrastTargets.get(i)?.getAttribute('data-design-measure-id')), result.index);
        await paintedContrast(page, next, false);
        const proof = next.text.find(t => t.index === index);
        if (proof && ['PASS', 'FAIL', 'INACTIVE_EXCEPTION'].includes(proof.contrast.status) && proof.text === measurements.text[result.index].text) measurements.text[result.index].contrast = {
          ...proof.contrast,
          revealedByScroll: true,
          revealedAt: {
            x: proof.x,
            y: proof.y
          }
        };
      }
    } finally {
      await page.evaluate(() => {
        const s = window.__task10ContrastScroll;
        for (const {
          e,
          x,
          y
        } of s.roots) e.scrollTo({
          left: x,
          top: y,
          behavior: 'instant'
        });
        window.scrollTo({
          left: s.x,
          top: s.y,
          behavior: 'instant'
        });
        delete window.__task10ContrastTargets;
        delete window.__task10ContrastScroll;
      });
    }
  }
}
