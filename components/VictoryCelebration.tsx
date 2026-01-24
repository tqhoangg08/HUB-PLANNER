import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

const CONFETTI_COLORS = ['#da251d', '#ffff00'];

export const VictoryCelebration = () => {
  const [isVisible, setIsVisible] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<confetti.CreateTypes | null>(null);

  const fireConfetti = useCallback(() => {
    if (!confettiRef.current) return;
    const baseConfig = {
      particleCount: 120,
      spread: 70,
      startVelocity: 45,
      ticks: 200,
      colors: CONFETTI_COLORS,
    };

    confettiRef.current({
      ...baseConfig,
      angle: 60,
      origin: { x: 0, y: 1 },
    });

    confettiRef.current({
      ...baseConfig,
      angle: 120,
      origin: { x: 1, y: 1 },
    });
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    confettiRef.current = confetti.create(canvasRef.current, {
      resize: true,
      useWorker: false,
    });

    const timer = window.setTimeout(() => {
      fireConfetti();
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fireConfetti]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      />
      <div className="pointer-events-auto fixed bottom-4 right-4 z-[9999] max-w-xs rounded-2xl border border-red-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold text-red-700">
          Chúc mừng U23 Việt Nam chiến thắng! 🇻🇳⚽️
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fireConfetti}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            Bắn pháo nữa! 🎉
          </button>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
