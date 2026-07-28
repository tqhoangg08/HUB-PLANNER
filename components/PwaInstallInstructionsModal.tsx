import React from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';

interface PwaInstallInstructionsModalProps {
    open: boolean;
    onClose: () => void;
}

export const PwaInstallInstructionsModal: React.FC<PwaInstallInstructionsModalProps> = ({
    open,
    onClose,
}) => {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center sm:items-center p-4 animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-sm rounded-3xl p-6 relative animate-slideUp sm:animate-scaleIn shadow-2xl"
                onClick={event => event.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="w-16 h-16 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Download size={32} />
                </div>

                <h3 className="text-xl font-black text-center text-[#003375] mb-2">
                    Cài đặt HUB Planner
                </h3>
                <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                    Trình duyệt của Apple không cho phép cài đặt tự động. Bạn vui lòng làm theo 2 bước cực nhanh sau:
                </p>

                <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-blue-500">
                            <Share size={20} />
                        </div>
                        <p className="text-sm font-medium text-gray-700">
                            <strong>Bước 1:</strong> Nhấn vào biểu tượng{' '}
                            <span className="text-blue-500 font-bold">Chia sẻ (Share)</span>{' '}
                            ở thanh công cụ trình duyệt.
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-gray-800">
                            <PlusSquare size={20} />
                        </div>
                        <p className="text-sm font-medium text-gray-700">
                            <strong>Bước 2:</strong> Cuộn xuống và chọn{' '}
                            <span className="font-bold text-gray-900">Thêm vào MH chính</span>.
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-[#003375] text-white font-bold py-4 rounded-2xl mt-6 active:scale-95 transition-transform shadow-md"
                >
                    Đã hiểu
                </button>
            </div>
        </div>
    );
};
