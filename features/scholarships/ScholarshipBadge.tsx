import React from 'react';
import { Award, Medal, Sparkles, Star } from 'lucide-react';

interface ScholarshipBadgeProps {
  awardType: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ScholarshipBadge: React.FC<ScholarshipBadgeProps> = ({
  awardType,
  size = 'md',
  className = '',
}) => {
  const norm = awardType.toLowerCase();

  const isExcellence = norm.includes('xuất sắc') || norm.includes('xuat sac');
  const isGood = norm.includes('giỏi') || norm.includes('gioi');
  const isFair = norm.includes('khá') || norm.includes('kha');

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-3 py-1 text-xs gap-1.5',
    lg: 'px-4 py-1.5 text-sm gap-2',
  }[size];

  const iconSize = {
    sm: 12,
    md: 14,
    lg: 16,
  }[size];

  if (isExcellence) {
    return (
      <span
        className={`inline-flex items-center font-extrabold rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-amber-950 shadow-sm border border-amber-300/60 ${sizeClasses} ${className}`}
      >
        <Sparkles size={iconSize} className="text-amber-800 animate-pulse" />
        <span>{awardType}</span>
      </span>
    );
  }

  if (isGood) {
    return (
      <span
        className={`inline-flex items-center font-bold rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-[#0052CC] border border-blue-200/80 shadow-sm ${sizeClasses} ${className}`}
      >
        <Medal size={iconSize} className="text-[#0052CC]" />
        <span>{awardType}</span>
      </span>
    );
  }

  if (isFair) {
    return (
      <span
        className={`inline-flex items-center font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm ${sizeClasses} ${className}`}
      >
        <Award size={iconSize} className="text-emerald-700" />
        <span>{awardType}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-200 shadow-sm ${sizeClasses} ${className}`}
    >
      <Star size={iconSize} className="text-slate-600" />
      <span>{awardType}</span>
    </span>
  );
};
