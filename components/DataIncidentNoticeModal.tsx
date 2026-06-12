import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { DATA_INCIDENT_NOTICE_DISMISSED_KEY } from '../utils/devicePreferences';
import { playClick } from '../utils/audio';

const DATA_INCIDENT_CLOSED_THIS_SESSION_KEY = 'hubplanner:data-incident-notice-closed-this-session';

type DataIncidentNoticeModalProps = {
    onDone?: () => void;
};

export const DataIncidentNoticeModal: React.FC<DataIncidentNoticeModalProps> = ({ onDone }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(DATA_INCIDENT_NOTICE_DISMISSED_KEY) === 'true') {
            onDone?.();
            return;
        }
        if (sessionStorage.getItem(DATA_INCIDENT_CLOSED_THIS_SESSION_KEY) === 'true') {
            onDone?.();
            return;
        }
        setIsVisible(true);
    }, [onDone]);

    if (!isVisible) return null;

    const handleClose = () => {
        playClick();
        if (dontShowAgain) {
            localStorage.setItem(DATA_INCIDENT_NOTICE_DISMISSED_KEY, 'true');
        } else {
            sessionStorage.setItem(DATA_INCIDENT_CLOSED_THIS_SESSION_KEY, 'true');
        }
        setIsVisible(false);
        onDone?.();
    };

    return createPortal(
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-slate-950/65 p-4 sm:p-5 animate-fadeIn">
            <div
                className="relative flex max-h-[86dvh] w-full max-w-[350px] flex-col overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-2xl animate-scaleIn sm:max-w-2xl sm:rounded-[24px]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-3 border-b border-amber-100 bg-gradient-to-r from-[#8A5A00] to-[#D97706] px-4 py-4 text-white sm:gap-4 sm:px-7 sm:py-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:h-12 sm:w-12">
                        <AlertTriangle size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100 sm:text-xs">Thông báo</p>
                        <h2 className="mt-1 text-lg font-black leading-tight sm:text-2xl">Cập nhật về dữ liệu học tập</h2>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-full bg-white/10 p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white sm:p-2"
                        aria-label="Đóng thông báo"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
                    <div className="space-y-4 text-[13px] leading-6 text-gray-700 sm:text-[15px] sm:leading-7">
                        <p>
                            HUB Planner xin lỗi bạn vì sự cố vừa qua đã khiến một số dữ liệu học tập hiển thị chưa chính xác hoặc bị thiếu trong thời gian ngắn.
                        </p>
                        <p>
                            Nguyên nhân chính đến từ việc lượng truy cập và thao tác tăng cao, khiến hệ thống có thời điểm xử lý không ổn định. Hiện tại, tụi mình đã khôi phục được một phần dữ liệu cũ và tiếp tục theo dõi để hạn chế sự cố tương tự.
                        </p>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 sm:p-4">
                            <div className="mb-2 flex items-center gap-2 font-black">
                                <CheckCircle2 size={18} />
                                Lưu ý khi chỉnh bảng điểm
                            </div>
                            <p>
                                Khi muốn sửa điểm, bạn hãy bấm nút <strong>Sửa điểm</strong>, chỉnh các môn cần thay đổi, sau đó bấm <strong>Lưu bảng điểm</strong>. Cách này giúp dữ liệu được lưu chắc chắn hơn và giảm tải cho hệ thống.
                            </p>
                        </div>
                        <p>
                            Cảm ơn bạn đã gửi phản hồi và kiên nhẫn trong lúc tụi mình xử lý. Những góp ý của mọi người giúp HUB Planner cải thiện ổn định hơn cho tất cả sinh viên.
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-7 sm:py-4">
                    <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs font-semibold text-gray-700 sm:text-sm">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(event) => setDontShowAgain(event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375] sm:h-5 sm:w-5"
                        />
                        Không hiển thị lại
                    </label>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex items-center justify-center rounded-xl bg-[#003375] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[#002855] active:scale-95 sm:px-5 sm:py-3 sm:text-sm"
                    >
                        Đã hiểu
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
