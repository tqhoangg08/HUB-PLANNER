import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';

const CONFETTI_COLORS = ['#da251d', '#ffff00'];

export const VictoryCelebration = () => {
  const [isVisible, setIsVisible] = useState(true);

  const fireConfetti = useCallback(() => {
    const baseConfig = {
      particleCount: 120,
      spread: 70,
      startVelocity: 45,
      ticks: 200,
      colors: CONFETTI_COLORS,
      zIndex: 9999, // <--- THÊM DÒNG NÀY (Để đảm bảo pháo nằm trên tất cả mọi thứ)
      disableForReducedMotion: true // Tốt cho accessibility
    };

    // Bắn từ góc trái dưới
    confetti({
      ...baseConfig,
      angle: 60,
      origin: { x: 0, y: 1 }, // Tọa độ (0,1) là góc trái dưới
    });

    // Bắn từ góc phải dưới
    confetti({
      ...baseConfig,
      angle: 120,
      origin: { x: 1, y: 1 }, // Tọa độ (1,1) là góc phải dưới
    });
  }, []);

  useEffect(() => {
    // Gọi hàm bắn ngay khi component hiện ra
    fireConfetti();
  }, [fireConfetti]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Container chứa nút bấm */}
      <div className="pointer-events-auto fixed bottom-4 right-4 max-w-xs rounded-2xl border border-red-200 bg-white/95 p-4 shadow-2xl backdrop-blur animate-slideUp">
        <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🇻🇳</span>
            <p className="text-sm font-bold text-red-700">
            Chúc mừng U23 Việt Nam chiến thắng!
            </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fireConfetti}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 transition-transform active:scale-95"
          >
            Bắn pháo nữa! 🎉
          </button>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
