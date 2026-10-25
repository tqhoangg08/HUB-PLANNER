import React from 'react';

// Decorative examples only. They never enter study data, calculations or forms.
export function DashboardLockLabel() {
  return <span className="dashboard-lock ui-meta"><span aria-hidden="true">🔒</span><span className="dashboard-lock-copy">Cần đăng nhập</span></span>;
}

export function DashboardPreview({ kind }: { kind: 'ranking' | 'forecast' | 'trend' | 'distribution' | 'year' }) {
  return <div data-dashboard-preview={kind}>
    <span className="sr-only">Dữ liệu minh họa, chưa phải kết quả học tập của bạn.</span>
    <div className={`dashboard-preview dashboard-preview--${kind} ui-meta`} aria-hidden="true">
      {kind === 'ranking' && [['Kinh tế vi mô', '9.2'], ['Quản trị học', '8.8'], ['Pháp luật đại cương', '8.5']].map(([name, score], index) =>
        <div className="dashboard-preview-row" key={name}><span>{index + 1}. {name}</span><b>{score}</b></div>)}
      {kind === 'forecast' && [['Mục tiêu', '3.20'], ['Hiện tại', '0.00'], ['TB mỗi tín', '3.20']].map(([label, value]) =>
        <div className="dashboard-preview-row" key={label}><span>{label}</span><b>{value}</b></div>)}
      {kind === 'trend' && [35, 55, 75, 95].map((height, index) =>
        <div key={height} style={{ height: `${height}%`, background: ['#cbd5e1', '#93c5fd', '#60a5fa', '#003375'][index] }} />)}
      {kind === 'distribution' && [['A / A+', 40], ['B / B+', 45], ['C / D', 15]].map(([label, percent]) =>
        <div key={label} className="dashboard-preview-distribution"><div className="dashboard-preview-row"><span>{label}</span><span>{percent}%</span></div><div className="dashboard-preview-track"><div style={{ width: `${percent}%` }} /></div></div>)}
      {kind === 'year' && <><div className="dashboard-year-row"><span>Năm học</span><span>TC</span><span>GPA(4)</span><span>GPA(10)</span><span>ĐRL</span></div><div className="dashboard-year-row"><span>2025–2026</span><span>0</span><span>—</span><span>—</span><span>—</span></div></>}
    </div>
  </div>;
}

export function DashboardCreditProgress({ earned, required }: { earned: number; required: number }) {
  const percent = required > 0 ? Math.min(100, Math.max(0, earned / required * 100)) : 0;
  return <div className="dashboard-credit-progress">
    <span className="ui-meta">{Math.round(percent)}%</span>
    <div data-credit-progress role="progressbar" aria-label="Tiến độ tín chỉ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${earned} / ${required} tín chỉ`}><div style={{ width: `${percent}%` }} /></div>
  </div>;
}
