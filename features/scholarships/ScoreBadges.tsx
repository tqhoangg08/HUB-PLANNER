import React from 'react';
import type { ScoreColumn } from '../../utils/scholarshipApi';

interface ScoreBadgesProps {
  scoreColumns: ScoreColumn[];
  scores: Record<string, number | string | null>;
  variant?: 'chips' | 'table-cell' | 'compact';
  className?: string;
}

export const formatScoreValue = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
};

export const ScoreBadges: React.FC<ScoreBadgesProps> = ({
  scoreColumns,
  scores,
  variant = 'chips',
  className = '',
}) => {
  if (!scoreColumns || scoreColumns.length === 0) {
    return null;
  }

  if (variant === 'chips') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {scoreColumns.map((col) => {
          const val = scores?.[col.key];
          const displayVal = formatScoreValue(val);
          const isMissing = displayVal === '—';

          return (
            <div
              key={col.key}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                isMissing
                  ? 'bg-slate-50 border-slate-200 text-slate-400'
                  : 'bg-blue-50/70 border-blue-200/70 text-[#003375]'
              }`}
              title={`${col.label}: ${displayVal}`}
            >
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">
                {col.label}:
              </span>
              <span className={`font-bold ${isMissing ? 'text-slate-400' : 'text-[#003375]'}`}>
                {displayVal}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
        {scoreColumns.map((col) => {
          const val = scores?.[col.key];
          const displayVal = formatScoreValue(val);
          return (
            <span key={col.key} className="text-slate-600">
              <span className="text-slate-400">{col.label}:</span>{' '}
              <strong className="text-slate-800">{displayVal}</strong>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {scoreColumns.map((col) => {
        const val = scores?.[col.key];
        const displayVal = formatScoreValue(val);
        return (
          <div key={col.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">{col.label}:</span>
            <span className="font-semibold text-slate-900">{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
};
