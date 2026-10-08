import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminEventCandidates } from '../components/AdminEventCandidates';
import '../index.css';

const imageUrl = '/api/public/v1/event-banners/00000000-0000-4000-8000-000000000001.png';
const candidate = {
  id: '222', source_name: 'Nguồn kiểm thử', post_url: 'https://example.test/post',
  raw_content: 'Sự kiện kiểm thử', image_url: imageUrl, image_ingest_status: 'stored', review_status: 'pending',
  ai_result: { title: 'Sự kiện kiểm thử' },
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const path = new URL(String(input), location.origin).pathname;
  if (path === '/api/admin/v1/event-candidates') return Response.json({ candidates: [candidate] });
  if (path === '/api/private/v1/event-drl/catalog') return Response.json({ success: true, organizers: [], rules: [] });
  if (path.startsWith('/api/public/v1/event-banners/')) {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(<BrowserRouter><AdminEventCandidates isAdmin isAuditor={false} /></BrowserRouter>);
