import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { AlertCircle, CheckCircle2, Clock, Heart, Loader2, MessageCircle, Send, Sparkles } from 'lucide-react';
import { playClick } from '../utils/audio';
import { useUserRole } from '../hooks/useUserRole';

interface Comment {
    id: number | string;
    post_id: string;
    content: string;
    created_at: string;
    user_id: string | null;
    parent_id: number | string | null;
    user_display_name: string;
    is_anonymous: boolean;
    isDemo?: boolean;
}

interface CommentSectionProps {
    contextId: string;
    title?: string;
    className?: string;
}

interface LikeState {
    count: number;
    liked: boolean;
}

const PAGE_SIZE = 20;

const ADJECTIVES = [
    'Vui Vẻ', 'Tò Mò', 'Nhanh Nhẹn', 'Thông Thái', 'Dũng Cảm',
    'Hài Hước', 'Thân Thiện', 'Sáng Tạo', 'May Mắn', 'Bí Ẩn',
    'Ngây Ngô', 'Chăm Chỉ', 'Đáng Yêu', 'Ngủ Gật', 'Tinh Nghịch'
];
const ANIMALS = [
    'Mèo Mướp', 'Gấu Trúc', 'Thỏ Trắng', 'Sóc Nâu', 'Cáo Đỏ',
    'Cánh Cụt', 'Hổ Con', 'Sư Tử', 'Cá Heo', 'Vịt Bầu',
    'Cún Con', 'Hamster', 'Cú Mèo', 'Koala', 'Gấu Bắc Cực'
];

const generateRandomName = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${animal} ${adj}`;
};

const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;

    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const CommentSection: React.FC<CommentSectionProps> = ({ contextId, title = 'Bình luận', className = '' }) => {
    const { session } = useUserRole();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [activeReplyId, setActiveReplyId] = useState<string | number | null>(null);
    const [likes, setLikes] = useState<Record<string, LikeState>>({});
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isDemo, setIsDemo] = useState(false);

    const [anonymousName, setAnonymousName] = useState('');
    const [isAnonymousSelected, setIsAnonymousSelected] = useState(true);
    const [lockedIdentity, setLockedIdentity] = useState<boolean | null>(null);
    const [identityMessage, setIdentityMessage] = useState('');

    const publicDisplayName = useMemo(() => {
        if (!session?.user) return '';
        return session.user.user_metadata?.full_name
            || session.user.email?.split('@')[0]
            || 'Sinh viên';
    }, [session?.user]);

    const containerClasses = className
        ? className
        : 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full';

    const rootComments = useMemo(() => {
        const map = new Map<string | number | null, Comment[]>();
        comments.forEach((comment) => {
            const key = comment.parent_id ?? null;
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key)!.push(comment);
        });
        return map;
    }, [comments]);

    const canToggleIdentity = Boolean(session?.user) && lockedIdentity === null;

    const currentIdentityLabel = useMemo(() => {
        if (isAnonymousSelected || !session?.user) {
            return anonymousName || 'Ẩn danh';
        }
        return publicDisplayName || 'Sinh viên';
    }, [anonymousName, isAnonymousSelected, publicDisplayName, session?.user]);

    const setToastMessage = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const ensureAnonymousName = () => {
        const storedName = localStorage.getItem('hub_anonymous_name');
        if (storedName) {
            setAnonymousName(storedName);
            return storedName;
        }
        const newName = generateRandomName();
        localStorage.setItem('hub_anonymous_name', newName);
        setAnonymousName(newName);
        return newName;
    };

    useEffect(() => {
        ensureAnonymousName();
    }, []);

    useEffect(() => {
        setLockedIdentity(null);
        setIdentityMessage('');
        if (!session?.user) {
            setIsAnonymousSelected(true);
            setLockedIdentity(true);
            setIdentityMessage('Bạn đang tương tác ẩn danh trong bài viết này.');
        }
    }, [contextId, session?.user]);

    const fetchComments = async (offset: number) => {
        if (!supabase) return;
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        try {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', contextId)
                .order('created_at', { ascending: true })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            if (data) {
                if (data.length < PAGE_SIZE) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }

                if (offset === 0) {
                    setComments(data as Comment[]);
                } else {
                    setComments((prev) => {
                        const existingIds = new Set(prev.map((c) => c.id));
                        const newUnique = (data as Comment[]).filter((c) => !existingIds.has(c.id));
                        return [...prev, ...newUnique];
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching comments:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const fetchLikes = async (commentIds: (string | number)[]) => {
        if (!supabase || commentIds.length === 0) return;
        try {
            const { data, error } = await supabase
                .from('comment_likes')
                .select('comment_id, user_id, is_anonymous')
                .in('comment_id', commentIds);

            if (error) throw error;

            const likeMap: Record<string, LikeState> = {};
            commentIds.forEach((id) => {
                likeMap[String(id)] = { count: 0, liked: false };
            });

            (data || []).forEach((like: { comment_id: string | number; user_id: string | null }) => {
                const key = String(like.comment_id);
                if (!likeMap[key]) {
                    likeMap[key] = { count: 0, liked: false };
                }
                likeMap[key].count += 1;
                if (session?.user?.id && like.user_id === session.user.id) {
                    likeMap[key].liked = true;
                }
            });

            setLikes(likeMap);
        } catch (err) {
            console.error('Error fetching likes:', err);
        }
    };

    const checkIdentityLock = async (commentIds: (string | number)[]) => {
        if (!supabase || !session?.user) return;

        try {
            const { data: commentHistory, error: commentError } = await supabase
                .from('comments')
                .select('is_anonymous')
                .eq('post_id', contextId)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: true })
                .limit(1);

            if (commentError) throw commentError;

            if (commentHistory && commentHistory.length > 0) {
                const locked = commentHistory[0].is_anonymous;
                const anonLabel = anonymousName || ensureAnonymousName();
                setLockedIdentity(locked);
                setIsAnonymousSelected(locked);
                setIdentityMessage(`Bạn đang tương tác dưới tên ${locked ? anonLabel : publicDisplayName} trong bài viết này.`);
                return;
            }

            if (commentIds.length === 0) return;

            const { data: likeHistory, error: likeError } = await supabase
                .from('comment_likes')
                .select('is_anonymous')
                .eq('user_id', session.user.id)
                .in('comment_id', commentIds)
                .limit(1);

            if (likeError) throw likeError;

            if (likeHistory && likeHistory.length > 0) {
                const locked = likeHistory[0].is_anonymous;
                const anonLabel = anonymousName || ensureAnonymousName();
                setLockedIdentity(locked);
                setIsAnonymousSelected(locked);
                setIdentityMessage(`Bạn đang tương tác dưới tên ${locked ? anonLabel : publicDisplayName} trong bài viết này.`);
            }
        } catch (err) {
            console.error('Error checking identity lock:', err);
        }
    };

    useEffect(() => {
        if (!supabase) {
            setIsDemo(true);
            setComments([
                {
                    id: 'demo-1',
                    post_id: contextId,
                    content: 'Giao diện web đẹp quá, mong sớm có full tính năng!',
                    created_at: new Date().toISOString(),
                    user_display_name: 'Mèo Máy Thông Thái',
                    is_anonymous: true,
                    parent_id: null,
                    user_id: null,
                    isDemo: true
                },
                {
                    id: 'demo-2',
                    post_id: contextId,
                    content: 'Có ai tìm thấy thẻ sinh viên của mình không ạ?',
                    created_at: new Date(Date.now() - 3600000).toISOString(),
                    user_display_name: 'Thỏ Trắng Ngây Ngô',
                    is_anonymous: true,
                    parent_id: null,
                    user_id: null,
                    isDemo: true
                }
            ]);
            setHasMore(false);
            return;
        }

        fetchComments(0);
    }, [contextId]);

    useEffect(() => {
        if (!supabase) return;
        const commentIds = comments.map((comment) => comment.id);
        fetchLikes(commentIds);
        if (session?.user && lockedIdentity === null) {
            checkIdentityLock(commentIds);
        }
    }, [comments, session?.user, lockedIdentity]);

    const handleLoadMore = () => {
        playClick();
        fetchComments(comments.length);
    };

    const lockIdentityAfterInteraction = () => {
        if (!session?.user || lockedIdentity !== null) return;
        const anonLabel = anonymousName || ensureAnonymousName();
        setLockedIdentity(isAnonymousSelected);
        setIdentityMessage(`Bạn đang tương tác dưới tên ${isAnonymousSelected ? anonLabel : publicDisplayName} trong bài viết này.`);
    };

    const buildDisplayName = () => {
        if (isAnonymousSelected || !session?.user) {
            return ensureAnonymousName();
        }
        return publicDisplayName || 'Sinh viên';
    };

    const handleSubmit = async (e: React.FormEvent, parentId: string | number | null = null) => {
        e.preventDefault();
        const content = parentId ? replyDrafts[String(parentId)] : newComment;
        if (!content?.trim()) return;

        playClick();
        setSubmitting(true);

        const displayName = buildDisplayName();
        const optimisticComment: Comment = {
            id: `temp-${Date.now()}`,
            post_id: contextId,
            content,
            created_at: new Date().toISOString(),
            user_display_name: displayName,
            is_anonymous: isAnonymousSelected || !session?.user,
            parent_id: parentId,
            user_id: session?.user?.id ?? null
        };

        setComments((prev) => [...prev, optimisticComment]);
        if (parentId) {
            setReplyDrafts((prev) => ({ ...prev, [String(parentId)]: '' }));
            setActiveReplyId(null);
        } else {
            setNewComment('');
        }

        if (!supabase) {
            setSubmitting(false);
            setToastMessage('Demo: Bình luận đã được thêm.', 'success');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([
                    {
                        post_id: contextId,
                        content,
                        user_display_name: displayName,
                        is_anonymous: isAnonymousSelected || !session?.user,
                        parent_id: parentId,
                        user_id: session?.user?.id ?? null
                    }
                ])
                .select();

            if (error) throw error;

            if (data && data.length > 0) {
                setComments((prev) => prev.map((comment) => (comment.id === optimisticComment.id ? data[0] : comment)));
                lockIdentityAfterInteraction();
                setToastMessage('Đã gửi bình luận thành công!', 'success');
            }
        } catch (err) {
            console.error('Error adding comment:', err);
            setComments((prev) => prev.filter((comment) => comment.id !== optimisticComment.id));
            setToastMessage('Gửi thất bại. Vui lòng thử lại.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleLike = async (commentId: string | number) => {
        if (!session?.user) {
            setToastMessage('Vui lòng đăng nhập để thả tim.', 'error');
            return;
        }

        playClick();
        const key = String(commentId);
        const current = likes[key] || { count: 0, liked: false };
        const nextLiked = !current.liked;

        setLikes((prev) => ({
            ...prev,
            [key]: {
                count: prev[key] ? prev[key].count + (nextLiked ? 1 : -1) : (nextLiked ? 1 : 0),
                liked: nextLiked
            }
        }));

        if (!supabase) {
            lockIdentityAfterInteraction();
            return;
        }

        try {
            if (nextLiked) {
                const { error } = await supabase
                    .from('comment_likes')
                    .insert({
                        comment_id: commentId,
                        user_id: session.user.id,
                        is_anonymous: isAnonymousSelected
                    });

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('comment_likes')
                    .delete()
                    .eq('comment_id', commentId)
                    .eq('user_id', session.user.id);

                if (error) throw error;
            }

            lockIdentityAfterInteraction();
        } catch (err) {
            console.error('Error updating like:', err);
            setLikes((prev) => ({
                ...prev,
                [key]: current
            }));
            setToastMessage('Không thể cập nhật lượt thích.', 'error');
        }
    };

    const renderComments = (parentId: string | number | null = null, depth = 0) => {
        const items = rootComments.get(parentId) || [];
        if (items.length === 0) return null;

        return (
            <div className={depth > 0 ? 'space-y-4 pl-6 border-l border-gray-200' : 'space-y-4'}>
                {items.map((comment) => {
                    const likeState = likes[String(comment.id)] || { count: 0, liked: false };
                    const isAnonymous = comment.is_anonymous;
                    const displayName = isAnonymous ? comment.user_display_name : comment.user_display_name;
                    return (
                        <div key={comment.id} className="flex gap-3">
                            <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${isAnonymous ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-[#003375] text-white border-[#003375]'}`}>
                                {displayName.charAt(0).toUpperCase()}
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="font-bold text-gray-800">{displayName}</span>
                                    {isAnonymous && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Ẩn danh</span>}
                                    <span className="flex items-center gap-1 text-[10px]"><Clock size={10} /> {formatTime(comment.created_at)}</span>
                                </div>

                                <div className="mt-1 bg-white border border-gray-100 rounded-xl rounded-tl-none p-3 text-sm text-gray-700 shadow-sm">
                                    {comment.content}
                                </div>

                                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleLike(comment.id)}
                                        className={`flex items-center gap-1 transition ${likeState.liked ? 'text-red-500' : 'hover:text-red-500'}`}
                                    >
                                        <Heart size={14} className={likeState.liked ? 'fill-red-500' : ''} />
                                        {likeState.count}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveReplyId(activeReplyId === comment.id ? null : comment.id)}
                                        className="hover:text-[#003375]"
                                    >
                                        Trả lời
                                    </button>
                                </div>

                                {activeReplyId === comment.id && (
                                    <form onSubmit={(e) => handleSubmit(e, comment.id)} className="mt-3 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={replyDrafts[String(comment.id)] || ''}
                                            onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [String(comment.id)]: e.target.value }))}
                                            placeholder={`Trả lời với tên "${currentIdentityLabel}"...`}
                                            className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-[#003375]"
                                            disabled={submitting}
                                        />
                                        <button
                                            type="submit"
                                            disabled={submitting || !(replyDrafts[String(comment.id)] || '').trim()}
                                            className="p-2 rounded-full bg-[#003375] text-white hover:bg-[#002855] transition disabled:opacity-50"
                                        >
                                            <Send size={14} />
                                        </button>
                                    </form>
                                )}

                                {renderComments(comment.id, depth + 1)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className={containerClasses}>
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-[#003375] flex items-center gap-2 text-sm">
                    <MessageCircle size={18} />
                    {title} <span className="text-gray-400 font-normal">({comments.length})</span>
                </h3>
                {isDemo && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-200 flex items-center gap-1">
                        <AlertCircle size={10} /> Demo Mode
                    </span>
                )}
            </div>

            <div className="p-4 border-b bg-white">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-full px-3 py-2">
                        <span className={`text-xs font-bold ${isAnonymousSelected ? 'text-[#003375]' : 'text-gray-400'}`}>🎭 Ẩn danh</span>
                        <button
                            type="button"
                            onClick={() => {
                                if (!canToggleIdentity) return;
                                setIsAnonymousSelected((prev) => !prev);
                            }}
                            className={`w-12 h-6 rounded-full relative transition ${canToggleIdentity ? (isAnonymousSelected ? 'bg-[#003375]' : 'bg-gray-300') : 'bg-gray-300'}`}
                            disabled={!canToggleIdentity}
                            aria-label="Chuyển danh tính"
                        >
                            <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${isAnonymousSelected ? 'left-1' : 'left-6'}`}
                            />
                        </button>
                        <span className={`text-xs font-bold ${!isAnonymousSelected ? 'text-[#003375]' : 'text-gray-400'}`}>🎓 Tên Sinh Viên</span>
                    </div>
                    {identityMessage && (
                        <p className="text-[11px] text-gray-500">{identityMessage}</p>
                    )}
                    {!identityMessage && !session?.user && (
                        <p className="text-[11px] text-gray-500">Bạn đang tương tác ẩn danh vì chưa đăng nhập.</p>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/50">
                {loading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3 animate-pulse">
                            <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                                <div className="h-10 bg-gray-200 rounded w-full"></div>
                            </div>
                        </div>
                    ))
                ) : comments.length > 0 ? (
                    <>
                        {renderComments(null, 0)}
                        {hasMore && (
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="w-full py-2 text-xs font-bold text-gray-500 hover:text-[#003375] hover:bg-gray-100 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : 'Xem thêm bình luận cũ'}
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        <MessageCircle size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Chưa có bình luận nào.<br />Hãy là người đầu tiên!</p>
                    </div>
                )}
            </div>

            <div className="p-3 bg-white border-t border-gray-100 relative shrink-0 z-10">
                {toast && (
                    <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 animate-slideUp ${toast.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                        {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {toast.msg}
                    </div>
                )}

                <form onSubmit={(e) => handleSubmit(e, null)} className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder={`Bình luận với tên "${currentIdentityLabel}"...`}
                            className="w-full pl-4 pr-4 py-2.5 border rounded-full outline-none transition-all text-sm bg-gray-50 border-gray-200 focus:ring-2 focus:ring-[#003375] focus:border-[#003375] placeholder-gray-400"
                            disabled={submitting}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {submitting && <Loader2 size={16} className="animate-spin text-[#003375]" />}
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting}
                        className="p-2.5 rounded-full transition-all shadow-sm flex items-center gap-1 bg-[#003375] text-white hover:bg-[#002855] hover:shadow-md active:scale-95 disabled:opacity-50"
                    >
                        <Send size={18} />
                    </button>
                </form>
                <div className="text-center mt-2">
                    <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
                        <Sparkles size={10} /> Danh tính của bạn {isAnonymousSelected || !session?.user ? 'đang ẩn danh' : 'đang công khai'} trong bài viết này.
                    </p>
                </div>
            </div>
        </div>
    );
};
