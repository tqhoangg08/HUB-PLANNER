import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { playClick } from '../utils/audio';
import { searchStaffProfiles } from '../utils/staffProfilesApi';

export interface ManagedStudent {
    id: string;
    mssv: string;
    name: string;
}

export const useManagedStudentView = () => {
    const [adminSearchMssv, setAdminSearchMssv] = useState('');
    const [viewingUser, setViewingUser] = useState<ManagedStudent | null>(null);
    const [isSearchingUser, setIsSearchingUser] = useState(false);

    const handleAdminSearchUser = useCallback(async (event?: FormEvent) => {
        event?.preventDefault();
        const studentCode = adminSearchMssv.trim();
        if (!studentCode) return;

        setIsSearchingUser(true);
        playClick();

        try {
            const candidates = await searchStaffProfiles(studentCode, { limit: 20, offset: 0 });
            const userProfile = candidates.find(
                (candidate) => String(candidate.student_code || '').toLowerCase() === studentCode.toLowerCase(),
            );

            if (!userProfile) {
                alert('Không tìm thấy sinh viên có MSSV này trong hệ thống!');
                setViewingUser(null);
                return;
            }

            setViewingUser({
                id: userProfile.id,
                mssv: userProfile.student_code,
                name: userProfile.full_name || 'Chưa cập nhật tên',
            });
            alert(`Đã chuyển sang xem dữ liệu của sinh viên: ${userProfile.student_code}`);
        } catch (error) {
            console.error(error);
            alert('Lỗi khi tìm kiếm sinh viên!');
        } finally {
            setIsSearchingUser(false);
        }
    }, [adminSearchMssv]);

    const clearViewingUser = useCallback(() => {
        setViewingUser(null);
    }, []);

    return {
        adminSearchMssv,
        setAdminSearchMssv,
        viewingUser,
        isSearchingUser,
        handleAdminSearchUser,
        clearViewingUser,
    };
};
