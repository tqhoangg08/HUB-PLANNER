import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminSupportTickets } from '../components/AdminSupportTickets';

const isAdmin = new URLSearchParams(window.location.search).get('role') === 'admin';
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/admin/support/11111111-1111-4111-8111-111111111111']}>
    <Routes>
      <Route path="/admin/support/:ticketId" element={<AdminSupportTickets isAdmin={isAdmin} />} />
    </Routes>
  </MemoryRouter>,
);
