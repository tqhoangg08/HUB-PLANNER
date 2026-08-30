import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-400-italic.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';
import '@fontsource/inter/vietnamese-800.css';
import './index.css';
import { selectApplicationEntry } from './app/bootstrap/selectApplicationEntry';

if ('serviceWorker' in navigator) {
  let isRefreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  const checkForServiceWorkerUpdate = () => {
    navigator.serviceWorker.getRegistration()
      .then((registration) => {
        if (!registration) return undefined;

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        return registration.update();
      })
      .catch(() => {});
  };

  window.addEventListener('load', checkForServiceWorkerUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForServiceWorkerUpdate();
  });
}

const classifyBootstrapFailure = (error: unknown) => {
  if (error instanceof Error) {
    if (error.name === 'TypeError') return 'type-error';
  }
  return 'unknown';
};

const renderBootstrapFailure = (error: unknown) => {
  // Keep the browser diagnostic useful without reflecting exception text,
  // request data, credentials, or internal stack details to the user.
  console.error('[bootstrap] Application startup failed', {
    category: classifyBootstrapFailure(error),
  });
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  rootElement.replaceChildren();
  const message = document.createElement('main');
  message.setAttribute('role', 'alert');
  message.className = 'flex min-h-[100dvh] items-center justify-center bg-[#F8FAFC] px-6 text-center font-semibold text-[#0D1B3E]';
  message.textContent = 'Không thể khởi động ứng dụng. Vui lòng tải lại trang.';
  rootElement.appendChild(message);
};

const startApplication = async () => {
  const entry = selectApplicationEntry(
    window.location.pathname,
    String(import.meta.env.VITE_AUTH_MAINTENANCE_MODE || '').toLowerCase() === 'true',
  );

  if (entry === 'recovery') {
    const { mountRecoveryApplication } = await import('./recovery-entry');
    mountRecoveryApplication();
    return;
  }

  const { mountLegacyApplication } = await import('./legacy-entry');
  mountLegacyApplication();
};

void startApplication().catch(renderBootstrapFailure);
