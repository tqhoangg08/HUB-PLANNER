import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthGateProps {
    loading: boolean;
    children: ReactNode;
}

export const AuthGate = ({ loading, children }: AuthGateProps) => {
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
