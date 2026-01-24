import React from 'react';

export const VictoryTheme: React.FC = () => {
  return (
    <>
      <style>{`
        .bg-blue-600,
        .bg-blue-500,
        .bg-blue-700 {
          background-color: #da251d !important;
        }

        .text-blue-600,
        .text-blue-700 {
          color: #da251d !important;
        }

        .border-blue-200 {
          border-color: #f2a3a3 !important;
        }

        .border-blue-600 {
          border-color: #da251d !important;
        }

        body {
          background-color: #fff0f0 !important;
        }

        .victory-theme-marquee {
          position: fixed;
          top: 64px;
          left: 0;
          right: 0;
          z-index: 45;
          background: #da251d;
          color: #fff;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          overflow: hidden;
          white-space: nowrap;
          padding: 6px 0;
          box-shadow: 0 4px 10px rgba(218, 37, 29, 0.35);
        }

        .victory-theme-marquee span {
          display: inline-block;
          padding-left: 100%;
          animation: victory-marquee 12s linear infinite;
        }

        .victory-theme-sticker {
          position: fixed;
          z-index: 60;
          pointer-events: none;
          filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.2));
        }

        .victory-theme-trophy {
          top: 12px;
          left: 12px;
          font-size: 40px;
        }

        .victory-theme-ball {
          bottom: 18px;
          right: 18px;
          font-size: 42px;
          animation: victory-ball-roll 2.5s linear infinite;
        }

        .victory-theme-star-left,
        .victory-theme-star-right {
          top: 40%;
          font-size: 36px;
          animation: victory-twinkle 1.6s ease-in-out infinite;
        }

        .victory-theme-star-left {
          left: 14px;
        }

        .victory-theme-star-right {
          right: 14px;
        }

        @keyframes victory-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        @keyframes victory-ball-roll {
          0% {
            transform: translateX(0) rotate(0deg);
          }
          50% {
            transform: translateX(-12px) rotate(180deg);
          }
          100% {
            transform: translateX(0) rotate(360deg);
          }
        }

        @keyframes victory-twinkle {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
      `}</style>

      <div className="victory-theme-marquee">
        <span>CHÚC MỪNG U23 VIỆT NAM - TỰ HÀO VIỆT NAM - CHÚC MỪNG U23 VIỆT NAM - TỰ HÀO VIỆT NAM</span>
      </div>

      <div className="victory-theme-sticker victory-theme-trophy animate-bounce" aria-hidden="true">
        🏆
      </div>
      <div className="victory-theme-sticker victory-theme-ball" aria-hidden="true">
        ⚽️
      </div>
      <div className="victory-theme-sticker victory-theme-star-left" aria-hidden="true">
        ⭐️
      </div>
      <div className="victory-theme-sticker victory-theme-star-right" aria-hidden="true">
        ⭐️
      </div>
    </>
  );
};
