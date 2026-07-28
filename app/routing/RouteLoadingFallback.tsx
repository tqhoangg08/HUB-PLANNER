import { Loader2 } from 'lucide-react';

export const RouteLoadingFallback = () => (
    <div
        className="flex min-h-[40vh] w-full items-center justify-center bg-[#F8FAFC]"
        role="status"
        aria-live="polite"
    >
        <div className="flex flex-col items-center gap-3 text-[#003375]">
            <Loader2 className="animate-spin" size={36} aria-hidden="true" />
            <span className="text-sm font-bold">Đang tải nội dung...</span>
        </div>
    </div>
);
