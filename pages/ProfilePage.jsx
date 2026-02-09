import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { BookOpen, Calendar, ShieldAlert } from 'lucide-react';
import FollowButton from '../components/FollowButton';
import { formatDate } from '../utils/dateUtils';
const ProfilePage = () => {
  const { id } = useParams(); 
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user));
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        // 1. Tìm user trong bảng profiles dựa vào student_code
        const { data: user, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('student_code', id)
          .single();

        if (error || !user) throw new Error("User not found");
        setProfile(user);

        // 2. Đếm số lượng follow
        const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);
        const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id);

        setStats({ followers: followers || 0, following: following || 0 });
      } catch (err) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProfile();
  }, [id]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Đang tải hồ sơ...</div>;
  
  if (!profile) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-4">
        <ShieldAlert size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-600">Không tìm thấy sinh viên</h2>
        <p className="text-gray-500 mt-2">Mã số sinh viên <b>{id}</b> không tồn tại.</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 animate-fadeIn">
      {/* Ảnh bìa */}
      <div className="h-40 sm:h-52 bg-gradient-to-r from-[#003375] to-[#0066cc] rounded-t-2xl shadow-inner"></div>

      {/* Card thông tin */}
      <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-gray-200 px-6 pb-8 relative -mt-1">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          
          {/* Avatar */}
          <div className="-mt-16 sm:-mt-20 relative">
            <img 
              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.full_name}&background=random`} 
              alt={profile.full_name}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-md object-cover bg-white"
            />
          </div>

          {/* Nút Follow */}
          <div className="mt-4 sm:mt-6 pt-2 w-full sm:w-auto">
            <FollowButton targetUserId={profile.id} currentUserId={currentUser?.id} />
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{profile.full_name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-blue-50 text-[#003375] px-3 py-1 rounded-full text-sm font-mono font-bold border border-blue-100">
                #{profile.student_code}
            </span>
          </div>
          
          <p className="mt-5 text-gray-700 whitespace-pre-line border-l-4 border-gray-200 pl-4 italic text-sm sm:text-base">
            {profile.bio || "Sinh viên này chưa cập nhật tiểu sử."}
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm text-gray-600">
            {profile.class_name && (
              <div className="flex items-center gap-1.5"><BookOpen size={18} className="text-[#003375]"/> Lớp: <b>{profile.class_name}</b></div>
            )}
            <div className="flex items-center gap-1.5"><Calendar size={18} className="text-[#003375]"/> Tham gia: {formatDate(profile.created_at)}</div>
          </div>

          <hr className="my-6 border-gray-100"/>

          {/* Thống kê */}
          <div className="flex gap-10">
            <div className="text-center cursor-pointer group">
                <span className="block font-bold text-2xl text-[#003375] group-hover:text-blue-600 transition-colors">{stats.followers}</span>
                <span className="text-xs text-gray-500 uppercase font-bold tracking-wide">Người theo dõi</span>
            </div>
            <div className="text-center cursor-pointer group">
                <span className="block font-bold text-2xl text-gray-700 group-hover:text-gray-900 transition-colors">{stats.following}</span>
                <span className="text-xs text-gray-500 uppercase font-bold tracking-wide">Đang theo dõi</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;