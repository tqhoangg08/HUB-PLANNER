import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

const isLocalPreviewHost = (hostname: string) => (
    ['localhost', '127.0.0.1', '::1'].includes(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
);

const shouldForceMobileAppPreview = (search: string) => (
    isLocalPreviewHost(window.location.hostname)
    && new URLSearchParams(search).get('appPreview') === '1'
);

export const useAppMode = (search: string) => {
    const [isAppMode, setIsAppMode] = useState(false);
    const [isMobileScreen, setIsMobileScreen] = useState(
        () => window.innerWidth < MOBILE_BREAKPOINT_PX,
    );
    const [forceMobileAppPreview, setForceMobileAppPreview] = useState(
        () => shouldForceMobileAppPreview(search),
    );

    useEffect(() => {
        const displayMode = window.matchMedia('(display-mode: standalone)');
        const checkIfAppMode = () => {
            const isIOSStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
            setIsAppMode(displayMode.matches || isIOSStandalone);
        };
        const handleResize = () => setIsMobileScreen(window.innerWidth < MOBILE_BREAKPOINT_PX);

        checkIfAppMode();
        displayMode.addEventListener('change', checkIfAppMode);
        window.addEventListener('resize', handleResize);

        return () => {
            displayMode.removeEventListener('change', checkIfAppMode);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        if (!isLocalPreviewHost(window.location.hostname)) {
            localStorage.removeItem('hub_mobile_app_preview');
            setForceMobileAppPreview(false);
            return;
        }

        const shouldForcePreview = shouldForceMobileAppPreview(search);
        if (!shouldForcePreview) {
            localStorage.removeItem('hub_mobile_app_preview');
        }
        setForceMobileAppPreview(shouldForcePreview);
    }, [search]);

    const useMobileLayout = (isAppMode && isMobileScreen) || forceMobileAppPreview;
    const isMobileBrowser = isMobileScreen && !isAppMode && !forceMobileAppPreview;

    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const isIOSDevice =
            /iPhone|iPad|iPod/i.test(window.navigator.userAgent)
            || (
                window.navigator.platform === 'MacIntel'
                && window.navigator.maxTouchPoints > 1
            );

        const applyClasses = () => {
            html.classList.toggle('mobile-browser', isMobileBrowser);
            body.classList.toggle('mobile-browser', isMobileBrowser);
            html.classList.toggle('mobile-standalone', useMobileLayout);
            body.classList.toggle('mobile-standalone', useMobileLayout);
            html.classList.toggle('platform-ios', isIOSDevice);
            body.classList.toggle('platform-ios', isIOSDevice);
        };

        const applyViewportVars = () => {
            const visualViewport = window.visualViewport;
            const viewportHeight = visualViewport?.height ?? window.innerHeight;
            const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
            const bottomGap = Math.max(
                0,
                window.innerHeight - viewportHeight - viewportOffsetTop,
            );

            html.style.setProperty('--app-vh', `${viewportHeight * 0.01}px`);
            html.style.setProperty('--app-bottom-gap', `${bottomGap}px`);
        };

        applyClasses();
        applyViewportVars();

        window.addEventListener('resize', applyViewportVars);
        window.addEventListener('orientationchange', applyViewportVars);
        window.visualViewport?.addEventListener('resize', applyViewportVars);
        window.visualViewport?.addEventListener('scroll', applyViewportVars);

        return () => {
            window.removeEventListener('resize', applyViewportVars);
            window.removeEventListener('orientationchange', applyViewportVars);
            window.visualViewport?.removeEventListener('resize', applyViewportVars);
            window.visualViewport?.removeEventListener('scroll', applyViewportVars);
            html.classList.remove('mobile-browser', 'mobile-standalone', 'platform-ios');
            body.classList.remove('mobile-browser', 'mobile-standalone', 'platform-ios');
            html.style.removeProperty('--app-vh');
            html.style.removeProperty('--app-bottom-gap');
        };
    }, [isMobileBrowser, useMobileLayout]);

    return {
        isAppMode,
        isMobileScreen,
        useMobileLayout,
        isMobileBrowser,
    };
};
