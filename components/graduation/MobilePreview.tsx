import React from 'react';
import { DesignElement, InvitationProject, SectionKey } from './types';
import { SectionRenderer } from './SectionRenderer';

interface MobilePreviewProps {
  project: InvitationProject;
  mode?: 'editor' | 'public';
  onEdit?: (key: SectionKey) => void;
  onRsvpSubmitted?: () => void;
  selectedElementId?: string | null;
  onSelectDesignElement?: (id: string) => void;
  onDesignElementChange?: (element: DesignElement) => void;
}

export const MobilePreview = ({ project, mode = 'editor', onEdit, onRsvpSubmitted, selectedElementId, onSelectDesignElement, onDesignElementChange }: MobilePreviewProps) => {
  const fontStack = `${project.themeConfig.bodyFont}, Inter, sans-serif`;

  const animationClass = project.themeConfig.animationEnabled ? 'grad-animated' : 'grad-no-animation';

  return (
    <div
      className={`${animationClass} ${mode === 'public' ? 'min-h-[100dvh] w-full' : 'h-full w-full overflow-y-auto rounded-[32px] border-[10px] border-slate-900 shadow-2xl'}`}
      style={{
        backgroundColor: project.themeConfig.backgroundColor,
        color: project.themeConfig.textColor,
        fontFamily: fontStack,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800&family=Cormorant+Garamond:wght@600;700&family=Libre+Baskerville:wght@400;700&family=Lora:wght@500;700&family=Playfair+Display:wght@700;800&display=swap');
        .grad-animated .grad-reveal {
          opacity: 0;
          filter: blur(8px);
          transform: translate3d(0, 28px, 0) scale(0.98);
          transition: opacity 760ms ease, transform 760ms cubic-bezier(.2,.8,.2,1), filter 760ms ease;
          will-change: opacity, transform, filter;
        }
        .grad-animated .grad-reveal-left { transform: translate3d(-34px, 16px, 0) rotate(-1.5deg); }
        .grad-animated .grad-reveal-right { transform: translate3d(34px, 16px, 0) rotate(1.5deg); }
        .grad-animated .grad-reveal-zoom { transform: translate3d(0, 18px, 0) scale(0.92); }
        .grad-animated .grad-reveal.is-visible {
          opacity: 1;
          filter: blur(0);
          transform: translate3d(0, 0, 0) scale(1) rotate(0);
        }
        .grad-no-animation .grad-reveal { opacity: 1; transform: none; filter: none; }
        .grad-sticker {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,.46);
          background: rgba(255,255,255,.84);
          box-shadow: 0 18px 50px rgba(15,23,42,.16);
          backdrop-filter: blur(12px);
        }
        .grad-animated .grad-float { animation: gradFloat 4.8s ease-in-out infinite; }
        .grad-animated .grad-float-slow { animation: gradFloat 6.2s ease-in-out infinite; }
        .grad-confetti-dot {
          position: absolute;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          opacity: .86;
        }
        .grad-paper {
          position: absolute;
          width: 12px;
          height: 6px;
          border-radius: 999px;
          opacity: .78;
          transform: rotate(18deg);
        }
        @keyframes gradFloat {
          0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
          50% { transform: translateY(-12px) rotate(calc(var(--r, 0deg) + 2deg)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .grad-animated .grad-reveal,
          .grad-animated .grad-float,
          .grad-animated .grad-float-slow {
            opacity: 1;
            transform: none;
            filter: none;
            animation: none;
            transition: none;
          }
        }
      `}</style>
      {project.sectionOrder.map((key) => (
        <SectionRenderer
          key={key}
          project={project}
          sectionKey={key}
          mode={mode}
          onEdit={onEdit}
          onRsvpSubmitted={onRsvpSubmitted}
          selectedElementId={selectedElementId}
          onSelectDesignElement={onSelectDesignElement}
          onDesignElementChange={onDesignElementChange}
        />
      ))}
    </div>
  );
};
