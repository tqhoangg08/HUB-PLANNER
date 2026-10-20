import Swal, { type SweetAlertOptions } from 'sweetalert2';
import { acquireOverlayScrollLock } from './overlayScrollLock';
import { attachOverlayViewport } from './overlayViewport';
import '../components/overlay.css';

/** SweetAlert dialogs participate in the same ownership as React overlays. Toasts do not lock. */
export function fireOverlayAlert(options: SweetAlertOptions) {
  let release: (() => void) | undefined;
  return Swal.fire({
    ...options,
    heightAuto: false,
    scrollbarPadding: false,
    willOpen(popup) {
      const container = popup.parentElement;
      if (!options.toast && container) {
        container.classList.add('overlay-root');
        const unlock = acquireOverlayScrollLock(container);
        const detachViewport = attachOverlayViewport(container);
        release = () => { detachViewport?.(); unlock(); };
      }
      options.willOpen?.(popup);
    },
    didDestroy() {
      release?.();
      release = undefined;
      options.didDestroy?.();
    },
  });
}
