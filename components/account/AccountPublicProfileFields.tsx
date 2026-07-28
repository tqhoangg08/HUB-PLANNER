import React from 'react';
import {
    AVATAR_COLOR_OPTIONS,
    getAvatarColorClass,
    isAvatarImageUrl,
} from '../../utils/avatarColors';

interface AccountPublicProfileFieldsProps {
    fullName: string;
    bio: string;
    className: string;
    defaultClassName: string;
    profileTags: string;
    publicProfileEnabled: boolean;
    showProfileStats: boolean;
    avatarUrl: string;
    avatarPreview: string;
    avatarSeed: string;
    onFullNameChange: (value: string) => void;
    onBioChange: (value: string) => void;
    onClassNameChange: (value: string) => void;
    onProfileTagsChange: (value: string) => void;
    onPublicProfileEnabledChange: (enabled: boolean) => void;
    onShowProfileStatsChange: (enabled: boolean) => void;
    onAvatarColorChange: (color: string) => void;
    onAvatarFileSelect: (file: File) => void;
    onInvalidAvatarFile: () => void;
}

export const AccountPublicProfileFields: React.FC<AccountPublicProfileFieldsProps> = ({
    fullName,
    bio,
    className,
    defaultClassName,
    profileTags,
    publicProfileEnabled,
    showProfileStats,
    avatarUrl,
    avatarPreview,
    avatarSeed,
    onFullNameChange,
    onBioChange,
    onClassNameChange,
    onProfileTagsChange,
    onPublicProfileEnabledChange,
    onShowProfileStatsChange,
    onAvatarColorChange,
    onAvatarFileSelect,
    onInvalidAvatarFile,
}) => (
    <div>
        <h4 className="mb-3 border-b border-gray-100 pb-1 text-xs font-black uppercase tracking-wider text-[#003375]">
            1. Thông tin hiển thị
        </h4>
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">Tên hiển thị (Góc phải)</label>
                <input
                    type="text"
                    value={fullName}
                    onChange={event => onFullNameChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                    placeholder="Nhập tên..."
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">Bio cá nhân</label>
                <textarea
                    value={bio}
                    onChange={event => onBioChange(event.target.value)}
                    rows={3}
                    maxLength={220}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                    placeholder="VD: Sinh viên năm 3, đam mê công nghệ..."
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">Lớp</label>
                <input
                    type="text"
                    value={className}
                    onChange={event => onClassNameChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                    placeholder={defaultClassName ? `Mặc định: ${defaultClassName}` : 'VD: DH22KTA'}
                />
                <p className="text-[11px] text-gray-500">
                    Nếu để trống, hệ thống sẽ dùng lớp mặc định theo MSSV khi có dữ liệu.
                </p>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">
                    Tag hồ sơ, cách nhau bằng dấu phẩy
                </label>
                <input
                    type="text"
                    value={profileTags}
                    onChange={event => onProfileTagsChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                    placeholder="VD: Khoa Kế toán, CLB Tin học"
                />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                <input
                    type="checkbox"
                    checked={publicProfileEnabled}
                    onChange={event => onPublicProfileEnabledChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375]"
                />
                <span>
                    <span className="block font-bold text-amber-900">
                        Công khai hồ sơ để người khác tìm thấy
                    </span>
                    <span className="text-xs text-amber-800">
                        Khi bật, tên hiển thị, MSSV, lớp, bio, avatar và tag hồ sơ có thể xuất hiện
                        trong trang tìm kiếm và trang hồ sơ công khai.
                    </span>
                </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm">
                <input
                    type="checkbox"
                    checked={showProfileStats}
                    disabled={!publicProfileEnabled}
                    onChange={event => onShowProfileStatsChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375] disabled:opacity-50"
                />
                <span>
                    <span className="block font-bold text-[#003375]">
                        Hiển thị thành tích học tập trên hồ sơ công khai
                    </span>
                    <span className="text-xs text-gray-600">
                        Chỉ bật được sau khi bạn bật hồ sơ công khai. Công khai GPA tích lũy, số học
                        kỳ hoàn thành và tín chỉ tích lũy; dữ liệu chi tiết từng môn vẫn riêng tư.
                    </span>
                </span>
            </label>

            <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500">Màu Avatar</label>
                <div className="flex gap-3">
                    {AVATAR_COLOR_OPTIONS.map(color => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => onAvatarColorChange(color)}
                            className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${getAvatarColorClass(color)} ${avatarUrl === color ? 'scale-110 border-gray-900' : 'border-transparent'}`}
                            aria-label={`Chọn màu avatar ${color}`}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500">Ảnh Avatar</label>
                <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                        {avatarPreview ? (
                            <img
                                src={avatarPreview}
                                alt="Avatar xem trước"
                                className="h-full w-full object-cover"
                            />
                        ) : isAvatarImageUrl(avatarUrl) ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar hiện tại"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div
                                className={`flex h-full w-full items-center justify-center text-sm font-black text-white ${getAvatarColorClass(avatarUrl)}`}
                            >
                                {avatarSeed}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <input
                            id="avatar-upload"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={event => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                if (!file.type.startsWith('image/')) {
                                    onInvalidAvatarFile();
                                    return;
                                }
                                onAvatarFileSelect(file);
                            }}
                        />
                        <label
                            htmlFor="avatar-upload"
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-[#003375] transition-colors hover:bg-blue-50"
                        >
                            Tải ảnh lên
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
