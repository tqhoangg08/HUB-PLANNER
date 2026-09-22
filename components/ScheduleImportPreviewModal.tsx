import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Lock, Trash2, X } from 'lucide-react';
import type { ScheduleImportPreviewRow } from '../utils/scheduleImportPreview';
import { ScheduleSessionsEditor } from './ScheduleSessionsEditor';
import { fetchScheduleSessionCatalogue } from '../utils/scheduleSessionOptionsApi';
import { formatScheduleSession, scheduleSessionsAreValid, type ScheduleSessionCatalogue } from '../utils/scheduleSessions';

interface ScheduleImportPreviewModalProps {
  rows: ScheduleImportPreviewRow[];
  semester: string;
  isSaving?: boolean;
  onChange: (rows: ScheduleImportPreviewRow[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const getSessionSummary = (row: ScheduleImportPreviewRow) => {
  const days = String(row.course.day_of_week || '').split(/\r?\n/);
  const shifts = String(row.course.shift || '').split(/\r?\n/);
  const count = Math.max(days.length, shifts.length);
  return Array.from({ length: count }, (_, index) => (
    `${days[index] === '8' ? 'Chủ nhật' : `Thứ ${days[index] || days[0] || 'chưa rõ'}`} • ${shifts[index] || shifts[0] || 'Chưa rõ giờ'}`
  )).join('\n');
};

export const ScheduleImportPreviewModal: React.FC<ScheduleImportPreviewModalProps> = ({
  rows,
  semester,
  isSaving = false,
  onChange,
  onCancel,
  onConfirm,
}) => {
  const [catalogue, setCatalogue] = useState<ScheduleSessionCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setCatalogue(null); setCatalogueError('');
    void fetchScheduleSessionCatalogue(semester).then((value) => {
      if (!cancelled) setCatalogue(value);
    }).catch(() => {
      if (!cancelled) setCatalogueError('Không thể tải danh mục cơ sở/phòng. Vui lòng thử lại.');
    });
    return () => { cancelled = true; };
  }, [semester]);
  const invalidUnknownRows = useMemo(() => rows.filter((row) => !row.isSystemCourse && !scheduleSessionsAreValid(row.course.scheduleSessions || [], semester, catalogue)), [catalogue, rows, semester]);
  const updateRow = (previewId: string, changes: Partial<ScheduleImportPreviewRow['course']>) => {
    onChange(rows.map(row => (
      row.previewId === previewId
        ? { ...row, course: { ...row.course, ...changes } }
        : row
    )));
  };

  const content = (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 sm:text-xl">Xem trước thời khóa biểu</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Học kỳ {semester.replaceAll('_', ' ')} • {rows.length} môn
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X size={19} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 sm:text-sm">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <p>
              <strong>Chú ý:</strong> Khi xác nhận, danh sách thời khóa biểu cũ của học kỳ này sẽ
              được thay thế. Môn khớp dữ liệu hệ thống đã dùng thông tin chính xác và không thể sửa;
              các môn chưa có trong hệ thống vẫn có thể chỉnh sửa hoặc xóa.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500">
              Danh sách xem trước đang trống.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="hidden grid-cols-[48px_minmax(190px,1fr)_minmax(210px,1.15fr)_minmax(150px,.8fr)_130px_48px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-extrabold uppercase text-slate-500 md:grid">
                <span>STT</span>
                <span>Môn học</span>
                <span>Ca học</span>
                <span>Giảng viên</span>
                <span>Nguồn</span>
                <span />
              </div>

              {rows.map((row, index) => (
                <div
                  key={row.previewId}
                  className="grid grid-cols-[30px_minmax(0,1fr)_38px] gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 md:grid-cols-[48px_minmax(190px,1fr)_minmax(210px,1.15fr)_minmax(150px,.8fr)_130px_48px] md:items-center md:gap-3 md:px-4"
                >
                  <span className="pt-2 text-xs font-bold text-slate-500 md:pt-0">{index + 1}</span>

                  <div className="space-y-3 md:contents">
                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">Môn học</span>
                      {row.isSystemCourse ? (
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">{row.course.subject_name}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-[#0056C7]">{row.course.course_code}</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <input
                            value={String(row.course.subject_name || '')}
                            onChange={event => updateRow(row.previewId, { subject_name: event.target.value })}
                            className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                          />
                          <p className="px-1 text-[10px] font-semibold text-[#0056C7]">{row.course.course_code}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      {row.isSystemCourse ? (
                        <p className="whitespace-pre-line text-xs font-semibold leading-5 text-slate-700">
                          {getSessionSummary(row)}
                        </p>
                      ) : (
                        <ScheduleSessionsEditor
                          semester={semester}
                          value={row.course.scheduleSessions || []}
                          onChange={(scheduleSessions) => updateRow(row.previewId, { scheduleSessions })}
                          catalogue={catalogue}
                          catalogueLoading={!catalogue && !catalogueError}
                          compact
                        />
                      )}
                    </div>

                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">Giảng viên</span>
                      {row.isSystemCourse ? (
                        <p className="text-xs font-semibold text-slate-700">{row.course.instructor || 'Chưa rõ'}</p>
                      ) : (
                        <input
                          value={String(row.course.instructor || '')}
                          onChange={event => updateRow(row.previewId, { instructor: event.target.value })}
                          placeholder="Chưa rõ"
                          className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                        />
                      )}
                    </div>

                    <div>
                      {row.isSystemCourse ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
                          <Lock size={11} /> Dữ liệu hệ thống
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-700">
                          Môn ngoài hệ thống
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onChange(rows.filter(current => current.previewId !== row.previewId))}
                    className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 md:mt-0"
                    aria-label={`Xóa ${row.course.subject_name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {(catalogueError || invalidUnknownRows.length > 0) && (
            <p className="mt-3 text-xs font-semibold text-red-600" role="alert">
              {catalogueError || `${invalidUnknownRows.length} môn ngoài hệ thống chưa có buổi học hợp lệ.`}
            </p>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs font-semibold text-slate-500">{rows.length} môn sẽ thay thế lịch hiện tại</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="h-10 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving || rows.length === 0 || invalidUnknownRows.length > 0 || Boolean(catalogueError)}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#0056C7] px-5 text-sm font-bold text-white hover:bg-[#0047A5] disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none"
            >
              <Check size={16} />
              {isSaving ? 'Đang thay thế...' : 'Xác nhận nhập'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(content, document.body);
};
