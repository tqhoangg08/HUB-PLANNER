import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ConfettiOverlayProps {
  onClose?: () => void;
  durationMs?: number;
}

export const ConfettiOverlay: React.FC<ConfettiOverlayProps> = ({
  onClose,
  durationMs = 4000,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const colors = ['#D4AF37', '#FFDF00', '#1A56FF', '#003375', '#38BDF8', '#F59E0B', '#10B981', '#E11D48'];
    const particleCount = 70;
    const particles = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * width,
      y: -20 - Math.random() * 100,
      size: 6 + Math.random() * 8,
      speedX: (Math.random() - 0.5) * 3,
      speedY: 2 + Math.random() * 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
    }));

    let animationId: number;
    const startTime = performance.now();

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, width, height);

      const progress = Math.min(1, elapsed / durationMs);
      const globalAlpha = progress > 0.8 ? (1 - progress) / 0.2 : 1;

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = p.opacity * globalAlpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < durationMs) {
        animationId = requestAnimationFrame(render);
      } else {
        onClose?.();
      }
    };

    animationId = requestAnimationFrame(render);

    const timer = setTimeout(() => {
      onClose?.();
    }, durationMs);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [durationMs, onClose]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto absolute top-4 right-4 p-2 rounded-full bg-white/80 hover:bg-white text-slate-700 shadow-md backdrop-blur-sm transition-all focus:outline-none"
          title="Đóng hiệu ứng"
          aria-label="Đóng hiệu ứng vinh danh"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};
