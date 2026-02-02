import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

const FOLLOW_TABLE = 'follows';

const FollowButton = ({ targetUserId, currentUserId }) => {
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const loadFollowState = useCallback(async () => {
        if (!supabase || !targetUserId || !currentUserId) {
            setIsFollowing(false);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const { data, error } = await supabase
                .from(FOLLOW_TABLE)
                .select('follower_id')
                .eq('follower_id', currentUserId)
                .eq('following_id', targetUserId)
                .maybeSingle();

            if (error) {
                throw error;
            }

            setIsFollowing(Boolean(data));
        } catch (err) {
            console.error('Failed to load follow state:', err);
            setErrorMessage('Không thể kiểm tra trạng thái theo dõi.');
        } finally {
            setIsLoading(false);
        }
    }, [currentUserId, targetUserId]);

    useEffect(() => {
        loadFollowState();
    }, [loadFollowState]);

    const handleToggleFollow = async () => {
        if (!supabase || !targetUserId || !currentUserId || isSaving) {
            return;
        }

        setErrorMessage(null);
        const nextState = !isFollowing;
        setIsFollowing(nextState);
        setIsSaving(true);

        try {
            if (nextState) {
                const { error } = await supabase
                    .from(FOLLOW_TABLE)
                    .insert({
                        follower_id: currentUserId,
                        following_id: targetUserId,
                    });

                if (error) {
                    throw error;
                }
            } else {
                const { error } = await supabase
                    .from(FOLLOW_TABLE)
                    .delete()
                    .eq('follower_id', currentUserId)
                    .eq('following_id', targetUserId);

                if (error) {
                    throw error;
                }
            }
        } catch (err) {
            console.error('Failed to update follow state:', err);
            setIsFollowing(!nextState);
            setErrorMessage('Không thể cập nhật theo dõi. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    const buttonLabel = isFollowing ? 'Đang theo dõi' : 'Follow';
    const buttonClasses = isFollowing
        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        : 'bg-blue-600 text-white hover:bg-blue-700';

    return (
        <div className="flex flex-col items-start gap-2">
            <button
                type="button"
                onClick={handleToggleFollow}
                disabled={isLoading || isSaving || !currentUserId || !targetUserId}
                className={`px-5 py-2 rounded-full font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${buttonClasses}`}
            >
                {isLoading ? 'Đang tải...' : buttonLabel}
            </button>
            {errorMessage && (
                <p className="text-sm text-red-500">{errorMessage}</p>
            )}
        </div>
    );
};

export default FollowButton;
