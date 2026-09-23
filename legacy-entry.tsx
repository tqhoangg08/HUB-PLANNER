import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import LegacyApp from './LegacyApp';
import { installAppNotificationBridge } from './utils/appNotifications';
import { bootstrapBrowser } from './utils/browserBootstrap';
import { installGlobalWebErrorHandlers } from './utils/logWebError';
import { CalendarImportGuideHost } from './components/CalendarImportGuideHost';

export const mountLegacyApplication = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Legacy root is unavailable');

  bootstrapBrowser();
  installAppNotificationBridge();
  installGlobalWebErrorHandlers();

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <LegacyApp />
        <CalendarImportGuideHost />
      </BrowserRouter>
    </React.StrictMode>,
  );
};
