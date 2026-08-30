import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { bootstrapBrowser } from './utils/browserBootstrap';

type RecoveryErrorBoundaryState = {
  failed: boolean;
};

const RecoveryFailure = () => (
  <main
    role="alert"
    className="flex min-h-[100dvh] items-center justify-center bg-[#F8FAFC] px-6 text-center font-semibold text-[#0D1B3E]"
  >
    Không thể tải trang đăng nhập an toàn. Vui lòng tải lại trang.
  </main>
);

class RecoveryErrorBoundary extends React.Component<React.PropsWithChildren, RecoveryErrorBoundaryState> {
  state: RecoveryErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RecoveryErrorBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <RecoveryFailure /> : this.props.children;
  }
}

export const mountRecoveryApplication = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Recovery root is unavailable');

  bootstrapBrowser();
  const root = ReactDOM.createRoot(rootElement);
  let failed = false;
  const renderFailure = () => {
    if (failed) return;
    failed = true;
    root.render(<RecoveryFailure />);
  };

  window.addEventListener('error', (event) => {
    if (!String(event.message).includes('ResizeObserver')) renderFailure();
  });
  window.addEventListener('unhandledrejection', renderFailure);

  root.render(
    <React.StrictMode>
      <RecoveryErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </RecoveryErrorBoundary>
    </React.StrictMode>,
  );
};
