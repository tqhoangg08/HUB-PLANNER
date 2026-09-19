import { AIAdvisor } from './AIAdvisor';
import { MobileAIAdvisor } from './MobileAIAdvisor';

interface AppAiAdvisorOverlayProps {
    userId?: string;
    mobileScreen: boolean;
    mobileLayout: boolean;
    showHint: boolean;
}

export const AppAiAdvisorOverlay = ({
    userId,
    mobileScreen,
    mobileLayout,
    showHint,
}: AppAiAdvisorOverlayProps) => (
    <>
        {!mobileLayout && !mobileScreen && (
            <div className="desktop-ai-hint fixed bottom-[86px] right-6 z-50 flex flex-col items-end pointer-events-none">
                <div
                    className={`relative w-44 bg-white/95 text-gray-700 text-xs font-bold p-2.5 rounded-xl shadow-lg border border-blue-100 transition-all duration-500 ease-in-out transform origin-bottom-right ${
                        showHint
                            ? 'opacity-100 scale-100 translate-y-0'
                            : 'opacity-0 scale-50 translate-y-4'
                    }`}
                >
                    <p>Trợ lý AI sẵn sàng hỗ trợ học tập.</p>
                    <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-white transform rotate-45 border-b border-r border-blue-100" />
                </div>
            </div>
        )}

        {mobileScreen
            ? <MobileAIAdvisor userId={userId} />
            : <AIAdvisor userId={userId} />}
    </>
);
