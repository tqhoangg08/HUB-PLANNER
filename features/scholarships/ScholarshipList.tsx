import React, { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScholarshipShell } from './ScholarshipShell';
import {
  fetchAllPublicCampaigns, fetchCampaignRecipients, fetchCampaignSummary, searchCampaignRecipients,
  formatScoreValue, ScholarshipApiError, type Campaign, type PaginatedRecipients,
} from '../../utils/scholarshipApi';
import { approvedScoreColumns, scholarshipPage, updateScholarshipParams } from '../../utils/scholarshipListModel';

const errorText = (error: unknown) => error instanceof ScholarshipApiError
  ? error.message : 'Không thể kết nối đến hệ thống học bổng. Vui lòng thử lại.';

export const ScholarshipList: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim().normalize('NFC');
  const slugParam = params.get('campaign') || '';
  const category = params.get('category') || '';
  const page = scholarshipPage(params.get('page'));
  const limit = [20, 30, 50].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 20;
  const [input, setInput] = useState(query);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState('');
  const [data, setData] = useState<PaginatedRecipients | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [summaryError, setSummaryError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const id = useId();
  const selected = slugParam ? campaigns.find(c => c.slug === slugParam) : campaigns[0];
  const slug = selected?.slug || '';
  const requestKey = JSON.stringify([slug, query, category, page, limit]);
  const pendingInput = input.trim().normalize('NFC') !== query;
  const shortQuery = query.length === 1;
  const visibleData = !pendingInput && !shortQuery && dataKey === requestKey ? data : null;
  const scoreColumns = visibleData ? approvedScoreColumns(visibleData.campaign) : [];
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
    setCategories([]); setSummaryError(false);
    if (slug) fetchCampaignSummary(slug, controller.signal).then(result => {
      if (!controller.signal.aborted) setCategories(result.awards.map(a => a.awardType));
    }).catch(() => { if (!controller.signal.aborted) setSummaryError(true); });
    return () => controller.abort();
  }, [slug, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(false);
    if (!slug || shortQuery || pendingInput || loadingCampaigns) return () => controller.abort();
    setLoading(true);
    const options = { page, limit, awardType: category || undefined };
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
  }, [slug, query, category, page, limit, shortQuery, pendingInput, loadingCampaigns, retry, requestKey, setParams]);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const disabled = loadingCampaigns || !selected;
  const message = campaignError || error || (slugParam && !selected && !loadingCampaigns
    ? 'Đợt học bổng đã chọn chưa được công bố hoặc không còn khả dụng.' : '');
  const busy = loadingCampaigns || loading || pendingInput;
  return (
    <ScholarshipShell title="Danh sách sinh viên nhận học bổng" subtitle="Tra cứu danh sách sinh viên nhận học bổng theo từng học kỳ." headerActions={
      <div className="scholarship-field scholarship-term"><label htmlFor={`${id}-term`}>Học kỳ / Năm học</label>
        <select id={`${id}-term`} className="scholarship-input" value={slugParam || slug} disabled={loadingCampaigns || !campaigns.length} onChange={e => update({ campaign: e.target.value, category: '', page: '' })}>
          {!campaigns.length && <option value="">{loadingCampaigns ? 'Đang tải học kỳ...' : campaignError ? 'Không tải được học kỳ' : 'Chưa có đợt công bố'}</option>}
          {slugParam && !selected && <option value={slugParam}>Đợt không khả dụng</option>}
          {campaigns.map(c => <option value={c.slug} key={c.slug}>{c.semester} / {c.schoolYear} — {c.title}</option>)}
        </select>
      </div>
    }>
      <section aria-label="Tra cứu sinh viên nhận học bổng">
        <div className="scholarship-surface scholarship-filters">
          <div className="scholarship-filter-grid">
            <div className="scholarship-field"><label htmlFor={`${id}-query`}>Tra cứu sinh viên</label>
              <input id={`${id}-query`} className="scholarship-input" type="search" autoComplete="off" maxLength={80} placeholder="Nhập mã sinh viên hoặc họ tên..." value={input} disabled={disabled} onChange={e => setInput(e.target.value)} />
            </div>
            <div className="scholarship-field"><label htmlFor={`${id}-award`}>Xếp loại học bổng</label>
              <select id={`${id}-award`} className="scholarship-input" value={category} disabled={disabled || summaryError} onChange={e => update({ category: e.target.value, page: '' })}>
                <option value="">Tất cả xếp loại</option>
                {[...new Set([...categories, ...(category ? [category] : [])])].map(value => <option key={value}>{value}</option>)}
              </select>
            </div>
          </div>
          {summaryError && <p role="status" className="scholarship-note">Chưa tải được xếp loại học bổng. <button className="scholarship-button" onClick={() => setRetry(n => n + 1)}>Thử lại</button></p>}
        </div>
        <div className="scholarship-surface scholarship-table-surface" aria-busy={busy}>
          {message ? <div className="scholarship-status" role="alert"><p>{message}</p><button className="scholarship-button" disabled={cooldown > 0} onClick={() => setRetry(n => n + 1)}>{cooldown ? `Thử lại sau ${cooldown} giây` : 'Thử lại'}</button></div>
            : busy ? <div className="scholarship-skeleton" role="status"><span className="sr-only">Đang tải danh sách học bổng...</span><div aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div className="scholarship-skeleton-row" key={i}>{Array.from({ length: 4 }, (_, j) => <span key={j} />)}</div>)}</div></div>
            : !campaigns.length ? <div className="scholarship-status" role="status">Chưa có danh sách học bổng được công bố.</div>
            : shortQuery ? <div className="scholarship-status" role="status">Nhập ít nhất 2 ký tự để tra cứu.</div>
            : visibleData && !total ? <div className="scholarship-status" role="status">{query || category ? 'Không tìm thấy sinh viên phù hợp với bộ lọc.' : 'Đợt công bố này chưa có sinh viên nhận học bổng.'}</div>
            : visibleData && <>
              <div className="scholarship-table-scroll" tabIndex={0} role="region" aria-label="Bảng sinh viên nhận học bổng">
                <table className="scholarship-table"><caption className="sr-only">Danh sách sinh viên nhận học bổng — {visibleData.campaign.title}</caption><thead><tr>
                  {['STT', 'MSSV', 'Họ và tên', 'Mã lớp SV', 'Ngành học'].map(label => <th scope="col" key={label}>{label}</th>)}
                  {scoreColumns.map(c => <th scope="col" key={c.key} className="scholarship-number">{c.label}</th>)}<th scope="col">Xếp loại HB</th>
                </tr></thead><tbody>{visibleData.recipients.map((r, i) => <tr key={r.id}>
                  <td className="scholarship-number">{(page - 1) * limit + i + 1}</td><td>{r.studentCode}</td><td>{r.fullName}</td><td>{r.className || '—'}</td><td>{r.major || '—'}</td>
                  {scoreColumns.map(c => <td key={c.key} className="scholarship-number">{formatScoreValue(r.scores[c.key])}</td>)}<td>{r.awardType}</td>
                </tr>)}</tbody></table>
              </div>
              <div className="scholarship-mobile-list">{visibleData.recipients.map((r, i) => <details key={r.id}><summary>{(page - 1) * limit + i + 1}. {r.fullName}<small>{r.studentCode} · {r.awardType}</small></summary><dl>
                <dt>Mã lớp SV</dt><dd>{r.className || '—'}</dd><dt>Ngành học</dt><dd>{r.major || '—'}</dd>
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
