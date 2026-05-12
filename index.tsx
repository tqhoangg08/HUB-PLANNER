import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-400-italic.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';
import '@fontsource/inter/vietnamese-800.css';
import './index.css';
import App from './App';
import { installAppNotificationBridge } from './utils/appNotifications';

installAppNotificationBridge();

if ('serviceWorker' in navigator) {
  let isRefreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  const checkForServiceWorkerUpdate = () => {
    navigator.serviceWorker.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {});
  };

  window.addEventListener('load', checkForServiceWorkerUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForServiceWorkerUpdate();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
