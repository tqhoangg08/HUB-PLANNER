import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Facebook, Heart, X } from 'lucide-react';

let hasSeenBanner = false;

export const AdsBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(!hasSeenBanner);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isVisible]);

  const handleClose = () => {
    hasSeenBanner = true;
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-scaleIn">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-500 shadow-md transition hover:text-gray-700 hover:bg-white"
          aria-label="Đóng banner quảng cáo"
        >
          <X size={20} />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center gap-6">
            <img
              src="/ads-banner.png"
              alt="Banner quảng cáo HUB Planner"
              className="w-full max-h-[360px] object-contain rounded-xl border border-gray-100 shadow-sm"
            />

            <div className="text-center space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Đồng hành cùng HUB Planner
              </h2>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                Hãy theo dõi Fanpage để cập nhật các tính năng mới nhất và ủng hộ đội ngũ phát triển nhé!
              </p>
            </div>

            <a
              href="https://www.facebook.com/hubplannerr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-red-600 hover:to-orange-600 active:scale-95"
            >
              <Heart size={18} className="fill-white" />
              Ủng hộ &amp; Theo dõi ngay
              <Facebook size={18} />
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
