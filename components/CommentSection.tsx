import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Send, User, MessageCircle, Clock, AlertCircle, Loader2, Sparkles, CheckCircle2, ChevronDown, Edit2, X, Save } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- Types ---
interface Comment {
    id: number | string;
    post_id: string;
    content: string;
    created_at: string;
    updated_at?: string; // Optional, for edit history check
    user_display_name: string;
    is_anonymous: boolean;
    isDemo?: boolean; 
}

interface CommentSectionProps {
    contextId: string;
    title?: string;
    className?: string;
}

// --- Constants ---
const PAGE_SIZE = 5;
const COOLDOWN_TIME = 10; // seconds

// --- Random Name Logic ---
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

// --- Time Formatter ---
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

export const CommentSection: React.FC<CommentSectionProps> = ({ contextId, title = "Bình luận", className = "" }) => {
    // Data State
    const [comments, setComments] = useState<Comment[]>([]);
    const [currentUserIdentity, setCurrentUserIdentity] = useState('');
    
    // UI State
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [isDemo, setIsDemo] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [hasMore, setHasMore] = useState(true);

    // Feature State: Cooldown
    const [cooldown, setCooldown] = useState(0);

    // Feature State: Editing
    const [editingId, setEditingId] = useState<string | number | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // --- 1. Initialization & Identity ---
    useEffect(() => {
        // Setup Identity
        const storedName = localStorage.getItem('hub_anonymous_name');
        if (storedName) {
            setCurrentUserIdentity(storedName);
        } else {
            const newName = generateRandomName();
            localStorage.setItem('hub_anonymous_name', newName);
            setCurrentUserIdentity(newName);
        }

        // Check Demo or Real
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
                    isDemo: true 
                },
                { 
                    id: 'demo-2', 
                    post_id: contextId, 
                    content: 'Có ai tìm thấy thẻ sinh viên của mình không ạ?', 
                    created_at: new Date(Date.now() - 3600000).toISOString(), 
                    user_display_name: 'Thỏ Trắng Ngây Ngô', 
                    is_anonymous: true,
                    isDemo: true 
                }
            ]);
            setHasMore(false); // Demo has fixed data
        } else {
            // Initial Fetch
            fetchComments(0);
        }
    }, [contextId]);

    // --- 2. Cooldown Timer ---
    useEffect(() => {
        let interval: any;
        if (cooldown > 0) {
            interval = setInterval(() => {
                setCooldown((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [cooldown]);

    // --- 3. Fetch Data (Pagination) ---
    const fetchComments = async (offset: number) => {
        if (!supabase) return;
        
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        try {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', contextId)
                .order('created_at', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            if (data) {
                if (data.length < PAGE_SIZE) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }

                if (offset === 0) {
                    setComments(data);
                } else {
                    // Filter duplicates just in case realtime updates happened
                    setComments(prev => {
                        const existingIds = new Set(prev.map(c => c.id));
                        const newUnique = data.filter(c => !existingIds.has(c.id));
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

    const handleLoadMore = () => {
        playClick();
        fetchComments(comments.length);
    };

    // --- 4. Submit New Comment ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation & Checks
        if (!newComment.trim()) return;
        if (cooldown > 0) return; // Prevent spam

        playClick();
        const submitName = currentUserIdentity || generateRandomName();
        setSubmitting(true);

        if (!supabase) {
            // Demo Mode
            setTimeout(() => {
                const demoComment: Comment = {
                    id: Date.now(),
                    post_id: contextId,
                    content: newComment,
                    created_at: new Date().toISOString(),
                    user_display_name: submitName + ' (Demo)',
                    is_anonymous: true,
                    isDemo: true
                };
                setComments([demoComment, ...comments]);
                setNewComment('');
                setSubmitting(false);
                activateCooldown();
                alert("Đang chạy Demo: Comment đã hiện lên danh sách (nhưng chưa lưu vào database).");
            }, 600);
            return;
        }

        // Real Mode
        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([
                    { 
                        post_id: contextId, 
                        content: newComment, 
                        user_display_name: submitName, 
                        is_anonymous: true 
                    }
                ])
                .select();

            if (error) throw error;

            if (data) {
                setComments([data[0], ...comments]);
                setNewComment('');
                setToast({ msg: 'Đã gửi bình luận thành công!', type: 'success' });
                activateCooldown(); // Start Anti-Spam Timer
            }
        } catch (err) {
            console.error('Error adding comment:', err);
            setToast({ msg: 'Gửi thất bại. Vui lòng thử lại.', type: 'error' });
        } finally {
            setSubmitting(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    const activateCooldown = () => {
        setCooldown(COOLDOWN_TIME);
    };

    // --- 5. Edit Comment ---
    const startEditing = (comment: Comment) => {
        playClick();
        setEditingId(comment.id);
        setEditContent(comment.content);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditContent('');
    };

    const saveEdit = async () => {
        if (!editContent.trim()) return;
        if (!editingId) return;

        setIsSavingEdit(true);
        const timestamp = new Date().toISOString();

        // --- Demo Mode ---
        if (!supabase) {
            setComments(prev => prev.map(c => c.id === editingId ? { ...c, content: editContent, updated_at: timestamp } : c));
            setIsSavingEdit(false);
            cancelEditing();
            return;
        }

        // --- Real Mode ---
        try {
            // Cập nhật content và updated_at
            const { error } = await supabase
                .from('comments')
                .update({ 
                    content: editContent,
                    updated_at: timestamp
                })
                .eq('id', editingId);

            if (error) throw error;

            // Cập nhật State ngay lập tức để giao diện thay đổi
            setComments(prev => prev.map(c => c.id === editingId ? { 
                ...c, 
                content: editContent,
                updated_at: timestamp
            } : c));

            setToast({ msg: 'Đã chỉnh sửa!', type: 'success' });
            cancelEditing();
        } catch (err) {
            console.error('Error updating comment:', err);
            setToast({ msg: 'Không thể lưu sửa đổi.', type: 'error' });
        } finally {
            setIsSavingEdit(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    // Style
    const containerClasses = className 
        ? className 
        : "bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full";

    return (
        <div className={containerClasses}>
            {/* Header */}
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

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/50">
                {loading ? (
                    // Skeleton Loading
                    [1, 2, 3].map(i => (
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
                        {comments.map((comment) => {
                            const isOwner = comment.user_display_name === currentUserIdentity;
                            const isEditing = editingId === comment.id;
                            
                            // Check if edited: updated_at exists AND differs from created_at
                            const isEdited = comment.updated_at && comment.updated_at !== comment.created_at;

                            return (
                                <div key={comment.id} className="flex gap-3 animate-fadeIn group">
                                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${isOwner ? 'bg-[#003375] text-white border-[#003375]' : 'bg-gradient-to-br from-blue-100 to-indigo-100 border-blue-200 text-[#003375]'}`}>
                                        {comment.user_display_name.charAt(0).toUpperCase()}
                                    </div>
                                    
                                    <div className="flex-1 max-w-[85%]">
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className={`font-bold text-xs ${isOwner ? 'text-[#003375]' : 'text-gray-800'}`}>
                                                {comment.user_display_name} {isOwner && '(Bạn)'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                                <Clock size={8} /> {formatTime(comment.created_at)}
                                            </span>
                                            {isEdited && (
                                                <span 
                                                    className="text-[10px] text-gray-400 italic cursor-help border-b border-dotted border-gray-300"
                                                    title={`Đã chỉnh sửa: ${new Date(comment.updated_at!).toLocaleString('vi-VN')}`}
                                                >
                                                    (đã chỉnh sửa)
                                                </span>
                                            )}
                                        </div>

                                        {isEditing ? (
                                            <div className="animate-fadeIn">
                                                <textarea
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    className="w-full p-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                                    rows={2}
                                                />
                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button 
                                                        onClick={cancelEditing}
                                                        className="px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded flex items-center gap-1"
                                                    >
                                                        <X size={12}/> Hủy
                                                    </button>
                                                    <button 
                                                        onClick={saveEdit}
                                                        disabled={isSavingEdit || !editContent.trim()}
                                                        className="px-2 py-1 text-xs font-bold text-white bg-[#003375] hover:bg-[#002855] rounded flex items-center gap-1 disabled:opacity-50"
                                                    >
                                                        {isSavingEdit ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Lưu
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group/bubble">
                                                <div className={`p-2.5 rounded-2xl rounded-tl-none text-sm leading-relaxed shadow-sm border ${isOwner ? 'bg-blue-50 border-blue-100 text-gray-800' : 'bg-white border-gray-100 text-gray-700'}`}>
                                                    {comment.content}
                                                </div>
                                                
                                                {/* Edit Button (Only visible for owner on hover) */}
                                                {isOwner && (
                                                    <button 
                                                        onClick={() => startEditing(comment)}
                                                        className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-400 hover:text-[#003375]"
                                                        title="Sửa bình luận"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Load More Button */}
                        {hasMore && (
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="w-full py-2 text-xs font-bold text-gray-500 hover:text-[#003375] hover:bg-gray-100 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                                Xem thêm bình luận cũ
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        <MessageCircle size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Chưa có bình luận nào.<br/>Hãy là người đầu tiên!</p>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-gray-100 relative shrink-0 z-10">
                {toast && (
                    <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 animate-slideUp ${toast.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                        {toast.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                        {toast.msg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && cooldown > 0) {
                                    e.preventDefault();
                                }
                            }}
                            placeholder={cooldown > 0 ? `Vui lòng chờ ${cooldown}s...` : `Bình luận với tên "${currentUserIdentity || '...'}"...`}
                            className={`w-full pl-4 pr-4 py-2.5 border rounded-full outline-none transition-all text-sm ${cooldown > 0 ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-gray-50 border-gray-200 focus:ring-2 focus:ring-[#003375] focus:border-[#003375] placeholder-gray-400'}`}
                            disabled={submitting || cooldown > 0}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                           {submitting && <Loader2 size={16} className="animate-spin text-[#003375]" />}
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting || cooldown > 0}
                        className={`p-2.5 rounded-full transition-all shadow-sm flex items-center gap-1 ${cooldown > 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#003375] text-white hover:bg-[#002855] hover:shadow-md active:scale-95'}`}
                    >
                        {cooldown > 0 ? (
                            <span className="text-[10px] font-bold w-6 text-center">{cooldown}</span>
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
                <div className="text-center mt-2">
                    <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
                        <Sparkles size={10} /> Danh tính của bạn được ẩn danh hoàn toàn
                    </p>
                </div>
            </div>
        </div>
    );
};
