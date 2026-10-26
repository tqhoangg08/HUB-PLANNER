import React from 'react';

export function DashboardCreditProgress({ earned, required }: { earned: number; required: number }) {
  const percent = required > 0 ? Math.min(100, Math.max(0, earned / required * 100)) : 0;
  return <div className="dashboard-credit-progress">
    <span className="ui-meta">{Math.round(percent)}%</span>
    <div data-credit-progress role="progressbar" aria-label="Tiến độ tín chỉ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${earned} / ${required} tín chỉ`}><div style={{ width: `${percent}%` }} /></div>
  </div>;
}
