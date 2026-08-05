import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Filter,
  Globe2,
  Loader2,
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
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  primaryActionIcon?: React.ReactNode;
  extraActions?: React.ReactNode;
  compact?: boolean;
}

const controlClass = 'h-11 rounded-lg border border-[#D8E0EC] bg-white text-[13px] font-semibold text-[#243653] outline-none transition focus:border-[#1769E0] focus:ring-2 focus:ring-blue-100';

const IconButton = ({ label, onClick, children, loading }: { label: string; onClick: () => void; children: React.ReactNode; loading?: boolean }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} disabled={loading} className={`${controlClass} flex w-11 shrink-0 items-center justify-center hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60`}>
    {children}
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
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const [keyword, setKeyword] = useState(filters.keyword);
  const [dateError, setDateError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dateSectionRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => setKeyword(filters.keyword), [filters.keyword]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (keyword !== filters.keyword) onChange({ ...filters, keyword });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [keyword, filters, onChange]);

  const openDrawer = (focusDate = false) => {
    setDraftFilters(filters);
    setDateError('');
    setDrawerOpen(true);
    window.setTimeout(() => {
      if (focusDate) dateSectionRef.current?.scrollIntoView({ block: 'center' });
      const focusable = drawerRef.current?.querySelector<HTMLElement>('button, input, select');
      focusable?.focus();
    }, 40);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

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
    onChange({ ...draftFilters, keyword });
    closeDrawer();
  };

  const resetAll = () => {
    const defaults = createDefaultEventFilters();
    setKeyword('');
    setDraftFilters(defaults);
    onChange(defaults);
  };

  return (
    <>
      <div className={`grid w-full gap-2.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 xl:flex xl:items-center'}`}>
        <label className={`relative ${compact ? 'col-span-2' : 'col-span-2 xl:min-w-[280px] xl:flex-1'}`}>
          <span className="sr-only">Tìm kiếm sự kiện</span>
          <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8795AA]" />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên, BTC, loại hình..." className={`${controlClass} w-full pl-10 pr-3`} />
        </label>
        <button ref={triggerRef} type="button" onClick={() => openDrawer()} className={`${controlClass} flex shrink-0 items-center justify-center gap-2 !border-blue-200 !bg-blue-50 px-3.5 !text-[#064B9B] hover:!bg-blue-100`}>
          <Filter size={16} />
          Bộ lọc{count > 0 ? ` (${count})` : ''}
        </button>
        <button type="button" onClick={() => openDrawer(true)} className={`${controlClass} hidden min-w-[188px] items-center gap-2 px-3.5 text-left lg:flex`}>
          <CalendarDays size={16} className="shrink-0 text-[#56708E]" />
          <span className="min-w-0 flex-1 truncate"><DateRangeLabel filters={filters} /></span>
        </button>
        <label className="relative min-w-0">
          <span className="sr-only">Sắp xếp sự kiện</span>
          <ArrowDownUp size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#56708E]" />
          <select value={filters.sortBy} onChange={(event) => onChange({ ...filters, sortBy: event.target.value as EventSortBy })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}>
            {EVENT_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" />
        </label>
        <div className={`${compact ? 'col-span-2' : 'col-span-2 xl:col-span-1'} flex items-center justify-end gap-2`}>
          <IconButton label="Làm mới dữ liệu" onClick={onRefresh} loading={loading}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></IconButton>
          <IconButton label="Xem hướng dẫn điểm rèn luyện" onClick={onOpenGuide}><FileText size={17} /></IconButton>
          {extraActions}
          {onPrimaryAction && (
            <button type="button" onClick={onPrimaryAction} className={`${controlClass} flex items-center justify-center gap-2 !border-[#003375] !bg-[#003375] px-4 !text-white hover:!bg-[#002855]`}>
              {primaryActionIcon || <PlusCircle size={17} />}
              <span>{primaryActionLabel}</span>
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang áp dụng">
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-[#064B9B]">
              <span className="truncate">{chip.label}</span>
              <button type="button" onClick={chip.clear} aria-label={`Xóa ${chip.label}`} className="rounded p-0.5 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"><X size={13} /></button>
            </span>
          ))}
          <button type="button" onClick={resetAll} className="inline-flex min-h-8 items-center gap-1.5 px-1 text-[12px] font-bold text-[#064B9B] hover:underline"><Trash2 size={14} /> Xóa tất cả</button>
        </div>
      )}

      {drawerOpen && createPortal(
        <div className="fixed inset-0 z-[1000]" role="presentation">
          <button type="button" aria-label="Đóng bộ lọc" onClick={closeDrawer} className="absolute inset-0 cursor-default bg-slate-950/25" />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="event-filter-title" className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-t-2xl bg-white shadow-[-10px_0_30px_rgba(15,35,65,0.14)] sm:inset-y-0 sm:left-auto sm:w-[min(400px,88vw)] sm:max-h-none sm:rounded-none">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E3E8F0] px-5">
              <h3 id="event-filter-title" className="text-lg font-black text-[#10213E]">Bộ lọc</h3>
              <button type="button" onClick={closeDrawer} aria-label="Đóng bộ lọc" className="rounded-lg p-2 text-[#66758D] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"><X size={21} /></button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <label className="block" htmlFor="event-filter-keyword">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Từ khóa</span>
                <span className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><input id="event-filter-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên sự kiện, BTC, mô tả..." className={`${controlClass} w-full pl-9 pr-3`} /></span>
              </label>

              <label className="block" htmlFor="event-filter-region">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Khu vực</span>
                <span className="relative block"><Globe2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><select id="event-filter-region" value={draftFilters.region} onChange={(event) => setDraftFilters({ ...draftFilters, region: event.target.value })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}><option value="all">Tất cả khu vực</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /></span>
              </label>

              <label className="block" htmlFor="event-filter-type">
                <span className="mb-2 block text-[13px] font-bold text-[#253751]">Loại hình</span>
                <span className="relative block"><Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /><select id="event-filter-type" value={draftFilters.eventType} onChange={(event) => setDraftFilters({ ...draftFilters, eventType: event.target.value })} className={`${controlClass} w-full appearance-none pl-9 pr-8`}><option value="all">Tất cả loại hình</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8795AA]" /></span>
              </label>

              <fieldset ref={dateSectionRef} className="scroll-mt-5">
                <legend className="mb-2 text-[13px] font-bold text-[#253751]">Thời gian</legend>
                <div className="space-y-2">
                  {([['all', 'Tất cả thời gian'], ['custom', 'Khoảng thời gian'], ['thisMonth', 'Tháng này'], ['nextMonth', 'Tháng tới'], ['other', 'Tùy chọn khác']] as Array<[EventDatePreset, string]>).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#43536B]"><input type="radio" name="event-date-preset" value={value} checked={draftFilters.datePreset === value} onChange={() => updateDatePreset(value)} className="h-4 w-4 accent-[#1769E0]" />{label}</label>
                  ))}
                </div>
                {(draftFilters.datePreset === 'custom' || draftFilters.datePreset === 'other') && (
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
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
              <label className="block" htmlFor="event-filter-sort"><span className="mb-2 block text-[13px] font-bold text-[#253751]">Sắp xếp</span><select id="event-filter-sort" value={draftFilters.sortBy} onChange={(event) => setDraftFilters({ ...draftFilters, sortBy: event.target.value as EventSortBy })} className={`${controlClass} w-full px-3`}>{EVENT_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>

            <footer className="grid shrink-0 grid-cols-[auto_1fr] gap-2.5 border-t border-[#E3E8F0] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => { setDraftFilters(createDefaultEventFilters()); setKeyword(''); setDateError(''); }} className={`${controlClass} flex items-center justify-center gap-2 px-4 hover:bg-slate-50`}><RotateCcw size={16} /> Đặt lại</button>
            <button type="button" onClick={applyDraft} disabled={loading} className={`${controlClass} flex items-center justify-center gap-2 !border-[#1769E0] !bg-[#1769E0] px-4 !text-white hover:!bg-[#0F5BC5] disabled:opacity-60`}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Áp dụng bộ lọc</button>
            </footer>
          </div>
        </div>, document.body
      )}
    </>
  );
};
