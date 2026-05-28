import React, { useEffect, useState } from 'react';
import { Heart, X } from 'lucide-react';
import { SUPPORT_NOTICE_DISMISSED_KEY } from '../utils/devicePreferences';
import { playClick } from '../utils/audio';

export const SupportNoticeModal: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(SUPPORT_NOTICE_DISMISSED_KEY) === 'true') return;
        const timer = window.setTimeout(() => setIsVisible(true), 450);
        return () => window.clearTimeout(timer);
    }, []);

    if (!isVisible) return null;

    const handleClose = () => {
        playClick();
        if (dontShowAgain) {
            localStorage.setItem(SUPPORT_NOTICE_DISMISSED_KEY, 'true');
        }
        setIsVisible(false);
    };

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 animate-fadeIn">
            <div
                className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-2xl animate-scaleIn"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-4 border-b border-gray-100 bg-gradient-to-r from-[#003375] to-[#0052cc] px-5 py-5 text-white sm:px-7">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                        <Heart size={25} className="fill-current" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">Thông báo từ HUB Planner</p>
                        <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">Thân gửi HUBers,</h2>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                        aria-label="Đóng thông báo"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-5 sm:p-7">
                    <div className="space-y-6">
                        <div className="space-y-4 text-[14px] leading-7 text-gray-700 sm:text-[15px]">
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

                        <aside className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
                            <div className="mb-4">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#003375]">Thông tin ủng hộ</p>
                                <p className="mt-1 text-sm text-gray-500">Nếu bạn muốn đồng hành cùng dự án, có thể quét mã hoặc chuyển khoản theo thông tin bên dưới.</p>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                <div className="mx-auto w-44 shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200 sm:mx-0">
                                    <img src="/qr-code.png" alt="Mã QR chuyển khoản ủng hộ HUB Planner" className="aspect-square w-full rounded-xl object-cover" />
                                </div>
                                <div className="grid flex-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm sm:grid-cols-3">
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

                <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                    <label className="flex cursor-pointer select-none items-center gap-3 text-sm font-semibold text-gray-700">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(event) => setDontShowAgain(event.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-[#003375] focus:ring-[#003375]"
                        />
                        Không hiển thị lại
                    </label>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex items-center justify-center rounded-xl bg-[#003375] px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#002855] active:scale-95"
                    >
                        Mình đã hiểu
                    </button>
                </div>
            </div>
        </div>
    );
};
