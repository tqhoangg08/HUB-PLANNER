import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logWebError } from '../../utils/logWebError';

interface RouteErrorBoundaryProps {
    children: React.ReactNode;
    resetKey: string;
}

interface RouteErrorBoundaryState {
    error: Error | null;
}

const CHUNK_ERROR_PATTERNS = [
    /chunkloaderror/i,
    /failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /importing a module script failed/i,
    /loading chunk \d+ failed/i,
];

const isChunkLoadError = (error: Error) =>
    CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(`${error.name} ${error.message}`));

export class RouteErrorBoundary extends React.Component<
    RouteErrorBoundaryProps,
    RouteErrorBoundaryState
> {
    state: RouteErrorBoundaryState = {
        error: null,
    };

    static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        void logWebError({
            source: 'frontend',
            action: isChunkLoadError(error) ? 'route_chunk_load' : 'route_render',
            error,
            metadata: {
                componentStack: info.componentStack,
            },
        });
    }

    componentDidUpdate(previousProps: RouteErrorBoundaryProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    private retry = () => {
        window.location.reload();
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const chunkError = isChunkLoadError(error);

        return (
            <main className="flex min-h-[100dvh] items-center justify-center bg-[#F8FAFC] p-5">
                <section
                    className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-xl"
                    role="alert"
                >
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <AlertTriangle size={28} aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-black text-slate-950">
                        Không thể tải nội dung
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        {chunkError
                            ? 'Phiên bản ứng dụng có thể vừa được cập nhật hoặc kết nối mạng đang gián đoạn.'
                            : 'Ứng dụng gặp lỗi khi hiển thị màn hình này.'}
                    </p>
                    <button
                        type="button"
                        onClick={this.retry}
                        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003375] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#002855]"
                    >
                        <RefreshCw size={17} aria-hidden="true" />
                        Tải lại ứng dụng
                    </button>
                </section>
            </main>
        );
    }
}
