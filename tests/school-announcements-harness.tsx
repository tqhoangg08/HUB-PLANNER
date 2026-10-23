import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SchoolAnnouncements from '../components/SchoolAnnouncements';
import '@fontsource/inter/latin.css';
import '@fontsource/inter/vietnamese.css';
import '../index.css';

const internal = new URLSearchParams(location.search).has('internal');
if (innerWidth < 768 && !internal) document.documentElement.classList.add('mobile-browser');
function Harness() {
  const [mounted, setMounted] = useState(true);
  Object.assign(window, { announcementsHarness: { unmount: () => setMounted(false) } });
  return <main className={internal ? 'mobile-main' : ''} style={internal ? { height: '100dvh', overflowY: 'auto' } : {}}>
    <div id="anchor" style={{ height: 1100 }}>Fixture Dashboard — thông báo từ trường</div>
    <div style={{ maxWidth: 1100, margin: 'auto' }}>{mounted && <SchoolAnnouncements />}</div>
    <div style={{ height: 1000 }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
