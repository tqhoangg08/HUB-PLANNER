import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Smartphone, X } from 'lucide-react';
import { canPromptPwaInstall, requestPwaInstall } from '../utils/pwaInstallPrompt';
import { getCalendarImportGuide, readCalendarDeviceSignals } from '../utils/calendarImportGuide';

interface CalendarImportGuideDialogProps {
  eventCount: number;
  onClose: () => void;
}

export const CalendarImportGuideDialog: React.FC<CalendarImportGuideDialogProps> = ({ eventCount, onClose }) => {
  const guide = useMemo(() => getCalendarImportGuide(readCalendarDeviceSignals()), []);
  const [canInstall, setCanInstall] = useState(canPromptPwaInstall);
  const [isInstalling, setIsInstalling] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onInstallPrompt = () => setCanInstall(true);
    const onInstalled = () => setCanInstall(false);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [onClose]);

  const handleInstall = async () => {
    if (!canInstall || isInstalling) return;
    setIsInstalling(true);
    try {
      await requestPwaInstall();
    } catch {
      // The browser owns the install prompt. Manual guidance stays available.
    } finally {
      setCanInstall(canPromptPwaInstall());
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100001] flex items-end justify-center bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="calendar-import-guide-title" className="max-h-[92dvh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 size={16} /> File lịch đã sẵn sàng</p>
            <h2 id="calendar-import-guide-title" className="mt-1 text-lg font-extrabold text-[#003375]">Hoàn tất thêm lịch</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Đóng hướng dẫn" className="min-h-11 min-w-11 shrink-0 rounded-full p-2 text-slate-500 hover:bg-white hover:text-slate-700"><X size={20} /></button>
        </header>
        <div className="min-w-0 space-y-4 px-5 py-5 text-sm text-slate-700">
          <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 font-semibold text-emerald-900">File lịch đã được tải xuống. {eventCount} buổi học đã được chuẩn bị. Làm theo các bước dưới đây để thêm vào ứng dụng lịch.</p>
          <div>
            <h3 className="mb-3 font-extrabold text-[#003375]">{guide.title}</h3>
            <ol className="space-y-2">
              {guide.steps.map((step, index) => (
                <li key={step} className="flex min-w-0 items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#0056C7]">{index + 1}</span>
                  <span className="min-w-0 break-words leading-6">{step}</span>
                </li>
              ))}
            </ol>
            {guide.note && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{guide.note}</p>}
          </div>
          {guide.showPwaInstallCard && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="flex items-center gap-2 font-bold text-[#003375]"><Smartphone size={17} /> 💡 Dùng HUB Planner như ứng dụng</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">Thêm HUB Planner vào màn hình chính để mở nhanh hơn và có trải nghiệm tốt hơn trên điện thoại.</p>
              {canInstall ? (
                <button type="button" disabled={isInstalling} onClick={handleInstall} className="mt-3 min-h-11 rounded-lg bg-[#003375] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cài HUB Planner</button>
              ) : guide.manualInstallHint ? (
                <p className="mt-2 text-xs font-semibold text-[#003375]">{guide.manualInstallHint}</p>
              ) : null}
            </div>
          )}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Download size={15} className="mt-0.5 shrink-0" /> Lịch đã thêm vào ứng dụng lịch sẽ không tự cập nhật khi thời khóa biểu thay đổi.</p>
        </div>
        <footer className="border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-lg bg-[#003375] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#002855]">Đóng</button>
        </footer>
      </section>
    </div>
  );
};
