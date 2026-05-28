import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X } from 'lucide-react';
import { SUPPORT_NOTICE_DISMISSED_KEY } from '../utils/devicePreferences';
import { playClick } from '../utils/audio';

const SUPPORT_NOTICE_CLOSED_THIS_SESSION_KEY = 'hubplanner:support-notice-closed-this-session';

export const SupportNoticeModal: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(SUPPORT_NOTICE_DISMISSED_KEY) === 'true') return;
        if (sessionStorage.getItem(SUPPORT_NOTICE_CLOSED_THIS_SESSION_KEY) === 'true') return;
        setIsVisible(true);
    }, []);

    if (!isVisible) return null;

    const handleClose = () => {
        playClick();
        if (dontShowAgain) {
            localStorage.setItem(SUPPORT_NOTICE_DISMISSED_KEY, 'true');
        } else {
            sessionStorage.setItem(SUPPORT_NOTICE_CLOSED_THIS_SESSION_KEY, 'true');
        }
        setIsVisible(false);
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/65 p-4 sm:p-5 animate-fadeIn">
            <div
                className="relative flex max-h-[82dvh] w-full max-w-[340px] flex-col overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-2xl animate-scaleIn sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-[24px] lg:max-w-4xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-2.5 border-b border-gray-100 bg-gradient-to-r from-[#003375] to-[#0052cc] px-3.5 py-3 text-white sm:gap-4 sm:px-7 sm:py-5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 sm:h-12 sm:w-12 sm:rounded-2xl">
                        <Heart size={18} className="fill-current sm:hidden" />
                        <Heart size={25} className="hidden fill-current sm:block" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-100 sm:text-xs sm:tracking-[0.16em]">Thông báo từ HUB Planner</p>
                        <h2 className="mt-0.5 text-base font-black leading-tight sm:mt-1 sm:text-2xl">Thân gửi HUBers,</h2>
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

                <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-7">
                    <div className="space-y-4 sm:space-y-6">
                        <div className="space-y-2.5 text-[12px] leading-5 text-gray-700 sm:space-y-4 sm:text-[15px] sm:leading-7">
                            <p>
                                Lời đầu tiên, tụi mình thật sự cảm ơn tất cả các bạn sinh viên đã đồng hành cùng website trong suốt thời gian qua ❤️. Từ một dự án nhỏ được xây dựng bởi sinh viên, tụi mình chưa từng nghĩ sẽ có ngày website được nhiều bạn biết đến và sử dụng mỗi ngày như hiện tại. Chính sự ủng hộ, góp ý và đồng hành của mọi người đã giúp website có động lực để phát triển đến hôm nay.
                            </p>
                            <p>
                                Tuy nhiên, thời gian gần đây số lượng sinh viên truy cập tăng rất nhanh, kéo theo chi phí server, lưu trữ dữ liệu, băng thông và vận hành cũng tăng lên đáng kể. Trong khi đó, đội ngũ vận hành chúng mình cũng chỉ là những sinh viên, với nguồn kinh phí còn khá hạn chế. Sau rất nhiều lần cân nhắc, tụi mình quyết định trong thời gian tới website sẽ bắt đầu hiển thị quảng cáo để có thể tiếp tục duy trì và phát triển lâu dài.
                            </p>
                            <p>
                                Thật lòng mà nói, tụi mình cũng không muốn trải nghiệm của mọi người bị ảnh hưởng bởi quảng cáo. Nhưng đây gần như là cách khả thi nhất để website có thể tiếp tục hoạt động ổn định, cập nhật thêm tính năng mới và phục vụ ngày càng nhiều sinh viên hơn.
                            </p>
                            <p>
                                Nếu các bạn cảm thấy website hữu ích và muốn dự án này tiếp tục tồn tại, tụi mình sẽ rất biết ơn nếu nhận được sự ủng hộ từ mọi người - dù là một khoản đóng góp nhỏ, chia sẻ website đến bạn bè, hay đơn giản chỉ là tiếp tục đồng hành cùng tụi mình.
                            </p>
                            <p className="font-bold text-[#003375]">
                                Cảm ơn mọi người rất nhiều vì đã luôn tin tưởng và sử dụng website ❤️
                            </p>
                        </div>

                        <aside className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-5">
                            <div className="mb-3 sm:mb-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#003375] sm:text-xs">Thông tin ủng hộ</p>
                                <p className="mt-1 text-xs text-gray-500 sm:text-sm">Nếu bạn muốn đồng hành cùng dự án, có thể quét mã hoặc chuyển khoản theo thông tin bên dưới.</p>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                <div className="mx-auto w-24 shrink-0 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200 sm:mx-0 sm:w-44 sm:p-3">
                                    <img src="/qr-code.png" alt="Mã QR chuyển khoản ủng hộ HUB Planner" className="aspect-square w-full rounded-xl object-cover" />
                                </div>
                                <div className="grid flex-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 text-[11px] sm:grid-cols-3 sm:gap-3 sm:p-4 sm:text-sm">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Họ tên</p>
                                        <p className="font-bold text-gray-900">TRAN QUOC HOANG</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Số tài khoản</p>
                                        <p className="font-bold text-[#003375]">0776273402</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Ngân hàng</p>
                                        <p className="font-bold text-gray-900">MB BANK</p>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 border-t border-gray-100 bg-gray-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-7 sm:py-4">
                    <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs font-semibold text-gray-700 sm:gap-3 sm:text-sm">
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
                        Mình đã hiểu
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
