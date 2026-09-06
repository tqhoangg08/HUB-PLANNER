import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

interface AuthGateProps {
    loading: boolean;
    unavailable?: boolean;
    onRetry?: () => void;
    children: ReactNode;
}

export const AuthGate = ({ loading, unavailable = false, onRetry, children }: AuthGateProps) => {
    if (unavailable) {
        return (
            <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
                <p className="text-sm font-bold text-[#003375]">Không thể đồng bộ tài khoản lúc này.</p>
                <p className="max-w-sm text-sm text-slate-600">Phiên đăng nhập vẫn được giữ an toàn. Vui lòng thử lại.</p>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg bg-[#003375] px-4 py-2 text-sm font-semibold text-white">
                    <RefreshCw size={16} aria-hidden="true" /> Thử lại
                </button>
            </div>
        );
    }
    if (!loading) return children;

    return (
        <div
            className="flex h-[100dvh] w-full flex-col items-center justify-center bg-[#F8FAFC]"
            role="status"
            aria-live="polite"
        >
            <Loader2 className="mb-4 animate-spin text-[#003375]" size={40} aria-hidden="true" />
            <p className="animate-pulse text-sm font-bold text-[#003375]">
                Đang đồng bộ tài khoản...
            </p>
        </div>
    );
};
