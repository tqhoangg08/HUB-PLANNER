import React, { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Overlay } from '../components/Overlay';
import { DrlScoreGuideModal } from '../components/DrlScoreGuide';
import { EventFilterControls } from '../components/event-filters/EventFilterControls';
import { createDefaultEventFilters } from '../utils/eventFilters';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { fireOverlayAlert } from '../utils/overlayAlert';
import '../index.css';

const internal = new URLSearchParams(location.search).has('internal');
document.documentElement.classList.add(internal ? 'mobile-standalone' : 'mobile-browser');
document.body.style.setProperty('overflow-y', 'auto', 'important');
document.body.style.setProperty('color', 'rgb(12, 34, 56)');
document.documentElement.style.scrollBehavior = 'smooth';

function Fixture() {
  const [a, setA] = useState(false), [b, setB] = useState(false), [guide, setGuide] = useState(false);
  const [filters, setFilters] = useState(createDefaultEventFilters());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  useOverlayScrollLock(drawer, drawerOpen);
  return <>
    <div className={internal ? 'mobile-app-root flex h-[100dvh] flex-col overflow-hidden' : ''}>
    <main data-overlay-scroll-root className={internal ? 'mobile-main' : ''} style={internal ? { height: '100dvh', overflow: 'auto' } : {}}>
      <div style={{ height: 1800 }}>Background</div>
      <button id="open" onClick={() => setA(true)}>Open</button>
      <button id="open-guide" onClick={() => setGuide(true)}>Guide</button>
      <button id="open-drawer" onClick={() => setDrawerOpen(true)}>Drawer</button>
      <EventFilterControls filters={filters} onChange={setFilters} regions={['Trong trường']} eventTypes={['Tình nguyện']} onRefresh={() => {}} onOpenGuide={() => setGuide(true)} />
      <div style={{ height: 1800 }} />
    </main>
    </div>
    {a && <Overlay id="a" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={() => setA(false)}>
      <section role="dialog" aria-label="A" className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden bg-white" onClick={e => e.stopPropagation()}>
        <header className="shrink-0"><button id="close-a" onClick={() => setA(false)}>Close A</button><button id="open-b" onClick={() => setB(true)}>Open B</button><button id="alert" onClick={() => void fireOverlayAlert({ title: 'Nested alert', customClass: { container: 'hub-alert-container' } })}>Alert</button><button id="unmount" onClick={() => setA(false)}>Unmount</button><Link to="/next">Next route</Link></header>
        <div id="modal-scroll" className="flex-1 overflow-y-auto"><input id="range" type="range" aria-label="Target" /><div style={{ height: 1600 }}>Scrollable dialog</div><input aria-label="Notes" /><input type="date" aria-label="Date" /><button id="last">Last action</button></div>
      </section>
    </Overlay>}
    {b && <Overlay id="b" className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4"><section className="bg-white p-4"><button id="close-b" onClick={() => setB(false)}>Close B</button><button id="close-underlying" onClick={() => setA(false)}>Close underlying A</button></section></Overlay>}
    {drawerOpen && <aside ref={drawer} id="drawer" className="fixed inset-y-0 left-0 z-[9999] w-72 overflow-y-auto bg-white"><button id="drawer-modal" onClick={() => setA(true)}>Open modal from drawer</button><button id="close-drawer" onClick={() => setDrawerOpen(false)}>Close drawer</button><div style={{ height: 1600 }} /></aside>}
    <DrlScoreGuideModal isOpen={guide} onClose={() => setGuide(false)} />
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Routes><Route path="*" element={<Fixture />} /><Route path="/next" element={<div id="next">Next page</div>} /></Routes></BrowserRouter></StrictMode>);
