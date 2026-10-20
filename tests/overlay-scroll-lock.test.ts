import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { acquireOverlayScrollLock } from '../utils/overlayScrollLock.ts';

class Style {
  values = new Map<string, [string, string]>();
  setProperty(key: string, value: string, priority = '') { this.values.set(key, [value, priority]); }
  getPropertyValue(key: string) { return this.values.get(key)?.[0] || ''; }
  getPropertyPriority(key: string) { return this.values.get(key)?.[1] || ''; }
  removeProperty(key: string) { this.values.delete(key); }
}
class ElementStub {
  style = new Style();
  isConnected = true;
  scrollLeft = 7;
  scrollTop = 640;
  clientWidth = 390;
  offsetWidth = 390;
  scrollHeight = 3000;
  contains(target: unknown) { return target === this; }
  scrollTo({ left, top }: { left: number; top: number }) { this.scrollLeft = left; this.scrollTop = top; }
}

function environment(ios = false, internal = false) {
  const html = new ElementStub(), body = new ElementStub(), main = new ElementStub();
  const events = new Map<string, EventListener>();
  const win = { scrollX: 7, scrollY: 640, innerWidth: 390, innerHeight: 740,
    scrollTo({ left, top }: { left: number; top: number }) { this.scrollX = left; this.scrollY = top; } };
  const doc = { documentElement: html, body, scrollingElement: internal ? { scrollHeight: 740 } : html,
    querySelectorAll: () => [main], addEventListener: (name: string, handler: EventListener) => events.set(name, handler),
    removeEventListener: (name: string) => events.delete(name) };
  if (internal) { win.scrollX = 0; win.scrollY = 0; }
  const globals = { document: doc, window: win, navigator: { userAgent: ios ? 'iPhone Safari' : 'Chrome', platform: 'Win32', maxTouchPoints: 0 },
    getComputedStyle: (element: ElementStub) => ({ zIndex: '100', paddingRight: '4px', borderLeftWidth: '0px', borderRightWidth: '0px', scrollbarGutter: 'auto', overflowX: element.style.getPropertyValue('overflow-x'), overflowY: element.style.getPropertyValue('overflow-y') }) };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { html, body, main, events, win,
    restore() { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}

test('owners retain the lock until last release and restore priorities, scroll and unrelated styles', () => {
  const env = environment(true);
  env.body.style.setProperty('position', 'static', 'important');
  env.body.style.setProperty('overflow-y', 'auto', 'important');
  env.html.style.setProperty('scroll-behavior', 'smooth');
  let a = () => {}, b = () => {};
  try {
    a = acquireOverlayScrollLock(new ElementStub() as unknown as HTMLElement);
    b = acquireOverlayScrollLock(new ElementStub() as unknown as HTMLElement);
    assert.equal(env.body.style.getPropertyValue('position'), 'fixed');
    assert.equal(env.body.style.getPropertyValue('top'), '-640px');
    assert.equal(env.main.style.getPropertyValue('overflow-y'), 'hidden');
    env.body.style.setProperty('color', 'red');
    env.main.scrollTop = 0;
    env.win.scrollY = 0;
    a(); a();
    assert.equal(env.body.style.getPropertyValue('overflow-y'), 'hidden');
    assert.ok(env.events.size);
    b();
    assert.equal(env.body.style.getPropertyValue('position'), 'static');
    assert.equal(env.body.style.getPropertyPriority('position'), 'important');
    assert.equal(env.body.style.getPropertyValue('overflow-y'), 'auto');
    assert.equal(env.body.style.getPropertyPriority('overflow-y'), 'important');
    assert.equal(env.body.style.getPropertyValue('top'), '');
    assert.equal(env.body.style.getPropertyValue('color'), 'red');
    assert.equal(env.html.style.getPropertyValue('scroll-behavior'), 'smooth');
    assert.equal(env.main.scrollTop, 640);
    assert.equal(env.win.scrollY, 640);
    assert.equal(env.win.scrollX, 7);
    assert.equal(env.events.size, 0);
  } finally { a(); b(); env.restore(); }
});

test('internal iOS scroller locks without fixing body; acquire/release cycles are idempotent', () => {
  const env = environment(true, true);
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const release = acquireOverlayScrollLock(new ElementStub() as unknown as HTMLElement);
      try {
        assert.equal(env.body.style.getPropertyValue('position'), '');
        assert.equal(env.main.style.getPropertyValue('overflow-y'), 'hidden');
      } finally { release(); release(); }
      assert.equal(env.events.size, 0);
      assert.equal(env.main.style.getPropertyValue('overflow-y'), '');
    }
  } finally { env.restore(); }
});

test('desktop compensates scrollbar once and preserves existing padding', () => {
  const env = environment();
  env.win.innerWidth = 405;
  env.body.style.setProperty('padding-right', '4px');
  env.main.offsetWidth = 405;
  env.main.style.setProperty('padding-right', '4px');
  let release = () => {};
  try {
    release = acquireOverlayScrollLock(new ElementStub() as unknown as HTMLElement);
    assert.equal(env.body.style.getPropertyValue('position'), '');
    assert.equal(env.body.style.getPropertyValue('padding-right'), 'calc(4px + 15px)');
    assert.equal(env.main.style.getPropertyValue('padding-right'), 'calc(4px + 15px)');
    release();
    assert.equal(env.body.style.getPropertyValue('padding-right'), '4px');
    assert.equal(env.main.style.getPropertyValue('padding-right'), '4px');
  } finally { release(); env.restore(); }
});

test('previous competing overflow implementations are removed and both shell scroll roots are registered', () => {
  for (const file of ['components/SchoolAnnouncements.jsx', 'components/DrlScoreGuide.tsx', 'components/UserGuideModal.tsx', 'components/SubjectRankingModal.tsx', 'components/event-filters/EventFilterControls.tsx', 'layouts/DesktopLayout.tsx', 'features/scholarships/ScholarshipShell.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /document\.body\.style\.overflow/);
    assert.match(source, /Overlay|useOverlayScrollLock/);
  }
  for (const file of ['layouts/MobileAppLayout.tsx', 'layouts/DesktopLayout.tsx']) assert.match(readFileSync(file, 'utf8'), /data-overlay-scroll-root/);
});
