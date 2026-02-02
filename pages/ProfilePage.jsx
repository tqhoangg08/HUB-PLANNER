import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import FollowButton from '../components/FollowButton';
import { supabase } from '../utils/supabase';
import { useUserRole } from '../hooks/useUserRole';

const PROFILE_TABLE = 'profiles';
const FOLLOW_TABLE = 'follows';

const ProfilePage = () => {
    const { id: studentCode } = useParams();
    const { session } = useUserRole();
    const currentUserId = session?.user?.id ?? null;

    const [profile, setProfile] = useState(null);
    const [followerCount, setFollowerCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!studentCode) {
                setErrorMessage('Không tìm thấy mã sinh viên.');
                setLoading(false);
                return;
            }

            if (!supabase) {
                setErrorMessage('Không thể kết nối đến máy chủ.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setErrorMessage(null);

            try {
                const { data, error } = await supabase
                    .from(PROFILE_TABLE)
                    .select('id, student_code, full_name, avatar_url, bio, class_name')
                    .eq('student_code', studentCode)
                    .maybeSingle();

                if (error) {
                    throw error;
                }

                if (!data) {
                    setErrorMessage('Không tìm thấy hồ sơ sinh viên.');
                    setProfile(null);
                    setLoading(false);
                    return;
                }

                setProfile(data);

                const [followersResponse, followingResponse] = await Promise.all([
                    supabase
                        .from(FOLLOW_TABLE)
                        .select('*', { count: 'exact', head: true })
                        .eq('following_id', data.id),
                    supabase
                        .from(FOLLOW_TABLE)
                        .select('*', { count: 'exact', head: true })
                        .eq('follower_id', data.id),
                ]);

                if (followersResponse.error) {
                    throw followersResponse.error;
                }

                if (followingResponse.error) {
                    throw followingResponse.error;
                }

                setFollowerCount(followersResponse.count ?? 0);
                setFollowingCount(followingResponse.count ?? 0);
            } catch (err) {
                console.error('Failed to load profile data:', err);
                setErrorMessage('Không thể tải dữ liệu hồ sơ. Vui lòng thử lại sau.');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [studentCode]);

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                    <p className="text-sm text-gray-500">Đang tải hồ sơ...</p>
                </div>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="bg-white border border-red-100 rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-red-500 font-semibold">{errorMessage}</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return null;
    }

    const showFollowButton = currentUserId && profile.id !== currentUserId;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-500 h-40 sm:h-52">
                <div className="absolute inset-0 bg-black/10" />
            </div>

            <div className="-mt-16 sm:-mt-20 px-4 sm:px-6">
                <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-gray-100">
                                {profile.avatar_url ? (
                                    <img
                                        src={profile.avatar_url}
                                        alt={profile.full_name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-3xl font-semibold text-gray-400">
                                        {profile.full_name?.charAt(0) ?? 'S'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                                    {profile.full_name || 'Chưa cập nhật tên'}
                                </h1>
                                <p className="text-sm text-gray-500 mt-1">MSSV: {profile.student_code}</p>
                                {profile.class_name && (
                                    <p className="text-sm text-gray-500">Lớp: {profile.class_name}</p>
                                )}
                            </div>
                        </div>

                        {showFollowButton && (
                            <FollowButton
                                targetUserId={profile.id}
                                currentUserId={currentUserId}
                            />
                        )}
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                            <p className="text-sm text-gray-500">Bio</p>
                            <p className="mt-2 text-gray-800">
                                {profile.bio || 'Chưa có mô tả.'}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                            <p className="text-sm text-gray-500">Thống kê</p>
                            <div className="mt-2 flex items-center gap-6">
                                <div>
                                    <p className="text-lg font-semibold text-gray-900">{followerCount}</p>
                                    <p className="text-sm text-gray-500">Follower</p>
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-gray-900">{followingCount}</p>
                                    <p className="text-sm text-gray-500">Following</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;