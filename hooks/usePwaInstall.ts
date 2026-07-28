import { useCallback, useEffect, useRef, useState } from 'react';
import { playClick } from '../utils/audio';
import { showAlert } from '../utils/appNotifications';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface UsePwaInstallOptions {
    pathname: string;
    search: string;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        globalDeferredPrompt = event as BeforeInstallPromptEvent;
    });
}

export const usePwaInstall = ({ pathname, search }: UsePwaInstallOptions) => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);
    const lastAutoInstallPathRef = useRef<string | null>(null);

    useEffect(() => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        setIsIOS(
            /iphone|ipad|ipod|macintosh/.test(userAgent)
            && 'ontouchend' in document
        );

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleInstallApp = useCallback(async () => {
        playClick();
        const promptToUse = deferredPrompt || globalDeferredPrompt;

        if (isIOS) {
            setShowIOSInstructions(true);
            return;
        }

        if (!promptToUse) {
            await showAlert({
                title: 'Không thể cài tự động',
                message: 'Trình duyệt không hỗ trợ cài tự động, hoặc HUB Planner đã được cài trên thiết bị này rồi.',
                variant: 'info',
                confirmText: 'Đã hiểu',
            });
            return;
        }

        await promptToUse.prompt();
        const { outcome } = await promptToUse.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            globalDeferredPrompt = null;
        }
    }, [deferredPrompt, isIOS]);

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
