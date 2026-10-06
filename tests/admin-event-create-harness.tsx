import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminEventEditorPage } from '../components/AdminEventEditorPage';
import '../index.css';

createRoot(document.getElementById('root')!).render(<BrowserRouter><AdminEventEditorPage /></BrowserRouter>);
