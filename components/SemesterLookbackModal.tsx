import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { LOOKBACK_SEMESTER_LABEL, SemesterLookbackData } from '../hooks/useSemesterLookback';

interface SemesterLookbackModalProps {
    isOpen: boolean;
    data: SemesterLookbackData | null;
    loading?: boolean;
    onClose: () => void;
}

const formatCompactPercent = (value: number | null) => {
    if (!Number.isFinite(value ?? NaN)) return 'Chưa có dữ liệu';
    return `Top ${Math.max(0.01, value as number).toFixed((value as number) < 1 ? 2 : 1)}%`;
};

const formatPercent = (value: number | null) => {
    if (!Number.isFinite(value ?? NaN)) return 'chưa có dữ liệu';
    return `${formatCompactPercent(value)} toàn trường`;
};

export const SemesterLookbackModal: React.FC<SemesterLookbackModalProps> = ({ isOpen, data, loading, onClose }) => {
    if (!isOpen) return null;

    const hasRank = Boolean(data?.rank && data?.totalStudents);

    return createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/75 px-3 py-4 sm:px-4 sm:py-6 animate-fadeIn motion-reduce:animate-none" onClick={onClose}>
            <div
                className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-[10px] bg-white shadow-xl animate-slideUp motion-reduce:animate-none sm:max-h-[86vh] sm:rounded-lg"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                    title="Đóng"
                >
                    <X size={18} />
                </button>

                <div className="shrink-0 bg-[#003375] px-4 pb-3 pt-3.5 text-center text-white sm:px-10 sm:py-3">
                    <h2 className="text-xl font-bold leading-tight sm:text-[28px] sm:leading-normal">Tổng kết học kỳ</h2>
                    <p className="mx-auto mt-1.5 max-w-xl text-[11px] font-medium leading-4 text-blue-100 sm:mt-1 sm:text-sm sm:leading-6">
                        {LOOKBACK_SEMESTER_LABEL}
                    </p>
                </div>

                <div className="overflow-y-auto px-3 py-3 text-center font-['Inter',system-ui,sans-serif] sm:px-8 sm:py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-transparent">
                    {loading ? (
                        <div className="py-12 text-sm font-semibold text-[#64748B]">Đang tải bảng thành tích...</div>
                    ) : data ? (
                        <>
                            <div className="mx-auto grid max-w-2xl gap-2.5 sm:grid-cols-2 sm:gap-3">
                                <div className="rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 sm:p-3">
                                    <p className="text-[11px] font-semibold uppercase text-[#64748B] sm:text-xs">GPA học kỳ</p>
                                    <p className="mt-1 text-2xl font-bold leading-none text-[#0F172A] sm:text-[26px] sm:leading-normal">{data.gpa4.toFixed(2)}</p>
                                    <p className="mt-0.5 text-[11px] font-semibold text-[#64748B] sm:mt-0 sm:text-xs">/ 4.0</p>
                                </div>
                                <div className="rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 sm:p-3">
                                    <p className="text-[11px] font-semibold uppercase text-[#64748B] sm:text-xs">Điểm rèn luyện</p>
                                    <p className="mt-1 text-2xl font-bold leading-none text-[#0F172A] sm:text-[26px] sm:leading-normal">{data.trainingScore}</p>
                                    <p className="mt-0.5 text-[11px] font-semibold text-[#64748B] sm:mt-0 sm:text-xs">/ 100</p>
                                </div>
                            </div>

                            <div className="mx-auto mt-2.5 grid max-w-2xl gap-2.5 sm:mt-3 sm:grid-cols-[1.35fr_1fr] sm:gap-3">
                                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#003375] sm:text-xs">Môn học nổi bật</p>
                                    {data.bestSubject ? (
                                        <div className="mt-1.5">
                                            <p className="line-clamp-1 text-sm font-bold leading-snug text-[#0F172A] sm:text-base">{data.bestSubject.name}</p>
                                            <p className="mt-1 text-[13px] font-semibold leading-snug text-[#003375] sm:text-sm">
                                                {data.bestSubject.score10.toFixed(1)} điểm · {data.bestSubject.letter} · {data.bestSubject.scale4.toFixed(1)}/4.0
                                            </p>
                                            <p className="mt-1 text-[11px] font-semibold text-[#64748B] sm:mt-0.5 sm:text-xs">{data.bestSubject.credits} tín chỉ</p>
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm font-semibold text-[#64748B]">Chưa có môn đủ điểm để phân tích.</p>
                                    )}
                                </div>

                                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#003375] sm:text-xs">Tổng kết học phần</p>
                                    <p className="mt-1.5 text-[13px] font-semibold text-[#0F172A] sm:text-sm">
                                        {data.excellentSubjectCount} môn đạt nhóm A/A+
                                    </p>
                                    <p className="mt-1 text-[13px] font-semibold text-[#0F172A] sm:text-sm">
                                        Hoàn thành {data.passedSubjectCount}/{data.totalSubjectCount} môn
                                    </p>
                                </div>
                            </div>

                            <div className="mx-auto mt-2.5 max-w-2xl overflow-hidden rounded-lg border border-[#E2E8F0] text-left text-[13px] sm:mt-3 sm:text-base">
                                <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4">
                                    <span className="font-semibold text-[#64748B]">Top toàn trường</span>
                                    <span className="shrink-0 text-right font-bold text-[#0F172A]">{hasRank ? `#${data.rank} / ${data.totalStudents}` : 'Chưa có dữ liệu'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4">
                                    <span className="font-semibold text-[#64748B]">Tỷ lệ toàn trường</span>
                                    <span className="shrink-0 text-right font-bold text-[#0F172A]">{formatCompactPercent(data.topPercent)}</span>
                                </div>
                                {data.rankInClass && data.totalInClass && (
                                    <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4">
                                        <span className="font-semibold text-[#64748B]">Top trong lớp</span>
                                        <span className="shrink-0 text-right font-bold text-[#0F172A]">#{data.rankInClass} / {data.totalInClass}</span>
                                    </div>
                                )}
                                {data.rankInMajor && data.totalInMajor && (
                                    <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4">
                                        <span className="font-semibold text-[#64748B]">Top trong ngành</span>
                                        <span className="shrink-0 text-right font-bold text-[#0F172A]">#{data.rankInMajor} / {data.totalInMajor}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                                    <span className="font-semibold text-[#64748B]">Ngành</span>
                                    <span className="min-w-0 text-right font-bold text-[#0F172A]">{data.major || 'Chưa có dữ liệu'}</span>
                                </div>
                            </div>

                            <div className="mx-auto mt-2.5 max-w-2xl rounded-lg border border-[#D8EFE0] bg-[#F3FAF6] p-3 text-left sm:mt-3">
                                <p className="text-[13px] font-bold text-[#0F172A] sm:text-sm">
                                    Khả năng đạt học bổng: Rất cao
                                </p>
                                <p className="mt-1 text-[13px] font-medium leading-5 text-[#334155] sm:text-sm sm:leading-6">
                                    {hasRank
                                        ? `Điều kiện nổi bật: GPA ${data.gpa4.toFixed(2)}, ĐRL ${data.trainingScore}, ${formatPercent(data.topPercent)}.`
                                        : 'Tiếp tục cập nhật bảng điểm để hệ thống ghi nhận đầy đủ kết quả học kỳ.'}
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="py-12 text-sm font-semibold text-[#64748B]">
                            Chưa có dữ liệu cho {LOOKBACK_SEMESTER_LABEL}.
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
