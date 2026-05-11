import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';

export type PlanId = 'free' | 'premium_monthly' | 'premium_semester' | 'premium_yearly';

export interface PremiumPlan {
    id: PlanId;
    name: string;
    description: string;
    price: number;
    duration_days: number;
    features: string[];
    is_active: boolean;
}

export interface UserSubscription {
    id: number;
    user_id: string;
    plan_id: PlanId;
    status: 'active' | 'expired' | 'cancelled' | 'pending';
    started_at: string;
    expires_at: string;
    payment_method: string | null;
    payment_ref: string | null;
    amount_paid: number;
    auto_renew: boolean;
}

interface SubscriptionState {
    isPremium: boolean;
    plan: PlanId;
    subscription: UserSubscription | null;
    daysRemaining: number;
    loading: boolean;
    aiUsageToday: number;
    aiLimitReached: boolean;
}

const FREE_AI_LIMIT = 5; // 5 tin nhắn/ngày cho user miễn phí

export const useSubscription = (userId?: string) => {
    const [state, setState] = useState<SubscriptionState>({
        isPremium: false,
        plan: 'free',
        subscription: null,
        daysRemaining: 0,
        loading: true,
        aiUsageToday: 0,
        aiLimitReached: false,
    });

    const fetchSubscription = useCallback(async () => {
        if (!userId || !supabase) {
            setState(prev => ({ ...prev, loading: false }));
            return;
        }

        try {
            // 1. Lấy subscription đang active
            const { data: subData, error: subError } = await supabase
                .from('user_subscriptions')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active')
                .gt('expires_at', new Date().toISOString())
                .order('expires_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (subError) throw subError;

            // 2. Lấy AI usage hôm nay
            const today = new Date().toISOString().split('T')[0];
            const { data: usageData } = await supabase
                .from('ai_usage_daily')
                .select('message_count')
                .eq('user_id', userId)
                .eq('date', today)
                .maybeSingle();

            const aiUsageToday = usageData?.message_count || 0;
            const isPremium = !!subData && subData.plan_id !== 'free';
            const daysRemaining = subData
                ? Math.max(0, Math.ceil((new Date(subData.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : 0;

            setState({
                isPremium,
                plan: subData?.plan_id || 'free',
                subscription: subData || null,
                daysRemaining,
                loading: false,
                aiUsageToday,
                aiLimitReached: !isPremium && aiUsageToday >= FREE_AI_LIMIT,
            });
        } catch (err) {
            console.error('Lỗi lấy thông tin subscription:', err);
            setState(prev => ({ ...prev, loading: false }));
        }
    }, [userId]);

    // Tăng AI usage count (gọi mỗi khi user gửi tin nhắn)
    const incrementAiUsage = useCallback(async (): Promise<{ allowed: boolean; count: number }> => {
        if (!userId || !supabase) return { allowed: false, count: 0 };

        // Premium user luôn được phép
        if (state.isPremium) return { allowed: true, count: state.aiUsageToday };

        const today = new Date().toISOString().split('T')[0];

        try {
            // Upsert: tăng count hoặc tạo mới
            const { data, error } = await supabase
                .from('ai_usage_daily')
                .upsert(
                    { user_id: userId, date: today, message_count: state.aiUsageToday + 1 },
                    { onConflict: 'user_id,date' }
                )
                .select('message_count')
                .single();

            if (error) throw error;

            const newCount = data?.message_count || state.aiUsageToday + 1;
            const limitReached = newCount >= FREE_AI_LIMIT;

            setState(prev => ({
                ...prev,
                aiUsageToday: newCount,
                aiLimitReached: limitReached,
            }));

            return { allowed: newCount <= FREE_AI_LIMIT, count: newCount };
        } catch (err) {
            console.error('Lỗi cập nhật AI usage:', err);
            // Cho phép nếu lỗi DB (graceful degradation)
            return { allowed: true, count: state.aiUsageToday };
        }
    }, [userId, state.isPremium, state.aiUsageToday]);

    // Refresh subscription status
    const refresh = useCallback(() => {
        setState(prev => ({ ...prev, loading: true }));
        fetchSubscription();
    }, [fetchSubscription]);

    useEffect(() => {
        fetchSubscription();
    }, [fetchSubscription]);

    return {
        ...state,
        incrementAiUsage,
        refresh,
        FREE_AI_LIMIT,
    };
};

// Helper: Lấy danh sách plans
export const fetchPremiumPlans = async (): Promise<PremiumPlan[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('premium_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) {
        console.error('Lỗi lấy plans:', error);
        return [];
    }

    return (data || []).map(plan => ({
        ...plan,
        features: typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []),
    }));
};
