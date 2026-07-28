import React from 'react';
import { Loader2, User, X } from 'lucide-react';

interface AccountSettingsModalProps {
    open: boolean;
    mobile: boolean;
    error: string | null;
    saving: boolean;
    canSave: boolean;
    onClose: () => void;
    onSave: () => void;
    children: React.ReactNode;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
    open,
    mobile,
    error,
    saving,
    canSave,
    onClose,
    onSave,
    children,
}) => {
    if (!open) return null;

    return (
        <div
            className={`fixed inset-0 z-[100000] flex animate-fadeIn bg-black/60 ${
                mobile
                    ? 'items-end justify-center p-0'
                    : 'items-center justify-center p-4'
            }`}
            onClick={onClose}
        >
            <div
                className={`account-settings-sheet w-full overflow-hidden border border-gray-200 bg-white shadow-2xl ${
                    mobile
                        ? 'flex max-h-[80vh] max-w-[430px] flex-col rounded-t-3xl animate-slideUp'
                        : 'max-w-md rounded-xl animate-scaleIn'
                }`}
                onClick={event => event.stopPropagation()}
            >
                {mobile && (
                    <div className="mx-auto mt-3 h-1.5 w-16 shrink-0 rounded-full bg-gray-200" />
                )}

                <div
                    className={`account-settings-header flex shrink-0 items-center justify-between border-b border-gray-100 ${
                        mobile ? 'bg-white px-4 pb-3 pt-3' : 'bg-gray-50 p-4'
                    }`}
                >
                    <h3
                        className={
                            mobile
                                ? 'flex items-center gap-2 text-base font-black text-[#0D1B3E]'
                                : 'text-base font-bold text-gray-900'
                        }
                    >
                        {mobile && <User size={18} className="text-[#003375]" />}
                        Cài đặt thông tin
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`text-gray-500 transition-colors ${
                            mobile
                                ? 'rounded-full bg-gray-100 p-2 active:scale-95'
                                : 'rounded-lg p-1.5 hover:bg-gray-200'
                        }`}
                        aria-label="Đóng cài đặt thông tin"
                    >
                        <X size={mobile ? 16 : 18} />
                    </button>
                </div>

                <div
                    className={`account-settings-body custom-scrollbar overflow-y-auto ${
                        mobile
                            ? 'min-h-0 flex-1 space-y-5 p-4'
                            : 'max-h-[70vh] space-y-6 p-5'
                    }`}
                >
                    {error && (
                        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}
                    {children}
                </div>

                <div
                    className={`account-settings-footer flex shrink-0 gap-2 border-t border-gray-100 ${
                        mobile
                            ? 'bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3'
                            : 'bg-gray-50 p-4'
                    }`}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className={`flex-1 border border-gray-200 font-semibold text-gray-600 transition-colors hover:bg-gray-100 ${
                            mobile ? 'rounded-xl py-3' : 'rounded-lg py-2'
                        } text-sm`}
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving || !canSave}
                        className={`flex flex-[2] items-center justify-center gap-2 bg-[#003375] font-bold text-white transition-colors hover:bg-[#002855] disabled:cursor-not-allowed disabled:opacity-50 ${
                            mobile ? 'rounded-xl py-3 shadow-md' : 'rounded-lg py-2'
                        } text-sm`}
                    >
                        {saving ? <Loader2 className="animate-spin" size={14} /> : null}
                        Lưu thông tin
                    </button>
                </div>
            </div>
        </div>
    );
};
