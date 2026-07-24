import React, { useMemo } from 'react';
import { AlertTriangle, Check, Trash2, X } from 'lucide-react';
import type { Semester, Subject } from '../types';

interface TranscriptImportPreviewModalProps {
  semesters: Semester[];
  isSaving?: boolean;
  onChange: (semesters: Semester[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const getImportedAverage = (subject: Subject) => {
  const scores = [subject.scoreCC, subject.scoreProcess, subject.scoreMid, subject.scoreFinal]
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (scores.length === 0) return '';
  return String(Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100);
};

const updateSubject = (
  semesters: Semester[],
  semesterId: string,
  subjectId: string,
  updater: (subject: Subject) => Subject,
) => semesters.map(semester => (
  semester.id === semesterId
    ? {
        ...semester,
        subjects: semester.subjects.map(subject => (
          subject.id === subjectId ? updater(subject) : subject
        )),
      }
    : semester
));

export const TranscriptImportPreviewModal: React.FC<TranscriptImportPreviewModalProps> = ({
  semesters,
  isSaving = false,
  onChange,
  onCancel,
  onConfirm,
}) => {
  const nonEmptySemesters = useMemo(
    () => semesters.filter(semester => semester.subjects.length > 0),
    [semesters],
  );
  const totalSubjects = nonEmptySemesters.reduce((total, semester) => total + semester.subjects.length, 0);

  const handleAverageChange = (semesterId: string, subjectId: string, rawValue: string) => {
    const normalizedValue = rawValue.replace(',', '.').trim();
    const parsedValue = normalizedValue === '' ? null : Number(normalizedValue);
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 10)) return;

    onChange(updateSubject(semesters, semesterId, subjectId, subject => ({
      ...subject,
      scoreCC: parsedValue,
      scoreProcess: parsedValue,
      scoreMid: parsedValue,
      scoreFinal: parsedValue,
    })));
  };

  const handleDelete = (semesterId: string, subjectId: string) => {
    onChange(semesters.map(semester => (
      semester.id === semesterId
        ? { ...semester, subjects: semester.subjects.filter(subject => subject.id !== subjectId) }
        : semester
    )));
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 sm:text-xl">Xem trước bảng điểm</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Kiểm tra, sửa hoặc xóa các môn trước khi đưa vào bản nháp.
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
              <strong>Chú ý:</strong> Khi xác nhận, toàn bộ danh sách bảng điểm cũ sẽ được thay thế
              bằng danh sách dưới đây. Hãy rà soát kỹ tên môn, số tín chỉ và điểm trung bình.
            </p>
          </div>

          {nonEmptySemesters.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500">
              Danh sách xem trước đang trống.
            </div>
          ) : nonEmptySemesters.map(semester => (
            <section key={semester.id} className="mb-5 overflow-hidden rounded-xl border border-slate-200">
              <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-extrabold text-[#003375] sm:px-4">
                {semester.name}
              </h3>

              <div className="hidden grid-cols-[48px_minmax(220px,1fr)_110px_130px_48px] items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-[11px] font-extrabold uppercase text-slate-500 sm:grid">
                <span>STT</span>
                <span>Môn học</span>
                <span>Số TC</span>
                <span>Điểm TB</span>
                <span />
              </div>

              {semester.subjects.map((subject, index) => (
                <div
                  key={subject.id}
                  className="grid grid-cols-[30px_minmax(0,1fr)_38px] gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:grid-cols-[48px_minmax(220px,1fr)_110px_130px_48px] sm:items-center sm:gap-3 sm:px-4"
                >
                  <span className="pt-2 text-xs font-bold text-slate-500 sm:pt-0">{index + 1}</span>
                  <div className="space-y-2 sm:contents">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 sm:hidden">Môn học</span>
                      <input
                        value={subject.name}
                        onChange={event => onChange(updateSubject(
                          semesters,
                          semester.id,
                          subject.id,
                          current => ({ ...current, name: event.target.value }),
                        ))}
                        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 sm:hidden">Số TC</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={subject.credits}
                        onChange={event => {
                          const credits = Math.max(0, Math.round(Number(event.target.value) || 0));
                          onChange(updateSubject(
                            semesters,
                            semester.id,
                            subject.id,
                            current => ({ ...current, credits }),
                          ));
                        }}
                        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 sm:hidden">Điểm TB</span>
                      <input
                        inputMode="decimal"
                        value={getImportedAverage(subject)}
                        onChange={event => handleAverageChange(semester.id, subject.id, event.target.value)}
                        placeholder="-"
                        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(semester.id, subject.id)}
                    className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 sm:mt-0"
                    aria-label={`Xóa ${subject.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs font-semibold text-slate-500">{totalSubjects} môn sẽ được nhập</span>
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
              disabled={isSaving || totalSubjects === 0}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#0056C7] px-5 text-sm font-bold text-white hover:bg-[#0047A5] disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none"
            >
              <Check size={16} />
              {isSaving ? 'Đang nhập...' : 'Xác nhận nhập'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
