import React from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { TURNSTILE_SITE_KEY, hasTurnstileSiteKey } from '../utils/turnstileConfig';

export { hasTurnstileSiteKey } from '../utils/turnstileConfig';

type TurnstileBoxProps = {
  token: string;
  onTokenChange: (token: string) => void;
  className?: string;
  action?: string;
};

export const TurnstileBox: React.FC<TurnstileBoxProps> = ({ onTokenChange, className = '', action }) => {
  if (!hasTurnstileSiteKey) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ${className}`}>
        Chưa cấu hình Turnstile site key.
      </div>
    );
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        options={action ? { action } : undefined}
        onSuccess={onTokenChange}
        onExpire={() => onTokenChange('')}
        onError={() => onTokenChange('')}
      />
    </div>
  );
};
