import React, {useId, useState} from 'react';
import type {OwnAward} from '../../utils/scholarshipApi';
import {rankingKeys, type RankingKey} from '../../shared/scholarship-policy';
import {ownDetails, formatRanking, rankingLabels, rankingPreferenceKey} from '../../utils/scholarshipDetailsModel';

export function PersonalAwardCard({award, expanded, onToggle, selected, onSelection}: {
  award: OwnAward; expanded: boolean; onToggle: () => void; selected: RankingKey[]; onSelection: (keys: RankingKey[]) => void;
}) {
  const id = useId();
  const [customizing, setCustomizing] = useState(false);
  const details = ownDetails(award);
  const rankings = rankingKeys.flatMap(key => {
    const value = formatRanking(key, award.rankings?.[key]);
    return value === null ? [] : [{key, value}];
  });
  const toggleMetric = (key: RankingKey) => {
    const next = selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key];
    onSelection(next);
    try { localStorage.setItem(rankingPreferenceKey, JSON.stringify(next)); } catch { /* UI remains usable without persistence. */ }
  };
  return <article className="scholarship-personal-card">
    <div className="scholarship-personal-summary">
      <div><h4>{award.campaignTitle}</h4><p>{award.scholarshipType || award.awardType} · {award.semester} · {award.schoolYear}</p>
        <p>{award.fullName} · MSSV: {award.studentCode}</p>
        {award.sourceListKind === 'eligibility' && <p>Danh sách đủ điều kiện xét học bổng</p>}
      </div>
      <button type="button" className="scholarship-button" aria-expanded={expanded} aria-controls={`${id}-details`} onClick={onToggle}>{expanded ? 'Thu gọn' : 'Xem thêm'}</button>
    </div>
    <div id={`${id}-details`} hidden={!expanded}>
      {details.length > 0 && <dl className="scholarship-personal-details">{details.map(({key, label, value}) => <div key={key}><dt>{label}: </dt><dd>{value}</dd></div>)}</dl>}
      {rankings.length > 0 && <section className="scholarship-personal-rankings" aria-label="Thứ hạng trong danh sách xét">
        <div className="scholarship-personal-summary"><h5>Thứ hạng trong danh sách xét</h5><button type="button" className="scholarship-button" aria-expanded={customizing} aria-controls={`${id}-preferences`} onClick={() => setCustomizing(value => !value)}>Tùy chỉnh</button></div>
        <fieldset id={`${id}-preferences`} hidden={!customizing}><legend className="sr-only">Chỉ số hiển thị</legend>{rankings.map(({key}) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggleMetric(key)} />{rankingLabels[key]}</label>)}</fieldset>
        <div className="scholarship-rank-grid">{rankings.filter(({key}) => selected.includes(key)).map(({key, value}) => <div key={key}><p>{rankingLabels[key]}</p><strong>{value}</strong></div>)}</div>
      </section>}
    </div>
  </article>;
}
