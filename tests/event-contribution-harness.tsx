import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { EventsBoard } from '../components/EventsBoard';
import { MobileEvents } from '../components/MobileEvents';
import '../index.css';

const mobile = new URLSearchParams(window.location.search).has('mobile');
const acceptance = new URLSearchParams(window.location.search).has('acceptance');
if (acceptance && new URLSearchParams(location.search).has('touch')) document.documentElement.classList.add('mobile-browser');

function Acceptance() {
  const [revision, setRevision] = useState(0);
  const navigate = useNavigate();
  // Test-only rerender and unmount controls; no production state overrides.
  Object.assign(window, { contributionHarness: {
    rerender: () => setRevision(value => value + 1),
    leave: () => navigate('/fixture-away'),
    return: () => navigate('/events'),
  } });
  return <main data-revision={revision}>
    <div id="page-anchor" style={{ height: 1200 }}>Local contribution fixture</div>
    <Routes>
      <Route path="/fixture-away" element={<p id="away">Other route</p>} />
      <Route path="*" element={mobile ? <MobileEvents/> : <EventsBoard/>} />
    </Routes>
    <div style={{ height: 1200 }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  {acceptance ? <StrictMode><Acceptance /></StrictMode> : mobile ? <MobileEvents/> : <EventsBoard/>}
</BrowserRouter>);
