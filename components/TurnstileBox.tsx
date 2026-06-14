import React from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

type TurnstileBoxProps = {
  token: string;
  onTokenChange: (token: string) => void;
  className?: string;
};

export const hasTurnstileSiteKey = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

export const TurnstileBox: React.FC<TurnstileBoxProps> = ({ onTokenChange, className = '' }) => {
  if (!hasTurnstileSiteKey) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ${className}`}>
        Chua cau hinh Turnstile site key.
      </div>
    );
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <Turnstile
        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        onSuccess={onTokenChange}
        onExpire={() => onTokenChange('')}
        onError={() => onTokenChange('')}
      />
    </div>
  );
};
