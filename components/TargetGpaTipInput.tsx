import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

interface TargetGpaTipInputProps {
    value: number;
    onChange: (value: number) => void;
}

export const TargetGpaTipInput: React.FC<TargetGpaTipInputProps> = ({ value, onChange }) => {
    const [isTipOpen, setIsTipOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const tipId = React.useId();

    useEffect(() => {
        if (!isTipOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsTipOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsTipOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isTipOpen]);

    return (
        <div
            ref={containerRef}
            className="relative flex items-center border-b border-dashed border-gray-400 hover:border-[#003375] focus-within:border-[#0057D9]"
        >
            <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={value}
                aria-describedby={isTipOpen ? tipId : undefined}
                onClick={() => setIsTipOpen(true)}
                onFocus={() => setIsTipOpen(true)}
                onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
                className="w-8 sm:w-12 bg-transparent p-0 m-0 text-right font-bold text-[#003375] outline-none"
            />

            {isTipOpen && (
                <div
                    id={tipId}
                    role="tooltip"
                    className="absolute right-0 top-[calc(100%+9px)] z-[70] w-[min(238px,calc(100vw-32px))] rounded-2xl border border-sky-100 bg-white p-3 text-left shadow-[0_12px_32px_rgba(0,51,117,0.16)]"
                >
                    <span className="absolute -top-1.5 right-3.5 h-3 w-3 rotate-45 border-l border-t border-sky-100 bg-white" />
                    <div className="flex items-start gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                            <Lightbulb size={14} strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-extrabold text-[#17335C]">Mẹo nhỏ cho bạn</p>
                                <button
                                    type="button"
                                    aria-label="Đóng mẹo"
                                    onClick={() => setIsTipOpen(false)}
                                    className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                            <p className="mt-1 text-[10px] font-medium leading-[1.55] text-slate-600">
                                Nếu mục tiêu là <strong className="text-[#0057D9]">3.2</strong>, bạn chỉ cần nhập{' '}
                                <strong className="text-[#0057D9]">3.15</strong> vì GPA sẽ được làm tròn.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
