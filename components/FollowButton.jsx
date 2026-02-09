import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { UserPlus, UserCheck, Loader2, Users } from 'lucide-react';

const FollowButton = ({ targetUserId, currentUserId }) => {
  const [status, setStatus] = useState('loading'); // 'none' | 'following' | 'friends'
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!currentUserId || !targetUserId) return;

      // 1. Mình có follow họ chưa?
      const { data: amFollowing } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId)
        .maybeSingle();

      // 2. Họ có follow mình chưa?
      const { data: isFollowingMe } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', targetUserId)
        .eq('following_id', currentUserId)
        .maybeSingle();

      if (amFollowing && isFollowingMe) {
        setStatus('friends'); // Bạn bè (Follow chéo)
      } else if (amFollowing) {
        setStatus('following'); // Đang theo dõi 1 chiều
      } else {
        setStatus('none'); // Chưa follow
      }
    };

    checkStatus();
  }, [currentUserId, targetUserId]);

  const handleAction = async () => {
    if (processing || !currentUserId) return;
    setProcessing(true);

    try {
      if (status === 'none') {
        // --- HÀNH ĐỘNG: FOLLOW ---
        const { error } = await supabase
          .from('follows')
          .insert([{ follower_id: currentUserId, following_id: targetUserId }]);
        
        if (error) throw error;
        
        // Kiểm tra xem họ có đang follow mình không để cập nhật thành Bạn bè
        const { data: isFollowingMe } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', targetUserId)
          .eq('following_id', currentUserId)
          .maybeSingle();

        setStatus(isFollowingMe ? 'friends' : 'following');

      } else {
        // --- HÀNH ĐỘNG: UNFOLLOW ---
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);

        if (error) throw error;
        setStatus('none');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối, vui lòng thử lại!');
    } finally {
      setProcessing(false);
    }
  };

  if (!currentUserId || currentUserId === targetUserId) return null;

  // Giao diện nút bấm
  if (status === 'loading') return <div className="w-24 h-9 bg-gray-100 rounded-lg animate-pulse" />;

  if (status === 'friends') {
    return (
      <button onClick={handleAction} disabled={processing} className="px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 transition-all text-sm">
        {processing ? <Loader2 size={16} className="animate-spin" /> : <><Users size={16} /> Bạn bè</>}
      </button>
    );
  }

  if (status === 'following') {
    return (
      <button onClick={handleAction} disabled={processing} className="px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 transition-all text-sm">
        {processing ? <Loader2 size={16} className="animate-spin" /> : <><UserCheck size={16} /> Đang theo dõi</>}
      </button>
    );
  }

  return (
    <button onClick={handleAction} disabled={processing} className="px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-[#003375] text-white hover:bg-[#002855] shadow-md transition-all text-sm">
      {processing ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={16} /> Theo dõi</>}
    </button>
  );
};

export default FollowButton;