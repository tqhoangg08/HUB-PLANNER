import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { EventsBoard } from '../components/EventsBoard';
import { MobileEvents } from '../components/MobileEvents';
import '../index.css';

const mobile = new URLSearchParams(window.location.search).has('mobile');
createRoot(document.getElementById('root')!).render(<BrowserRouter>{mobile ? <MobileEvents/> : <EventsBoard/>}</BrowserRouter>);
