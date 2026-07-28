import { useEffect, useState } from 'react';

const INITIAL_SHOW_DELAY_MS = 2_000;
const REPEAT_INTERVAL_MS = 10_000;
const REPEAT_VISIBLE_DURATION_MS = 5_000;

export const useAiHintBubble = () => {
    const [showBubble, setShowBubble] = useState(false);

    useEffect(() => {
        const hideTimers = new Set<number>();
        const initialShowTimer = window.setTimeout(
            () => setShowBubble(true),
            INITIAL_SHOW_DELAY_MS
        );
        const repeatTimer = window.setInterval(() => {
            setShowBubble(true);
            const hideTimer = window.setTimeout(() => {
                setShowBubble(false);
                hideTimers.delete(hideTimer);
            }, REPEAT_VISIBLE_DURATION_MS);
            hideTimers.add(hideTimer);
        }, REPEAT_INTERVAL_MS);

        return () => {
            window.clearTimeout(initialShowTimer);
            window.clearInterval(repeatTimer);
            hideTimers.forEach(timer => window.clearTimeout(timer));
        };
    }, []);

    return showBubble;
};
