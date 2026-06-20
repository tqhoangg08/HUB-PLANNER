import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CircleCheckBig,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  SquareArrowOutUpRight,
  ThumbsDown,
  WandSparkles,
  X,
  BadgeInfo,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { formatDate, formatTime } from '../utils/dateUtils';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { useUserRole } from '../hooks/useUserRole';
import { apiUrl } from '../utils/api';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | string;

interface EventCandidate {
  id: string;
  source_name: string;
  post_url: string;
  raw_content: string;
  image_url?: string | null;
  submitted_from?: string | null;
  client_created_at?: string | null;
  review_status?: ReviewStatus;
  ai_is_event?: boolean | null;
  ai_confidence?: number | string | null;
  ai_reason?: string | null;
  ai_result?: any;
  approved_event_id?: number | null;
  reviewed_at?: string | null;
  created_at?: string | null;
}

interface EventDraft {
  title: string;
  organizer: string;
  category: string;
  criteria: string;
  points: string;
  format: string;
  link: string;
  location_type: string;
  classification: string;
  event_date: string;
  event_time: string;
  deadline: string;
  deadline_time: string;
  registration_start_date: string;
  registration_start_time: string;
  description: string;
  status: string;
  close_on_full: boolean;
  is_manually_closed: boolean;
}

const EVENT_CATEGORIES = [
  'Hoạt động phong trào',
  'Minigame',
  'Tình nguyện',
  'Cuộc thi học thuật',
  'Cổ vũ',
  'Talkshow',
  'Tọa đàm',
  'Hội thảo',
  'Sự kiện offline',
  'Teambuilding',
  'Hoạt động thể thao',
  'Khác (Tự nhập)',
];
const DEFAULT_EVENT_CATEGORY = EVENT_CATEGORIES[0];

const REVIEW_TABS: Array<{ key: 'pending' | 'approved' | 'rejected' | 'all'; label: string }> = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Từ chối' },
  { key: 'all', label: 'Tất cả' },
];

const defaultDraft = (): EventDraft => ({
  title: '',
  organizer: '',
  category: DEFAULT_EVENT_CATEGORY,
  criteria: 'III',
  points: '3',
  format: 'Offline',
  link: '',
  location_type: 'Trong trường',
  classification: '',
  event_date: '',
  event_time: '',
  deadline: '',
  deadline_time: '',
  registration_start_date: '',
  registration_start_time: '',
  description: '',
  status: 'Đang diễn ra',
  close_on_full: false,
  is_manually_closed: false,
});

const normalizeCategory = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_EVENT_CATEGORY;
  return EVENT_CATEGORIES.includes(text) ? text : DEFAULT_EVENT_CATEGORY;
};

const normalizeTimeForInput = (value?: string | null) => {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${String(match[2]).padStart(2, '0')}`;
}

const normalizeAiResult = (candidate: EventCandidate | null) => {
  if (!candidate?.ai_result || typeof candidate.ai_result !== 'object') return null;
  return candidate.ai_result;
};

const buildDraftFromCandidate = (candidate: EventCandidate | null): EventDraft => {
  const ai = normalizeAiResult(candidate);
  return {
    title: ai?.title || '',
    organizer: ai?.organizer || candidate?.source_name || '',
    category: normalizeCategory(ai?.category),
    criteria: ai?.criteria || 'III',
    points: ai?.points !== undefined && ai?.points !== null ? String(ai.points) : '3',
    format: ai?.format || 'Offline',
    link: candidate?.post_url || ai?.link || '',
    location_type: ai?.location_type || 'Trong trường',
    classification: ai?.classification || '',
    event_date: ai?.event_date || '',
    event_time: normalizeTimeForInput(ai?.event_time),
    deadline: ai?.deadline || '',
    deadline_time: normalizeTimeForInput(ai?.deadline_time),
    registration_start_date: ai?.registration_start_date || '',
    registration_start_time: normalizeTimeForInput(ai?.registration_start_time),
    description: candidate?.raw_content || ai?.description || '',
    status: 'Đang diễn ra',
    close_on_full: false,
    is_manually_closed: false,
  };
};
const getStatusBadge = (status?: ReviewStatus) => {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'approved') return 'bg-green-50 text-green-700 border-green-200';
  if (normalized === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const getAiBadge = (candidate: EventCandidate) => {
  if (candidate.ai_is_event === null || candidate.ai_is_event === undefined) {
    return 'bg-gray-50 text-gray-600 border-gray-200';
  }
  if (candidate.ai_is_event) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
};

const CandidateDetailModal = ({
  candidate,
  draft,
  onClose,
  onDraftChange,
  onAnalyze,
  onApprove,
  onReject,
  analyzing,
  approving,
  rejecting,
}: {
  candidate: EventCandidate | null;
  draft: EventDraft;
  onClose: () => void;
  onDraftChange: (draft: EventDraft) => void;
  onAnalyze: () => void;
  onApprove: () => void;
  onReject: () => void;
  analyzing: boolean;
  approving: boolean;
  rejecting: boolean;
}) => {
  if (!candidate) return null;

  const aiResult = normalizeAiResult(candidate);

  return createPortal(
    <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col">
        <div className="bg-[#003375] text-white px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold truncate">{candidate.source_name}</h2>
            <div className="text-[11px] sm:text-xs text-blue-100 mt-0.5 truncate">{candidate.post_url}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 xl:grid-cols-[1.08fr_0.92fr] gap-3 p-3 sm:p-4">
            <div className="space-y-4 min-w-0">
              <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusBadge(candidate.review_status)}`}>
                    {String(candidate.review_status || 'pending').toUpperCase()}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getAiBadge(candidate)}`}>
                    AI {candidate.ai_confidence !== null && candidate.ai_confidence !== undefined ? `â€¢ ${Number(candidate.ai_confidence).toFixed(2)}` : ''}
                  </span>
                  {candidate.approved_event_id ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-green-50 text-green-700 border-green-200">
                      Đã tạo event #{candidate.approved_event_id}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">Nguồn</div>
                    <div className="font-semibold text-gray-900">{candidate.source_name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">Nguồn gửi</div>
                    <div className="font-semibold text-gray-900">{candidate.submitted_from || 'unknown'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">Tạo lúc</div>
                    <div className="font-semibold text-gray-900">
                      {candidate.created_at ? `${formatDate(candidate.created_at)} ${formatTime(candidate.created_at)}` : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">Client created</div>
                    <div className="font-semibold text-gray-900">
                      {candidate.client_created_at ? `${formatDate(candidate.client_created_at)} ${formatTime(candidate.client_created_at)}` : '---'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={candidate.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#003375] text-[#003375] font-semibold text-xs hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={14} /> Mở bài gốc
                  </a>
                  {candidate.approved_event_id ? (
                    <Link
                      to={`/events/${candidate.approved_event_id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition-colors"
                    >
                      <SquareArrowOutUpRight size={14} /> Mở sự kiện
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <FileText size={16} className="text-[#003375]" /> Nội dung gốc
                  </h3>
                </div>
                <pre className="whitespace-pre-wrap break-words text-[13px] leading-6 text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-60 overflow-auto custom-scrollbar">
                  {candidate.raw_content}
                </pre>
                {candidate.image_url ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Ảnh đính kèm</div>
                    <img src={candidate.image_url} alt="Candidate" className="w-full max-h-64 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                  </div>
                ) : null}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles size={16} className="text-[#003375]" /> Kết quả AI
                  </h3>
                  <button
                    type="button"
                    onClick={onAnalyze}
                    disabled={analyzing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003375] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {analyzing ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />} Phân tích AI
                  </button>
                </div>

                {aiResult ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                    <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-500 mb-1">is_event</div>
                      <div className="font-bold text-gray-900">{String(aiResult.is_event)}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-500 mb-1">confidence</div>
                      <div className="font-bold text-gray-900">{Number(candidate.ai_confidence || aiResult.confidence || 0).toFixed(2)}</div>
                    </div>
                    <div className="sm:col-span-2 rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-500 mb-1">reason</div>
                      <div className="font-medium text-gray-800 leading-6">{candidate.ai_reason || aiResult.reason || '---'}</div>
                    </div>
                    <div className="sm:col-span-2 rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-500 mb-2">JSON</div>
                      <pre className="text-xs whitespace-pre-wrap break-words text-gray-700 overflow-auto max-h-56 custom-scrollbar">
                        {JSON.stringify(aiResult, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
                    Chưa có kết quả AI. Bấm “Phân tích AI” để tạo bản nháp.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={18} className="text-[#003375]" />
                  <h3 className="font-bold text-gray-900">Bản nháp sự kiện</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Tiêu đề *</span>
                    <input
                      value={draft.title}
                      onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Link</span>
                    <input
                      value={draft.link}
                      onChange={(e) => onDraftChange({ ...draft, link: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Đơn vị tổ chức</span>
                    <input
                      value={draft.organizer}
                      onChange={(e) => onDraftChange({ ...draft, organizer: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Category</span>
                    <select
                      value={draft.category}
                      onChange={(e) => onDraftChange({ ...draft, category: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    >
                      {EVENT_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Criteria</span>
                    <input
                      value={draft.criteria}
                      onChange={(e) => onDraftChange({ ...draft, criteria: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Điểm</span>
                    <input
                      value={draft.points}
                      onChange={(e) => onDraftChange({ ...draft, points: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Format</span>
                    <select
                      value={draft.format}
                      onChange={(e) => onDraftChange({ ...draft, format: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    >
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Hỗn hợp">Hỗn hợp</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Location</span>
                    <select
                      value={draft.location_type}
                      onChange={(e) => onDraftChange({ ...draft, location_type: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    >
                      <option value="Trong trường">Trong trường</option>
                      <option value="Ngoài trường">Ngoài trường</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Phân loại</span>
                    <input
                      value={draft.classification}
                      onChange={(e) => onDraftChange({ ...draft, classification: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Ngày sự kiện</span>
                    <input
                      type="date"
                      value={draft.event_date}
                      onChange={(e) => onDraftChange({ ...draft, event_date: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Giờ sự kiện</span>
                    <input
                      type="time"
                      value={draft.event_time}
                      onChange={(e) => onDraftChange({ ...draft, event_time: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Deadline</span>
                    <input
                      type="date"
                      value={draft.deadline}
                      onChange={(e) => onDraftChange({ ...draft, deadline: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Giờ deadline</span>
                    <input
                      type="time"
                      value={draft.deadline_time}
                      onChange={(e) => onDraftChange({ ...draft, deadline_time: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Mở đăng ký</span>
                    <input
                      type="date"
                      value={draft.registration_start_date}
                      onChange={(e) => onDraftChange({ ...draft, registration_start_date: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Giờ mở</span>
                    <input
                      type="time"
                      value={draft.registration_start_time}
                      onChange={(e) => onDraftChange({ ...draft, registration_start_time: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Mô tả</span>
                    <textarea
                      rows={5}
                      value={draft.description}
                      onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375] resize-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 mb-1 block">Status</span>
                    <select
                      value={draft.status}
                      onChange={(e) => onDraftChange({ ...draft, status: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-[#003375] focus:border-[#003375]"
                    >
                      <option value="Sắp diễn ra">Sắp diễn ra</option>
                      <option value="Đang diễn ra">Đang diễn ra</option>
                      <option value="Đã kết thúc">Đã kết thúc</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 sm:col-span-2 pt-5">
                    <input
                      type="checkbox"
                      checked={draft.close_on_full}
                      onChange={(e) => onDraftChange({ ...draft, close_on_full: e.target.checked })}
                    />
                    <span className="text-sm font-semibold text-gray-700">Đóng đăng ký khi đầy</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={approving}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold disabled:opacity-60"
                >
                  {approving ? <Loader2 size={16} className="animate-spin" /> : <CircleCheckBig size={16} />} Duyệt & tạo sự kiện
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={rejecting}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-bold disabled:opacity-60"
                  >
                    {rejecting ? <Loader2 size={16} className="animate-spin" /> : <ThumbsDown size={16} />} Từ chối
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold"
                  >
                    <X size={16} /> Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const AdminEventCandidates: React.FC = () => {
  const { session, isAdmin, isAuditor, loading: roleLoading } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const [candidates, setCandidates] = useState<EventCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(defaultDraft());
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<'approve' | 'reject' | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => String(candidate.id) === String(selectedId)) || null,
    [candidates, selectedId]
  );

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const fetchCandidates = async () => {
    if (!session?.access_token) return;

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/event-candidates?review_status=all&limit=200'), {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Không tải được candidate');

      setCandidates(payload.candidates || []);
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || 'Không tải được danh sách candidate', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading && (isAdmin || isAuditor)) {
      fetchCandidates();
    }
  }, [roleLoading, isAdmin, isAuditor, session?.access_token]);

  useEffect(() => {
    const candidateId = searchParams.get('id');
    setSelectedId(candidateId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedCandidate) {
      setDraft(buildDraftFromCandidate(selectedCandidate));
    }
  }, [selectedCandidate?.id]);

  const filteredCandidates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const matchesTab =
        activeTab === 'all' ? true : String(candidate.review_status || 'pending').toLowerCase() === activeTab;
      const matchesSearch = !term
        || String(candidate.source_name || '').toLowerCase().includes(term)
        || String(candidate.post_url || '').toLowerCase().includes(term)
        || String(candidate.raw_content || '').toLowerCase().includes(term);
      return matchesTab && matchesSearch;
    });
  }, [candidates, activeTab, searchTerm]);

  const openCandidate = (candidate: EventCandidate) => {
    setSelectedId(String(candidate.id));
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('id', String(candidate.id));
      return next;
    });
  };

  const closeCandidate = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('id');
      return next;
    });
    setSelectedId(null);
  };

  const candidateApi = async (body: Record<string, any>) => {
    if (!session?.access_token) throw new Error('Thiếu phiên đăng nhập');
    const response = await fetch(apiUrl('/event-candidates'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Thao tác thất bại');
    return payload;
  };

  const analyzeCandidateApi = async (candidateId: string | number) => {
    if (!session?.access_token) throw new Error('Thiếu phiên đăng nhập');
    const response = await fetch(apiUrl(`/event-candidates-analyze?id=${candidateId}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const responseText = await response.text();
    let payload: any = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload?.error || 'Không phân tích được candidate';
      const details = payload?.details || (!payload && responseText ? responseText : '');
      const error = new Error([message, details].filter(Boolean).join('\n'));
      (error as any).details = payload?.details || null;
      throw error;
    }
    return payload;
  };

  const updateCandidateInState = (candidate: EventCandidate) => {
    setCandidates((prev) => prev.map((item) => (String(item.id) === String(candidate.id) ? { ...item, ...candidate } : item)));
  };

  const handleAnalyze = async (candidateId = selectedCandidate?.id) => {
    if (!candidateId) return;
    playClick();
    setAnalyzingId(String(candidateId));
    try {
      const payload = await analyzeCandidateApi(candidateId);
      if (payload?.candidate) {
        updateCandidateInState(payload.candidate);
        if (String(payload.candidate.id) === String(selectedId)) {
          setDraft(buildDraftFromCandidate(payload.candidate));
        }
      }
      showToast('Đã phân tích AI xong.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Không phân tích được candidate', 'error');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleReject = async (candidateId = selectedCandidate?.id) => {
    if (!candidateId) return;
    if (!(await showConfirm('Từ chối candidate này?'))) return;
    playClick();
    setSavingAction('reject');
    try {
      const payload = await candidateApi({ action: 'reject', id: candidateId });
      if (payload?.candidate) updateCandidateInState(payload.candidate);
      showToast('Đã từ chối candidate.', 'success');
      closeCandidate();
    } catch (error: any) {
      showToast(error?.message || 'Không từ chối được candidate', 'error');
    } finally {
      setSavingAction(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedCandidate) return;
    if (!draft.title.trim()) {
      showToast('Title là bắt buộc.', 'error');
      return;
    }
    if (!(await showConfirm('Duyệt candidate này và tạo sự kiện chính thức?'))) return;

    playClick();
    setSavingAction('approve');
    try {
      const payload = await candidateApi({
        action: 'approve',
        id: selectedCandidate.id,
        draft,
      });

      if (payload?.candidate) updateCandidateInState(payload.candidate);
      showToast('Đã duyệt và tạo sự kiện thành công.', 'success');
      closeCandidate();
    } catch (error: any) {
      showToast(error?.message || 'Không duyệt được candidate', 'error');
    } finally {
      setSavingAction(null);
    }
  };

  if (!roleLoading && !(isAdmin || isAuditor)) {
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto bg-white border border-gray-300 rounded-xl p-6">
          <div className="text-sm text-gray-500">Bạn không có quyền truy cập trang này.</div>
        </div>
      </div>
    );
  }

  const counts = {
    pending: candidates.filter((item) => String(item.review_status || 'pending') === 'pending').length,
    approved: candidates.filter((item) => String(item.review_status || '') === 'approved').length,
    rejected: candidates.filter((item) => String(item.review_status || '') === 'rejected').length,
    all: candidates.length,
  };

  return (
    <div className="w-full min-h-full bg-transparent">
      <div className="min-h-full w-full pb-0 text-[#0D1B3E]">
        <div className="w-full pt-1 pb-3 sm:pt-1 sm:pb-4">
        <div className="flex flex-col gap-2 sm:gap-2.5 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-black leading-tight tracking-normal text-[#003375]">Duyệt sự kiện</h1>
              <p className="mt-1 text-sm leading-snug text-gray-500">Kiểm tra bài đăng từ Extension, phân tích AI và duyệt thành sự kiện chính thức.</p>
            </div>
            <button
              type="button"
              onClick={() => fetchCandidates()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-[#003375] text-sm font-bold"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Tải lại
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-300 p-3.5">
            <div className="text-[11px] font-semibold text-gray-500">Tổng candidate</div>
            <div className="mt-1.5 text-2xl font-black leading-none text-[#003375]">{counts.all}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-300 p-3.5">
            <div className="text-[11px] font-semibold text-gray-500">Chờ duyệt</div>
            <div className="mt-1.5 text-2xl font-black leading-none text-amber-600">{counts.pending}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-300 p-3.5">
            <div className="text-[11px] font-semibold text-gray-500">Đã duyệt</div>
            <div className="mt-1.5 text-2xl font-black leading-none text-green-600">{counts.approved}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-300 p-3.5">
            <div className="text-[11px] font-semibold text-gray-500">Từ chối</div>
            <div className="mt-1.5 text-2xl font-black leading-none text-red-600">{counts.rejected}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
          <div className="p-4 border-b border-gray-300 flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm source, link hoặc nội dung..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-[#003375]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sm:flex-wrap sm:overflow-visible sm:pb-0">
              {REVIEW_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                    activeTab === tab.key
                      ? 'bg-[#003375] text-white border-[#003375]'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <colgroup>
              <col className="event-candidate-col-source" />
              <col />
              <col className="event-candidate-col-ai" />
              <col className="event-candidate-col-status" />
              <col className="event-candidate-col-created" />
              <col className="event-candidate-col-actions" />
            </colgroup>
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2.5">Nguồn</th>
                  <th className="text-left px-3 py-2.5">Bài đăng</th>
                  <th className="text-left px-3 py-2.5">AI</th>
                  <th className="text-left px-3 py-2.5">Trạng thái</th>
                  <th className="text-left px-3 py-2.5">Tạo lúc</th>
                  <th className="text-right px-3 py-2.5">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      <Loader2 className="inline animate-spin mr-2" size={18} /> Đang tải candidate...
                    </td>
                  </tr>
                ) : filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      Không có candidate nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <tr key={candidate.id} className="border-t border-gray-100 hover:bg-blue-50/30 transition-colors">
                      <td className="px-3 py-2.5 align-middle">
                        <div className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{candidate.source_name}</div>
                        <div className="text-[11px] text-gray-500 mt-1">{candidate.submitted_from || 'chrome_extension'}</div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <a href={candidate.post_url} target="_blank" rel="noreferrer" className="text-[#003375] font-semibold hover:underline block truncate text-sm leading-tight">
                          {candidate.post_url}
                        </a>
                        <div className="text-xs text-gray-600 line-clamp-1 mt-1.5 leading-snug">
                          {candidate.raw_content}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${getAiBadge(candidate)}`}>
                            {candidate.ai_is_event === null || candidate.ai_is_event === undefined ? 'Chưa phân tích' : candidate.ai_is_event ? 'Event' : 'Không phải event'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 text-[10px] font-bold whitespace-nowrap">
                            {candidate.ai_confidence !== null && candidate.ai_confidence !== undefined ? Number(candidate.ai_confidence).toFixed(2) : '--'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-snug">
                          {candidate.ai_reason || '---'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${getStatusBadge(candidate.review_status)}`}>
                          {String(candidate.review_status || 'pending')}
                        </span>
                        {candidate.approved_event_id ? (
                          <div className="text-[11px] text-green-600 font-semibold mt-1.5 whitespace-nowrap">Event #{candidate.approved_event_id}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-xs text-gray-600 whitespace-nowrap">
                        {candidate.created_at ? `${formatDate(candidate.created_at)} ${formatTime(candidate.created_at)}` : '---'}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex justify-end flex-nowrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCandidate(candidate)}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-[#003375] text-white text-xs font-bold whitespace-nowrap"
                          >
                            Xem chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAnalyze(candidate.id)}
                            disabled={analyzingId === candidate.id}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold whitespace-nowrap disabled:opacity-60"
                          >
                            {analyzingId === candidate.id ? <Loader2 size={14} className="inline animate-spin mr-1" /> : <WandSparkles size={14} className="inline mr-1" />}
                            AI
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(candidate.id)}
                            disabled={savingAction === 'reject'}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-bold whitespace-nowrap disabled:opacity-60"
                          >
                            <ThumbsDown size={14} className="inline mr-1" /> Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="hidden">
            {loading ? (
              <div className="py-16 text-center text-gray-500">
                <Loader2 className="inline animate-spin mr-2" size={18} /> Đang tải candidate...
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="py-16 text-center text-gray-500">Không có candidate nào phù hợp.</div>
            ) : (
              filteredCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-[20px] border border-[#EEF2FF] bg-[#F8FAFD] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 truncate">{candidate.source_name}</div>
                      <a href={candidate.post_url} target="_blank" rel="noreferrer" className="text-xs text-[#003375] underline break-all">
                        {candidate.post_url}
                      </a>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${getStatusBadge(candidate.review_status)}`}>
                      {String(candidate.review_status || 'pending')}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 line-clamp-3">{candidate.raw_content}</div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${getAiBadge(candidate)}`}>
                      {candidate.ai_is_event === null || candidate.ai_is_event === undefined ? 'Chưa phân tích' : candidate.ai_is_event ? 'Event' : 'Không phải event'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full border bg-gray-50 text-gray-700 text-[10px] font-bold">
                      {candidate.ai_confidence !== null && candidate.ai_confidence !== undefined ? Number(candidate.ai_confidence).toFixed(2) : '--'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button onClick={() => openCandidate(candidate)} className="px-3 py-2 rounded-xl bg-[#1A56FF] text-white text-xs font-bold">
                      Chi tiết
                    </button>
                    <button
                      onClick={() => handleAnalyze(candidate.id)}
                      disabled={analyzingId === candidate.id}
                      className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold disabled:opacity-60"
                    >
                      AI
                    </button>
                    <button
                      onClick={() => handleReject(candidate.id)}
                      className="px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-bold"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedCandidate ? (
        <CandidateDetailModal
          candidate={selectedCandidate}
          draft={draft}
          onClose={closeCandidate}
          onDraftChange={setDraft}
          onAnalyze={() => handleAnalyze(selectedCandidate.id)}
          onApprove={handleApprove}
          onReject={() => handleReject(selectedCandidate.id)}
          analyzing={analyzingId === selectedCandidate.id}
          approving={savingAction === 'approve'}
          rejecting={savingAction === 'reject'}
        />
      ) : null}
      {toast ? (
        <div className={`fixed bottom-6 right-6 z-[100001] px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium bg-white ${toast.type === 'success' ? 'border-green-200 text-green-700' : 'border-red-200 text-red-700'}`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {toast.message}
          </div>
        </div>
      ) : null}
        </div>
      </div>
  );
};

export default AdminEventCandidates;




