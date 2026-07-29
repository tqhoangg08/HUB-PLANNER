import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';

const STUDENT_PROFILE_TABLE = 'profiles';

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
            const { data: userProfile, error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .select('id, student_code, full_name')
                .eq('student_code', studentCode)
                .single();

            if (error || !userProfile) {
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
