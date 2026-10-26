import { Overlay } from '../Overlay';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './eventFilters.css';
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Filter,
  Globe2,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  createDefaultEventFilters,
  EVENT_SORT_OPTIONS,
  EVENT_STATUS_OPTIONS,
  EventDatePreset,
  EventFilters,
  EventSortBy,
  formatEventFilterDate,
  getEventFilterCount,
  getPresetDateRange,
} from '../../utils/eventFilters';

interface EventFilterControlsProps {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
  regions: string[];
  eventTypes: string[];
  loading?: boolean;
  onRefresh: () => void;
  onOpenGuide: () => void;
  onPrimaryAction?: React.MouseEventHandler<HTMLButtonElement>;
  primaryActionLabel?: string;
  primaryActionIcon?: React.ReactNode;
  extraActions?: React.ReactNode;
  compact?: boolean;
  pageLayout?: boolean;
}

const controlClass = 'event-filter-control rounded-lg border border-[#D8E0EC] bg-white text-[13px] font-semibold text-[#243653] outline-none transition focus:border-[#1769E0] focus:ring-2 focus:ring-blue-100';

const IconButton = ({ label, onClick, children, loading }: { label: string; onClick: React.MouseEventHandler<HTMLButtonElement>; children: React.ReactNode; loading?: boolean }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} disabled={loading} className={`${controlClass} flex w-11 shrink-0 items-center justify-center hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60`}>
    {children}<span className="event-filter-action-label">{label}</span>
  </button>
);

const DateRangeLabel = ({ filters }: { filters: EventFilters }) => {
  if (filters.datePreset === 'all' || (!filters.dateFrom && !filters.dateTo)) return <>Chọn thời gian</>;
  if (filters.datePreset === 'thisMonth') return <>Tháng này</>;
  if (filters.datePreset === 'nextMonth') return <>Tháng tới</>;
  return <>{formatEventFilterDate(filters.dateFrom) || '...'} – {formatEventFilterDate(filters.dateTo) || '...'}</>;
};

export const EventFilterControls: React.FC<EventFilterControlsProps> = ({
  filters,
  onChange,
  regions,
  eventTypes,
  loading = false,
  onRefresh,
  onOpenGuide,
  onPrimaryAction,
  primaryActionLabel = 'Gửi đóng góp',
  primaryActionIcon,
  extraActions,
  compact = false,
  pageLayout = false,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const [keyword, setKeyword] = useState(filters.keyword);
  const [dateError, setDateError] = useState('');
  const [drawerSection, setDrawerSection] = useState<'top' | 'date' | 'sort' | 'actions'>('top');
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dateSectionRef = useRef<HTMLFieldSetElement>(null);
  const sortSectionRef = useRef<HTMLLabelElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const changed = () => setWide(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);

  useEffect(() => setKeyword(filters.keyword), [filters.keyword]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = latest.current;
      if (keyword !== current.filters.keyword) current.onChange({ ...current.filters, keyword });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [keyword, filters.keyword]);

  const openDrawer = (section: typeof drawerSection, origin: HTMLElement) => {
    returnFocus.current = origin;
    setDraftFilters({ ...filters, keyword });
    setDateError('');
    setDrawerSection(section);
    setDrawerOpen(true);
  };
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useLayoutEffect(() => {
    if (!drawerOpen) {
      const previous = returnFocus.current;
      if (previous) {
        (previous.isConnected && previous.getClientRects().length ? previous : triggerRef.current)?.focus({ preventScroll: true });
        returnFocus.current = null;
      }
      return;
    }
    const section = drawerSection === 'date' ? dateSectionRef.current : drawerSection === 'sort' ? sortSectionRef.current : null;
    // Move only the sheet's scroller. scrollIntoView also scrolls ancestors.
    if (section && contentRef.current) {
      contentRef.current.scrollTop += section.getBoundingClientRect().top - contentRef.current.getBoundingClientRect().top;
    }
    (section || drawerRef.current?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  }, [drawerOpen, drawerSection]);

  useEffect(() => {
    if (!drawerOpen) return;
    const root = drawerRef.current?.closest<HTMLElement>('[data-overlay-root]');
    const isTop = () => !Array.from(document.querySelectorAll<HTMLElement>('.overlay-root, [data-overlay-root], .swal2-container'))
      .some(element => element !== root && Number(getComputedStyle(element).zIndex) > Number(root && getComputedStyle(root).zIndex) && element.getClientRects().length);
    const controls = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button, input, select, [tabindex]') || [])
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
      if (event.key !== 'Tab') return;
      const elements = controls(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !drawerRef.current?.contains(event.target as Node)) controls()[0]?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('focusin', onFocus); };
  }, [drawerOpen, closeDrawer]);

  const count = getEventFilterCount(filters);
  const chips = useMemo(() => {
    const result: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.region !== 'all') result.push({ key: 'region', label: `Khu vực: ${filters.region}`, clear: () => onChange({ ...filters, region: 'all' }) });
    if (filters.eventType !== 'all') result.push({ key: 'type', label: `Loại hình: ${filters.eventType}`, clear: () => onChange({ ...filters, eventType: 'all' }) });
    if (filters.datePreset !== 'all' && (filters.dateFrom || filters.dateTo)) result.push({ key: 'date', label: `Thời gian: ${formatEventFilterDate(filters.dateFrom) || '...'} – ${formatEventFilterDate(filters.dateTo) || '...'}`, clear: () => onChange({ ...filters, datePreset: 'all', dateFrom: '', dateTo: '' }) });
    if (filters.trainingCategories.length) result.push({ key: 'categories', label: filters.trainingCategories.length === 1 ? `Mục: Mục ${filters.trainingCategories[0]}` : `Mục rèn luyện: ${filters.trainingCategories.length} mục`, clear: () => onChange({ ...filters, trainingCategories: [] }) });
    if (filters.registrationStatus !== 'all') result.push({ key: 'status', label: `Trạng thái: ${EVENT_STATUS_OPTIONS.find((item) => item.value === filters.registrationStatus)?.label}`, clear: () => onChange({ ...filters, registrationStatus: 'all' }) });
    if (filters.sortBy !== 'newest') result.push({ key: 'sort', label: `Sắp xếp: ${EVENT_SORT_OPTIONS.find((item) => item.value === filters.sortBy)?.label}`, clear: () => onChange({ ...filters, sortBy: 'newest' }) });
    return result;
  }, [filters, onChange]);

  const updateDatePreset = (preset: EventDatePreset) => {
    const range = getPresetDateRange(preset);
    setDraftFilters((current) => ({ ...current, datePreset: preset, ...(preset === 'thisMonth' || preset === 'nextMonth' ? range : preset === 'all' ? { dateFrom: '', dateTo: '' } : {}) }));
    setDateError('');
  };

  const applyDraft = () => {
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setDateError('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      return;
    }
    setKeyword(draftFilters.keyword);
    onChange(draftFilters);
    closeDrawer();
  };

  const resetAll = () => {
    const defaults = createDefaultEventFilters();
    setKeyword('');
    setDraftFilters(defaults);
    onChange(defaults);
  };

  const actions = <>
    <IconButton label="Làm mới dữ liệu" onClick={onRefresh} loading={loading}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></IconButton>
    <IconButton label="Xem hướng dẫn điểm rèn luyện" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onOpenGuide(); }}><FileText size={17} /></IconButton>
    {extraActions}
    {onPrimaryAction && <button type="button" onClick={onPrimaryAction} className={`${controlClass} flex items-center justify-center gap-2 !border-[#003375] !bg-[#003375] px-4 !text-white hover:!bg-[#002855]`}>
      {primaryActionIcon || <PlusCircle size={17} />}<span>{primaryActionLabel}</span>
    </button>}
  </>;
  return (
    <div className={`event-filter-controls ${compact ? 'event-filter-compact' : ''} ${pageLayout ? 'event-filter-page' : ''}`}>
      <div className="event-filter-toolbar">
        <label className="relative min-w-0">
          <span className="sr-only">Tìm kiếm sự kiện</span>
          <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8795AA]" />
          <input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm tên, BTC, loại hình..." className={`${controlClass} w-full pl-10 pr-3`} />
        </label>
        <div className="event-filter-row">
          <button ref={triggerRef} type="button" onClick={event => openDrawer('top', event.currentTarget)} className={`${controlClass} event-filter-open flex items-center justify-center gap-2 !border-blue-200 !bg-blue-50 px-3.5 !text-[#064B9B] hover:!bg-blue-100`}>
            <Filter size={16} />Bộ lọc{count > 0 ? ` (${count})` : ''}
          </button>
          {wide ? <>
            <button type="button" onClick={event => openDrawer('date', event.currentTarget)} className={`${controlClass} event-filter-date-trigger flex items-center gap-2 px-3.5 text-left`}>
              <CalendarDays size={16} className="shrink-0 text-[#56708E]" /><span><DateRangeLabel filters={filters} /></span>
            </button>
            <label className="event-filter-sort relative">
              <span className="sr-only">Sắp xếp sự kiện</span>
              <ArrowDownUp size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#56708E]" />
              <select value={filters.sortBy} onChange={event => onChange({ ...filters, sortBy: event.target.value as EventSortBy })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}>
                {EVENT_SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" />
            </label>
          </> : <>
            <button type="button" onClick={event => openDrawer('sort', event.currentTarget)} className={`${controlClass} event-filter-sort-trigger flex items-center justify-center gap-2 px-3`}><ArrowDownUp size={16} />Sắp xếp</button>
            <button type="button" aria-label="Thao tác sự kiện" title="Thao tác sự kiện" onClick={event => openDrawer('actions', event.currentTarget)} className={`${controlClass} event-filter-more flex items-center justify-center`}><MoreHorizontal size={20} /></button>
          </>}
          {/* Preserve modal return targets across responsive breakpoint changes. */}
          {drawerSection !== 'actions' || !drawerOpen ? <div hidden={!wide} className="event-filter-inline-actions">{pageLayout ? <>
            <IconButton label="Làm mới dữ liệu" onClick={onRefresh} loading={loading}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></IconButton>
            {extraActions}
          </> : actions}</div> : null}
        </div>
      </div>

        <div className="event-filter-chips" aria-label="Bộ lọc đang áp dụng">
          {chips.map((chip) => (
            <span key={chip.key} className="event-filter-chip rounded-lg border border-blue-200 bg-blue-50 text-[12px] font-semibold text-[#064B9B]">
              <span>{chip.label}</span>
              <button type="button" onClick={chip.clear} aria-label={`Xóa ${chip.label}`} className="event-filter-chip-remove rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"><X size={13} /></button>
            </span>
          ))}
          {chips.length > 0 && <button type="button" onClick={resetAll} className="inline-flex min-h-8 items-center gap-1.5 px-1 text-[12px] font-bold text-[#064B9B] hover:underline"><Trash2 size={14} /> Xóa tất cả</button>}
        </div>

      {drawerOpen && (
        <Overlay className="event-filter-overlay fixed inset-0 z-[1000]" role="presentation">
          <button type="button" aria-label="Đóng bộ lọc" onClick={closeDrawer} className="absolute inset-0 cursor-default bg-slate-950/25" />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="event-filter-title" className="event-filter-panel bg-white shadow-[-10px_0_30px_rgba(15,35,65,0.14)]">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E3E8F0] px-5">
              <h3 id="event-filter-title" className="text-lg font-black text-[#10213E]">{drawerSection === 'actions' ? 'Thao tác sự kiện' : 'Bộ lọc'}</h3>
              <button type="button" onClick={closeDrawer} aria-label="Đóng bộ lọc" className="event-filter-close rounded-lg text-[#66758D] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"><X size={21} /></button>
            </header>

            <div ref={contentRef} className="event-filter-content flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {drawerSection === 'actions' ? <div className="event-filter-sheet-actions" onClick={event => { if ((event.target as HTMLElement).closest('button')) closeDrawer(); }}>{actions}</div> : <>
              <label className="block" htmlFor="event-filter-keyword">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Từ khóa</span>
                <span className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><input id="event-filter-keyword" value={draftFilters.keyword} onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="Tìm tên sự kiện, BTC, mô tả..." className={`${controlClass} w-full pl-9 pr-3`} /></span>
              </label>

              <label className="block" htmlFor="event-filter-region">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Khu vực</span>
                <span className="relative block"><Globe2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><select id="event-filter-region" value={draftFilters.region} onChange={(event) => setDraftFilters({ ...draftFilters, region: event.target.value })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}><option value="all">Tất cả khu vực</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /></span>
              </label>

              <label className="block" htmlFor="event-filter-type">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Loại hình</span>
                <span className="relative block"><Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><select id="event-filter-type" value={draftFilters.eventType} onChange={(event) => setDraftFilters({ ...draftFilters, eventType: event.target.value })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}><option value="all">Tất cả loại hình</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /></span>
              </label>

              <fieldset ref={dateSectionRef} tabIndex={-1} className="event-filter-focus-section">
                <legend className="mb-2 text-[13px] font-bold text-[#253751]">Thời gian</legend>
                <div className="space-y-2">
                  {([['all', 'Tất cả thời gian'], ['custom', 'Khoảng thời gian'], ['thisMonth', 'Tháng này'], ['nextMonth', 'Tháng tới'], ['other', 'Tùy chọn khác']] as Array<[EventDatePreset, string]>).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#43536B]"><input type="radio" name="event-date-preset" value={value} checked={draftFilters.datePreset === value} onChange={() => updateDatePreset(value)} className="h-4 w-4 accent-[#1769E0]" />{label}</label>
                  ))}
                </div>
                {(draftFilters.datePreset === 'custom' || draftFilters.datePreset === 'other') && (
                  <div className="event-filter-date-range mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <label><span className="sr-only">Từ ngày</span><input type="date" value={draftFilters.dateFrom} onChange={(event) => { setDateError(''); setDraftFilters({ ...draftFilters, dateFrom: event.target.value }); }} className={`${controlClass} w-full px-2 text-[12px]`} /></label>
                    <span className="text-[#8795AA]">–</span>
                    <label><span className="sr-only">Đến ngày</span><input type="date" value={draftFilters.dateTo} min={draftFilters.dateFrom || undefined} onChange={(event) => { setDateError(''); setDraftFilters({ ...draftFilters, dateTo: event.target.value }); }} className={`${controlClass} w-full px-2 text-[12px]`} /></label>
                  </div>
                )}
                {dateError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{dateError}</p>}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[13px] font-bold text-[#253751]">Mục rèn luyện</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2 text-[13px] text-[#43536B]"><input type="checkbox" checked={draftFilters.trainingCategories.length === 0} onChange={() => setDraftFilters({ ...draftFilters, trainingCategories: [] })} className="h-4 w-4 rounded accent-[#1769E0]" />Tất cả mục</label>
                  {['I', 'II', 'III', 'IV', 'V'].map((category) => <label key={category} className="flex items-center gap-2 text-[13px] text-[#43536B]"><input type="checkbox" checked={draftFilters.trainingCategories.includes(category)} onChange={() => { const selected = draftFilters.trainingCategories.includes(category) ? draftFilters.trainingCategories.filter((item) => item !== category) : [...draftFilters.trainingCategories, category]; setDraftFilters({ ...draftFilters, trainingCategories: selected.length === 5 ? [] : selected }); }} className="h-4 w-4 rounded accent-[#1769E0]" />Mục {category}</label>)}
                </div>
              </fieldset>

              <label className="block" htmlFor="event-filter-status"><span className="mb-2 block text-[13px] font-bold text-[#253751]">Trạng thái đăng ký</span><select id="event-filter-status" value={draftFilters.registrationStatus} onChange={(event) => setDraftFilters({ ...draftFilters, registrationStatus: event.target.value as EventFilters['registrationStatus'] })} className={`${controlClass} w-full px-3`}>{EVENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label ref={sortSectionRef} tabIndex={-1} className="event-filter-focus-section block" htmlFor="event-filter-sort"><span className="mb-2 block text-[13px] font-bold text-[#253751]">Sắp xếp</span><select id="event-filter-sort" value={draftFilters.sortBy} onChange={(event) => setDraftFilters({ ...draftFilters, sortBy: event.target.value as EventSortBy })} className={`${controlClass} w-full px-3`}>{EVENT_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </>}
            </div>

            {drawerSection !== 'actions' && <footer className="grid shrink-0 grid-cols-[auto_1fr] gap-2.5 border-t border-[#E3E8F0] bg-white p-4">
              <button type="button" onClick={() => { setDraftFilters(createDefaultEventFilters()); setDateError(''); }} className={`${controlClass} flex items-center justify-center gap-2 px-4 hover:bg-slate-50`}><RotateCcw size={16} /> Đặt lại</button>
            <button type="button" onClick={applyDraft} disabled={loading} className={`${controlClass} flex items-center justify-center gap-2 !border-[#1769E0] !bg-[#1769E0] px-4 !text-white hover:!bg-[#0F5BC5] disabled:opacity-60`}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Áp dụng bộ lọc</button>
            </footer>}
          </div>
        </Overlay>
      )}
    </div>
  );
};
