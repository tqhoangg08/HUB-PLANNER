import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { BookOpen, Calendar, Check, Copy, Edit3, GraduationCap, ShieldAlert, Trophy } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';

const ProfilePage = ({ onEditProfile, refreshKey = 0 }) => {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const { data: user, error } = await supabase
          .from('public_profiles')
          .select('id, full_name, student_code, avatar_url, created_at, bio, class_name, profile_tags, show_profile_stats, public_gpa, public_completed_semesters, public_credits')
          .eq('student_code', id)
          .maybeSingle();

        if (error || !user) throw new Error('User not found');
        setProfile(user);
      } catch (err) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProfile();
  }, [id, refreshKey]);

  useEffect(() => {
    let mounted = true;

    const loadCurrentUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setCurrentUserId(data?.user?.id || null);
      } catch (error) {
        if (mounted) setCurrentUserId(null);
      }
    };

    loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      setCopied(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Đang tải hồ sơ...</div>;
  }

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-4">
        <ShieldAlert size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-600">Không tìm thấy sinh viên</h2>
        <p className="text-gray-500 mt-2">Mã số sinh viên <b>{id}</b> không tồn tại.</p>
      </div>
    );
  }

  const avatarUrl = profile.avatar_url;
  const isColorAvatar = isAllowedAvatarColor(avatarUrl);
  const avatarSeed = (profile.full_name || profile.student_code || 'H').charAt(0).toUpperCase();
  const tags = Array.isArray(profile.profile_tags) ? profile.profile_tags.filter(Boolean) : [];
  const isOwnProfile = Boolean(currentUserId && profile.id === currentUserId);

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 animate-fadeIn">
      <div className="h-36 sm:h-48 bg-gradient-to-r from-[#003375] via-[#0052cc] to-[#0b7cff] rounded-t-2xl shadow-inner relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 hub-dot-pattern" />
      </div>

      <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 px-5 sm:px-8 pb-8 relative">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="-mt-14 sm:-mt-20 relative">
            {isAvatarImageUrl(avatarUrl) ? (
              <img
                src={avatarUrl}
                alt={profile.full_name || 'Avatar'}
                className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-md object-cover bg-white"
              />
            ) : (
              <div
                className={`w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-md flex items-center justify-center text-4xl sm:text-6xl font-black text-white ${isColorAvatar ? getAvatarColorClass(avatarUrl) : 'avatar-color-primary'}`}
              >
                {avatarSeed}
              </div>
            )}
            <div className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-emerald-500 text-white border-4 border-white flex items-center justify-center">
              <Check size={16} />
            </div>
          </div>

          <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2">
            {isOwnProfile && onEditProfile && (
              <button
                type="button"
                onClick={onEditProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-[#003375] px-4 py-2 text-sm font-bold text-white hover:bg-[#00285c]"
              >
                <Edit3 size={16} />
                Cập nhật hồ sơ
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <Copy size={16} />
              {copied ? 'Đã sao chép' : 'Sao chép link'}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">{profile.full_name || 'Sinh viên HUB'}</h1>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="bg-blue-50 text-[#003375] px-3 py-1 rounded-full text-sm font-mono font-bold border border-blue-100">
              #{profile.student_code}
            </span>
            {profile.class_name && (
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-bold border border-emerald-100">
                Lớp {profile.class_name}
              </span>
            )}
            {tags.map(tag => (
              <span key={tag} className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-sm font-bold border border-orange-100">
                {tag}
              </span>
            ))}
          </div>

          <p className="mt-5 text-gray-700 whitespace-pre-line border-l-4 border-[#003375] pl-4 italic text-sm sm:text-base leading-7">
            {profile.bio || 'Sinh viên này chưa cập nhật bio.'}
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm text-gray-600">
            {profile.class_name && (
              <div className="flex items-center gap-1.5"><BookOpen size={18} className="text-[#003375]" /> Lớp: <b>{profile.class_name}</b></div>
            )}
            <div className="flex items-center gap-1.5"><Calendar size={18} className="text-[#003375]" /> Tham gia: {formatDate(profile.created_at)}</div>
            <div className="flex items-center gap-1.5"><GraduationCap size={18} className="text-[#003375]" /> Đại học Ngân hàng TP.HCM</div>
          </div>

          {profile.show_profile_stats && (
            <>
              <hr className="my-7 border-gray-100" />
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 rounded-2xl border border-gray-100 overflow-hidden">
                <div className="text-center p-5">
                  <span className="block font-black text-3xl text-[#003375]">{Number(profile.public_gpa || 0).toFixed(2)}</span>
                  <span className="text-xs text-gray-500 uppercase font-black tracking-wide">GPA tích lũy</span>
                </div>
                <div className="text-center p-5">
                  <span className="block font-black text-3xl text-[#003375]">{profile.public_completed_semesters || 0}</span>
                  <span className="text-xs text-gray-500 uppercase font-black tracking-wide">Học kỳ hoàn thành</span>
                </div>
                <div className="text-center p-5">
                  <span className="block font-black text-3xl text-[#003375]">{profile.public_credits || 0}</span>
                  <span className="text-xs text-gray-500 uppercase font-black tracking-wide">Tín chỉ tích lũy</span>
                </div>
              </div>
            </>
          )}

          {!profile.show_profile_stats && (
            <div className="mt-7 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-500 flex items-center gap-2">
              <Trophy size={18} />
              Người dùng chưa bật hiển thị thành tích học tập công khai.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
