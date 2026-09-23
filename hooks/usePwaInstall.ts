import { useCallback, useEffect, useRef, useState } from 'react';
import { playClick } from '../utils/audio';
import { showAlert } from '../utils/appNotifications';
import { canPromptPwaInstall, requestPwaInstall } from '../utils/pwaInstallPrompt';

interface UsePwaInstallOptions {
    pathname: string;
    search: string;
}

export const usePwaInstall = ({ pathname, search }: UsePwaInstallOptions) => {
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);
    const lastAutoInstallPathRef = useRef<string | null>(null);

    useEffect(() => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        setIsIOS(
            /iphone|ipad|ipod|macintosh/.test(userAgent)
            && 'ontouchend' in document
        );

    }, []);

    const handleInstallApp = useCallback(async () => {
        playClick();
        if (isIOS) {
            setShowIOSInstructions(true);
            return;
        }

        if (!canPromptPwaInstall()) {
            await showAlert({
                title: 'Không thể cài tự động',
                message: 'Trình duyệt không hỗ trợ cài tự động, hoặc HUB Planner đã được cài trên thiết bị này rồi.',
                variant: 'info',
                confirmText: 'Đã hiểu',
            });
            return;
        }

        await requestPwaInstall();
    }, [isIOS]);

    useEffect(() => {
        const searchParams = new URLSearchParams(search);
        if (searchParams.get('install') !== 'true') {
            lastAutoInstallPathRef.current = null;
            return;
        }

        const autoInstallPath = `${pathname}${search}`;
        if (lastAutoInstallPathRef.current === autoInstallPath) return;

        const timer = window.setTimeout(() => {
            lastAutoInstallPathRef.current = autoInstallPath;
            void handleInstallApp();
            window.history.replaceState({}, document.title, pathname);
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [handleInstallApp, pathname, search]);

    const dismissIOSInstructions = useCallback(() => {
        setShowIOSInstructions(false);
    }, []);

    return {
        handleInstallApp,
        showIOSInstructions,
        dismissIOSInstructions,
    };
};
