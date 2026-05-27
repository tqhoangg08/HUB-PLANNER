import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShieldAlert, UserRound } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';

const avatarFallback = (profile) => {
  const name = profile?.full_name || profile?.student_code || 'SV';
  return name.trim().charAt(0).toUpperCase() || 'S';
};

const getAvatarClassName = (avatarUrl) => {
  if (isAllowedAvatarColor(avatarUrl)) {
    return getAvatarColorClass(avatarUrl, '#003375');
  }
  return 'avatar-color-hub';
};

const ProfileSearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    if (!query) return 'Tìm kiếm sinh viên';
    return `Kết quả gần giống "${query}"`;
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      if (!query) {
        setResults([]);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const safeQuery = query.replace(/[%,]/g, '').slice(0, 40);
        const { data, error: searchError } = await supabase
          .from('public_profiles')
          .select('id, full_name, student_code, avatar_url, class_name, profile_tags')
          .or(`student_code.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%`)
          .order('student_code', { ascending: true })
          .limit(200);

        if (searchError) throw searchError;
        if (!cancelled) setResults(data || []);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError(err?.message || 'Không thể tìm sinh viên.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[#003375] font-bold text-sm uppercase tracking-wide">
          <Search size={18} />
          Tìm sinh viên
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#003375] mt-2">{title}</h1>
        <p className="text-gray-500 mt-1">
          Bấm vào một sinh viên để xem hồ sơ công khai.
        </p>
      </div>

      <div className="bg-white border border-gray-300 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-bold text-gray-500">
          {loading ? 'Đang tìm...' : `${results.length} sinh viên phù hợp`}
        </div>

        {error && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
            <ShieldAlert size={42} className="text-gray-300 mb-3" />
            <p className="font-bold">Không tìm thấy sinh viên phù hợp.</p>
            <p className="text-sm mt-1">Thử nhập gần đúng MSSV hoặc tên sinh viên.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="divide-y divide-gray-100">
            {results.map((profile) => {
              const avatarUrl = profile.avatar_url;
              const isImageAvatar = isAvatarImageUrl(avatarUrl);

              return (
                <Link
                  key={profile.id}
                  to={`/profile/${encodeURIComponent(profile.student_code)}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-blue-50 transition-colors"
                >
                  <div
                    className={`h-12 w-12 rounded-full text-white flex items-center justify-center font-black shrink-0 overflow-hidden border border-blue-100 ${getAvatarClassName(avatarUrl)}`}
                  >
                    {isImageAvatar ? (
                      <img src={avatarUrl} alt={profile.full_name || profile.student_code} className="h-full w-full object-cover" />
                    ) : (
                      avatarFallback(profile)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-gray-900 truncate">{profile.full_name || 'Chưa cập nhật tên'}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                      <span className="font-bold text-[#003375]">#{profile.student_code}</span>
                      {profile.class_name && <span className="text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 font-semibold">{profile.class_name}</span>}
                      {(profile.profile_tags || []).slice(0, 2).map((tag) => (
                        <span key={tag} className="text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 font-semibold">{tag}</span>
                      ))}
                    </div>
                  </div>

                  <UserRound size={18} className="text-gray-400 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSearchPage;
