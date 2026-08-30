import { fetchPublicProfile } from './publicDirectoryApi';

export const fetchDefaultClassName = async (studentCode: string) => {
    const normalizedCode = studentCode.trim();
    if (!normalizedCode) return '';

    try {
        const profile = await fetchPublicProfile(normalizedCode);
        return String(profile.class_name || '').trim();
    } catch (error) {
        console.warn('Không thể đọc lớp mặc định từ hồ sơ D1:', error);
    }
    return '';
};
