import React, { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScholarshipShell } from './ScholarshipShell';
import {
  fetchAllPublicCampaigns, fetchCampaignRecipients, fetchCampaignFacets, searchCampaignRecipients,
  formatScoreValue, ScholarshipApiError, type Campaign, type PaginatedRecipients, type CampaignFacets, type ScholarshipFilterKey,
} from '../../utils/scholarshipApi';
import { approvedScoreColumns, scholarshipPage, updateScholarshipParams, scholarshipFilterKeys, resetScholarshipFilters } from '../../utils/scholarshipListModel';

const errorText = (error: unknown) => error instanceof ScholarshipApiError
  ? error.message : 'Không thể kết nối đến hệ thống học bổng. Vui lòng thử lại.';

export const ScholarshipList: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim().normalize('NFC');
  const slugParam = params.get('campaign') || '';
  const category = params.get('awardType') || params.get('category') || '';
  const filterKey = JSON.stringify(Object.fromEntries(scholarshipFilterKeys.map(key => [key, params.get(key) || ''])));
  const filters: Partial<Record<ScholarshipFilterKey, string>> = JSON.parse(filterKey);
  const page = scholarshipPage(params.get('page'));
  const limit = [20, 30, 50].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 20;
  const [input, setInput] = useState(query);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState('');
  const [data, setData] = useState<PaginatedRecipients | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [facets, setFacets] = useState<CampaignFacets | null>(null);
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [facetError, setFacetError] = useState('');
  const [retry, setRetry] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const id = useId();
  const selected = slugParam ? campaigns.find(c => c.slug === slugParam) : campaigns[0];
  const slug = selected?.slug || '';
  const requestKey = JSON.stringify([slug, query, category, filterKey, page, limit]);
  const pendingInput = input.trim().normalize('NFC') !== query;
  const shortQuery = query.length === 1;
  const visibleData = !pendingInput && !shortQuery && dataKey === requestKey ? data : null;
  const scoreColumns = visibleData ? approvedScoreColumns(visibleData.campaign) : [];
  const detailColumns = (['scholarshipType', 'cohort'] as const).filter(key => visibleData?.campaign.approvedFields.includes(key));
  const hasRank = visibleData?.campaign.approvedFields.includes('scholarshipRank');
  const detailLabels = { scholarshipType: 'Loại học bổng', cohort: 'Khóa' };
  const total = visibleData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));

  const update = (changes: Record<string, string>, replace = false) => {
    setParams(previous => updateScholarshipParams(previous, changes), { replace });
  };
  useEffect(() => { setInput(query); }, [query]);
  useEffect(() => {
    if (!pendingInput) return;
    const timer = setTimeout(() => {
      setParams(previous => updateScholarshipParams(previous, { q: input.trim().normalize('NFC'), page: '' }), { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [input, pendingInput, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingCampaigns(true); setCampaignError('');
    fetchAllPublicCampaigns(controller.signal).then(result => {
      if (!controller.signal.aborted) setCampaigns(result);
    }).catch(err => {
      if (!controller.signal.aborted) { setCampaigns([]); setCampaignError(errorText(err)); }
    }).finally(() => { if (!controller.signal.aborted) setLoadingCampaigns(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    setFacets(null); setFacetError(''); setLoadingFacets(false);
    if (!slug || pendingInput || shortQuery || loadingCampaigns) return () => controller.abort();
    setLoadingFacets(true);
    fetchCampaignFacets(slug, { ...JSON.parse(filterKey), q: query || undefined, awardType: category || undefined }, controller.signal).then(result => {
      if (!controller.signal.aborted) setFacets(result);
    }).catch(err => { if (!controller.signal.aborted) setFacetError(errorText(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingFacets(false); });
    return () => controller.abort();
  }, [slug, filterKey, query, category, pendingInput, shortQuery, loadingCampaigns, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(false);
    if (!slug || shortQuery || pendingInput || loadingCampaigns) return () => controller.abort();
    setLoading(true);
    const options = { ...JSON.parse(filterKey), page, limit, awardType: category || undefined };
    const promise = query ? searchCampaignRecipients(slug, { ...options, q: query }, controller.signal)
      : fetchCampaignRecipients(slug, options, controller.signal);
    promise.then(result => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(result.total / limit));
      if (page > lastPage) {
        setParams(previous => updateScholarshipParams(previous, { page: String(lastPage) }), { replace: true });
        return;
      }
      setData(result); setDataKey(requestKey);
    }).catch(err => {
      if (controller.signal.aborted) return;
      setError(errorText(err));
      if (err instanceof ScholarshipApiError && err.status === 429) {
        setRetryAt(Date.now() + (err.retryAfter || 60) * 1000); setNow(Date.now());
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, query, category, filterKey, page, limit, shortQuery, pendingInput, loadingCampaigns, retry, requestKey, setParams]);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const disabled = loadingCampaigns || !selected;
  const message = campaignError || error || (slugParam && !selected && !loadingCampaigns
    ? 'Đợt học bổng đã chọn chưa được công bố hoặc không còn khả dụng.' : '');
  const busy = loadingCampaigns || loading || pendingInput;
  const renderFilter = (key: ScholarshipFilterKey, label: string, emptyLabel: string) => {
    const supported = facets?.supportedFilters.includes(key);
    const values = facets?.facets[key].options || [];
    const value = filters[key] || '';
    return <div className="scholarship-field" key={key}><label htmlFor={`${id}-${key}`}>{label}</label>
      <select id={`${id}-${key}`} className="scholarship-input" value={value} disabled={disabled || loadingFacets || !supported} onChange={e => update({ [key]: e.target.value, page: '' })}>
        <option value="">{loadingFacets || pendingInput || loadingCampaigns ? 'Đang tải...' : facetError ? 'Không tải được danh mục' : supported ? emptyLabel : 'Chưa có dữ liệu công bố'}</option>
        {value && !values.includes(value) && <option value={value}>{value}</option>}
        {values.map(option => <option key={option}>{option}</option>)}
      </select>
    </div>;
  };
  return (
    <ScholarshipShell title="Danh sách sinh viên nhận học bổng" subtitle="Tra cứu danh sách sinh viên nhận học bổng theo từng học kỳ." headerActions={
      <div className="scholarship-field scholarship-term"><label htmlFor={`${id}-term`}>Học kỳ / Năm học</label>
        <select id={`${id}-term`} className="scholarship-input" value={slugParam || slug} disabled={loadingCampaigns || !campaigns.length} onChange={e => { const campaign = e.target.value; setInput(''); setParams(previous => { const next = resetScholarshipFilters(previous); next.set('campaign', campaign); return next; }); }}>
          {!campaigns.length && <option value="">{loadingCampaigns ? 'Đang tải học kỳ...' : campaignError ? 'Không tải được học kỳ' : 'Chưa có đợt công bố'}</option>}
          {slugParam && !selected && <option value={slugParam}>Đợt không khả dụng</option>}
          {campaigns.map(c => <option value={c.slug} key={c.slug}>{c.semester} / {c.schoolYear} — {c.title}</option>)}
        </select>
      </div>
    }>
      <section aria-label="Tra cứu sinh viên nhận học bổng">
        <div className={`scholarship-surface scholarship-filters${filtersCollapsed ? ' is-collapsed' : ''}`}>
          <div className="scholarship-filter-heading">
            <p>Bộ lọc</p>
            <div className="scholarship-filter-actions">
              <button type="button" className="scholarship-filter-reset scholarship-button" onClick={() => { setInput(''); setParams(previous => resetScholarshipFilters(previous)); }}>Xóa bộ lọc</button>
              <button type="button" className="scholarship-filter-toggle scholarship-button" aria-expanded={!filtersCollapsed} aria-controls={`${id}-filters`} aria-label={filtersCollapsed ? 'Mở bộ lọc' : 'Thu gọn bộ lọc'} onClick={() => setFiltersCollapsed(collapsed => !collapsed)}>{filtersCollapsed ? 'Mở bộ lọc' : 'Thu gọn'}</button>
            </div>
          </div>
          <div id={`${id}-filters`} className="scholarship-filter-panel" inert={filtersCollapsed} aria-hidden={filtersCollapsed}>
            <div className="scholarship-filter-controls">
              <div className="scholarship-filter-grid">
                <div className="scholarship-field"><label htmlFor={`${id}-query`}>Họ tên / MSSV</label>
                  <input id={`${id}-query`} className="scholarship-input" type="search" autoComplete="off" maxLength={80} placeholder="Nhập mã sinh viên hoặc họ tên..." value={input} disabled={disabled} onChange={e => setInput(e.target.value)} />
                </div>
                {renderFilter('major', 'Ngành học', 'Tất cả ngành')}
                {renderFilter('className', 'Lớp', 'Tất cả lớp')}
                {renderFilter('scholarshipType', 'Loại học bổng', 'Tất cả loại')}
                {renderFilter('scholarshipRank', 'Xếp loại học bổng', 'Tất cả xếp loại')}
                {renderFilter('cohort', 'Khóa', 'Tất cả khóa')}
              </div>
              {facetError && <p role="status" className="scholarship-note">Không tải được danh mục bộ lọc. <button className="scholarship-button" onClick={() => setRetry(n => n + 1)}>Thử lại</button></p>}
            </div>
          </div>
        </div>
        <div className="scholarship-surface scholarship-table-surface" aria-busy={busy}>
          {message ? <div className="scholarship-status" role="alert"><p>{message}</p><button className="scholarship-button" disabled={cooldown > 0} onClick={() => setRetry(n => n + 1)}>{cooldown ? `Thử lại sau ${cooldown} giây` : 'Thử lại'}</button></div>
            : busy ? <div className="scholarship-skeleton" role="status"><span className="sr-only">Đang tải danh sách học bổng...</span><div aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div className="scholarship-skeleton-row" key={i}>{Array.from({ length: 4 }, (_, j) => <span key={j} />)}</div>)}</div></div>
            : !campaigns.length ? <div className="scholarship-status" role="status">Chưa có danh sách học bổng được công bố.</div>
            : shortQuery ? <div className="scholarship-status" role="status">Nhập ít nhất 2 ký tự để tra cứu.</div>
            : visibleData && !total ? <div className="scholarship-status" role="status">{query || category || Object.values(filters).some(Boolean) ? 'Không tìm thấy sinh viên phù hợp với bộ lọc.' : 'Đợt công bố này chưa có sinh viên nhận học bổng.'}</div>
            : visibleData && <>
              <div className="scholarship-table-scroll" tabIndex={0} role="region" aria-label="Bảng sinh viên nhận học bổng">
                <table className="scholarship-table"><caption className="sr-only">Danh sách sinh viên nhận học bổng — {visibleData.campaign.title}</caption><thead><tr>
                  {['STT', 'MSSV', 'Họ và tên', 'Mã lớp SV', 'Ngành học'].map(label => <th scope="col" key={label}>{label}</th>)}
                  {detailColumns.map(key => <th scope="col" key={key}>{detailLabels[key]}</th>)}
                  {scoreColumns.map(c => <th scope="col" key={c.key} className="scholarship-number">{c.label}</th>)}<th scope="col">{hasRank ? 'Xếp loại HB' : 'Kết quả học bổng'}</th>
                </tr></thead><tbody>{visibleData.recipients.map((r, i) => <tr key={r.id}>
                  <td className="scholarship-number">{(page - 1) * limit + i + 1}</td><td>{r.studentCode}</td><td>{r.fullName}</td><td>{r.className || '—'}</td><td>{r.major || '—'}</td>
                  {detailColumns.map(key => <td key={key}>{r[key] || '—'}</td>)}
                  {scoreColumns.map(c => <td key={c.key} className="scholarship-number">{formatScoreValue(r.scores[c.key])}</td>)}<td>{hasRank ? r.scholarshipRank || '—' : r.awardType}</td>
                </tr>)}</tbody></table>
              </div>
              <div className="scholarship-mobile-list">{visibleData.recipients.map((r, i) => <details key={r.id}><summary>{(page - 1) * limit + i + 1}. {r.fullName}<small>{r.studentCode} · {hasRank ? r.scholarshipRank || '—' : r.awardType}</small></summary><dl>
                <dt>Mã lớp SV</dt><dd>{r.className || '—'}</dd><dt>Ngành học</dt><dd>{r.major || '—'}</dd>
                {detailColumns.map(key => <React.Fragment key={key}><dt>{detailLabels[key]}</dt><dd>{r[key] || '—'}</dd></React.Fragment>)}
                {scoreColumns.map(c => <React.Fragment key={c.key}><dt>{c.label}</dt><dd>{formatScoreValue(r.scores[c.key])}</dd></React.Fragment>)}
              </dl></details>)}</div>
            </>}
          {visibleData && !message && <div className="scholarship-pager">
            <p role="status">Tổng số: {total.toLocaleString('vi-VN')} kết quả</p>
            <div className="scholarship-pager-controls">
              <label htmlFor={`${id}-limit`}>Số dòng</label><select id={`${id}-limit`} value={limit} onChange={e => update({ limit: e.target.value, page: '' })}>{[20, 30, 50].map(n => <option key={n}>{n}</option>)}</select>
              <button className="scholarship-button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Trước</button><span>Trang {page} / {totalPages}</span><button className="scholarship-button" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>Sau</button>
            </div>
          </div>}
        </div>
        {visibleData && <p className="scholarship-source">Nguồn văn bản quyết định: {visibleData.campaign.sourceUrl ? <a href={visibleData.campaign.sourceUrl} target="_blank" rel="noopener noreferrer">{visibleData.campaign.sourceTitle}</a> : visibleData.campaign.sourceTitle} · {visibleData.campaign.sourceDocument}</p>}
      </section>
    </ScholarshipShell>
  );
};
