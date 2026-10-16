import React from 'react';
import { Award, Medal, Star } from 'lucide-react';

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
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  }[size];

  const iconSize = {
    sm: 12,
    md: 13,
    lg: 15,
  }[size];

  if (isExcellence) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses} ${className}`}
      >
        <Star size={iconSize} className="text-amber-600 fill-amber-600/20" />
        <span>{awardType}</span>
      </span>
    );
  }

  if (isGood) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-md bg-blue-50 text-blue-800 border border-blue-200 ${sizeClasses} ${className}`}
      >
        <Medal size={iconSize} className="text-blue-600" />
        <span>{awardType}</span>
      </span>
    );
  }

  if (isFair) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses} ${className}`}
      >
        <Award size={iconSize} className="text-emerald-600" />
        <span>{awardType}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md bg-gray-50 text-gray-700 border border-gray-200 ${sizeClasses} ${className}`}
    >
      <Award size={iconSize} className="text-gray-500" />
      <span>{awardType}</span>
    </span>
  );
};
