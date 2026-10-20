import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { EventsBoard } from '../components/EventsBoard';
import { MobileEvents } from '../components/MobileEvents';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';

const mobile = new URLSearchParams(location.search).get('view') !== 'desktop';
if (mobile) document.documentElement.classList.add('mobile-browser');

function Harness() {
  const [revision, setRevision] = useState(0);
  const navigate = useNavigate();
  // Re-render/route controls live only in this local fixture. Production state,
  // event handlers, auth and filter behavior are not transformed or overridden.
  Object.assign(window, { drlHarness: {
    rerender: () => setRevision(value => value + 1),
    leave: () => navigate('/fixture-away'),
    return: () => navigate('/events'),
  } });
  return <main data-revision={revision}>
    <div id="page-anchor" style={{ height: 1200 }}>Trang Sự kiện ĐRL — dữ liệu local cô lập</div>
    <Routes>
      <Route path="/fixture-away" element={<p id="away">Trang khác</p>} />
      <Route path="*" element={mobile ? <MobileEvents /> : <EventsBoard />} />
    </Routes>
    <div style={{ height: 1200 }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Harness /></BrowserRouter></StrictMode>);
