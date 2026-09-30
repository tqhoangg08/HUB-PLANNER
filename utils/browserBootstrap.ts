type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export const installGlobalErrorFilter = () => {
  window.onerror = (message, source, lineno, colno, error) => {
    if (String(message).includes('ResizeObserver')) return true;
    console.error(message, source, lineno, colno, error);
    return false;
  };
};

export const applyStandaloneDisplayMode = () => {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true;
  const isTouchMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const root = document.documentElement;
  let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (isTouchMobile) {
    root.classList.add(isStandalone ? 'mobile-standalone' : 'mobile-browser');
  }

  if (isStandalone) {
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', '#003375');
  } else if (themeMeta) {
    themeMeta.remove();
  }
};

export const bootstrapBrowser = () => {
  installGlobalErrorFilter();
  applyStandaloneDisplayMode();
};
