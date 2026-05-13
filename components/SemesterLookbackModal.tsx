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
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/75 px-4 py-6 animate-fadeIn motion-reduce:animate-none" onClick={onClose}>
            <div
                className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl animate-slideUp motion-reduce:animate-none"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                    title="Đóng"
                >
                    <X size={18} />
                </button>

                <div className="shrink-0 bg-[#003375] px-6 py-3 text-center text-white sm:px-10">
                    <h2 className="text-2xl font-bold sm:text-[28px]">Tổng kết học kỳ</h2>
                    <p className="mx-auto mt-1 max-w-xl text-sm font-medium leading-6 text-blue-100">
                        {LOOKBACK_SEMESTER_LABEL}
                    </p>
                </div>

                <div className="overflow-y-auto px-5 py-4 text-center font-['Inter',system-ui,sans-serif] sm:px-8 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-transparent">
                    {loading ? (
                        <div className="py-12 text-sm font-semibold text-[#64748B]">Đang tải bảng thành tích...</div>
                    ) : data ? (
                        <>
                            <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                                    <p className="text-xs font-semibold uppercase text-[#64748B]">GPA học kỳ</p>
                                    <p className="mt-1 text-[26px] font-bold text-[#0F172A]">{data.gpa4.toFixed(2)}</p>
                                    <p className="text-xs font-semibold text-[#64748B]">/ 4.0</p>
                                </div>
                                <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                                    <p className="text-xs font-semibold uppercase text-[#64748B]">Điểm rèn luyện</p>
                                    <p className="mt-1 text-[26px] font-bold text-[#0F172A]">{data.trainingScore}</p>
                                    <p className="text-xs font-semibold text-[#64748B]">/ 100</p>
                                </div>
                            </div>

                            <div className="mx-auto mt-3 grid max-w-2xl gap-3 sm:grid-cols-[1.35fr_1fr]">
                                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left">
                                    <p className="text-xs font-bold uppercase tracking-wide text-[#003375]">Môn học nổi bật</p>
                                    {data.bestSubject ? (
                                        <div className="mt-1.5">
                                            <p className="line-clamp-1 text-base font-bold text-[#0F172A]">{data.bestSubject.name}</p>
                                            <p className="mt-1 text-sm font-semibold text-[#003375]">
                                                {data.bestSubject.score10.toFixed(1)} điểm · {data.bestSubject.letter} · {data.bestSubject.scale4.toFixed(1)}/4.0
                                            </p>
                                            <p className="mt-0.5 text-xs font-semibold text-[#64748B]">{data.bestSubject.credits} tín chỉ</p>
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm font-semibold text-[#64748B]">Chưa có môn đủ điểm để phân tích.</p>
                                    )}
                                </div>

                                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left">
                                    <p className="text-xs font-bold uppercase tracking-wide text-[#003375]">Tổng kết học phần</p>
                                    <p className="mt-1.5 text-sm font-semibold text-[#0F172A]">
                                        {data.excellentSubjectCount} môn đạt nhóm A/A+
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-[#0F172A]">
                                        Hoàn thành {data.passedSubjectCount}/{data.totalSubjectCount} môn
                                    </p>
                                </div>
                            </div>

                            <div className="mx-auto mt-3 max-w-2xl overflow-hidden rounded-lg border border-[#E2E8F0] text-left">
                                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-2.5">
                                    <span className="font-semibold text-[#64748B]">Top toàn trường</span>
                                    <span className="font-bold text-[#0F172A]">{hasRank ? `#${data.rank} / ${data.totalStudents}` : 'Chưa có dữ liệu'}</span>
                                </div>
                                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-2.5">
                                    <span className="font-semibold text-[#64748B]">Tỷ lệ toàn trường</span>
                                    <span className="font-bold text-[#0F172A]">{formatCompactPercent(data.topPercent)}</span>
                                </div>
                                {data.rankInClass && data.totalInClass && (
                                    <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-2.5">
                                        <span className="font-semibold text-[#64748B]">Top trong lớp</span>
                                        <span className="font-bold text-[#0F172A]">#{data.rankInClass} / {data.totalInClass}</span>
                                    </div>
                                )}
                                {data.rankInMajor && data.totalInMajor && (
                                    <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-2.5">
                                        <span className="font-semibold text-[#64748B]">Top trong ngành</span>
                                        <span className="font-bold text-[#0F172A]">#{data.rankInMajor} / {data.totalInMajor}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <span className="font-semibold text-[#64748B]">Ngành</span>
                                    <span className="font-bold text-[#0F172A]">{data.major || 'Chưa có dữ liệu'}</span>
                                </div>
                            </div>

                            <div className="mx-auto mt-3 max-w-2xl rounded-lg border border-[#D8EFE0] bg-[#F3FAF6] p-3 text-left">
                                <p className="text-sm font-bold text-[#0F172A]">
                                    Khả năng đạt học bổng: Rất cao
                                </p>
                                <p className="mt-1 text-sm font-medium leading-6 text-[#334155]">
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
