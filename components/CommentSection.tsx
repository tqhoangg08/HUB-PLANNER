import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Send, User, MessageCircle, Clock, AlertCircle, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- Types ---
interface Comment {
    id: number | string;
    post_id: string;
    content: string;
    created_at: string;
    user_display_name: string;
    is_anonymous: boolean;
    isDemo?: boolean; // Internal flag for UI
}

interface CommentSectionProps {
    contextId: string; // This maps to post_id in DB
    title?: string;
    className?: string; // Allow custom styling for different layouts
}

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
    const diff = (now.getTime() - date.getTime()) / 1000; // seconds

    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const CommentSection: React.FC<CommentSectionProps> = ({ contextId, title = "Bình luận", className = "" }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [isDemo, setIsDemo] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    // Initial Load
    useEffect(() => {
        if (!supabase) {
            // DEMO MODE SETUP
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
                },
                { 
                    id: 'demo-3', 
                    post_id: contextId, 
                    content: 'Cảm ơn bạn đã đăng tin tìm giúp mình nhé.', 
                    created_at: new Date(Date.now() - 7200000).toISOString(), 
                    user_display_name: 'Gấu Trúc Vui Vẻ', 
                    is_anonymous: true,
                    isDemo: true 
                }
            ]);
        } else {
            // REAL SUPABASE MODE
            fetchComments();
        }
    }, [contextId]);

    const fetchComments = async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', contextId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setComments(data || []);
        } catch (err) {
            console.error('Error fetching comments:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        playClick();
        
        const randomName = generateRandomName();
        setSubmitting(true);

        if (!supabase) {
            // --- DEMO SUBMISSION ---
            setTimeout(() => {
                const demoComment: Comment = {
                    id: Date.now(),
                    post_id: contextId,
                    content: newComment,
                    created_at: new Date().toISOString(),
                    user_display_name: randomName + ' (Demo)',
                    is_anonymous: true,
                    isDemo: true
                };
                setComments([demoComment, ...comments]);
                setNewComment('');
                setSubmitting(false);
                alert("Đang chạy Demo: Comment đã hiện lên danh sách (nhưng chưa lưu vào database).");
            }, 600);
            return;
        }

        // --- REAL SUBMISSION ---
        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([
                    { 
                        post_id: contextId, 
                        content: newComment, 
                        user_display_name: randomName, 
                        is_anonymous: true 
                    }
                ])
                .select();

            if (error) throw error;

            if (data) {
                setComments([data[0], ...comments]);
                setNewComment('');
                setToast({ msg: 'Đã gửi bình luận thành công!', type: 'success' });
                setTimeout(() => setToast(null), 3000);
            }
        } catch (err) {
            console.error('Error adding comment:', err);
            setToast({ msg: 'Gửi thất bại. Vui lòng thử lại.', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setSubmitting(false);
        }
    };

    // Default classes: If className is provided, use it. Otherwise use default card style.
    // We removed max-h-[500px] to allow flex parent to control height.
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
                    comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 animate-fadeIn group">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200 text-[#003375] flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                                {comment.user_display_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 max-w-[85%]">
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className="font-bold text-xs text-gray-800">{comment.user_display_name}</span>
                                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                        <Clock size={8} /> {formatTime(comment.created_at)}
                                    </span>
                                </div>
                                <div className="bg-white p-2.5 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm text-sm text-gray-700 leading-relaxed">
                                    {comment.content}
                                </div>
                            </div>
                        </div>
                    ))
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
                            placeholder={isDemo ? `Bình luận dưới tên "${generateRandomName()}"...` : "Viết bình luận..."}
                            className="w-full pl-4 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all text-sm placeholder-gray-400"
                            disabled={submitting}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                           {submitting && <Loader2 size={16} className="animate-spin text-[#003375]" />}
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting}
                        className="p-2.5 bg-[#003375] text-white rounded-full hover:bg-[#002855] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-sm hover:shadow-md"
                    >
                        <Send size={18} />
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
