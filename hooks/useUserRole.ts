import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'editor' | 'student';

interface UserRoleState {
    role: UserRole;
    isAdmin: boolean;
    isCTV: boolean; // Editor
    isStudent: boolean;
    loading: boolean;
    userEmail: string | null;
    session: Session | null;
}

export const useUserRole = () => {
    const [state, setState] = useState<UserRoleState>({
        role: 'student',
        isAdmin: false,
        isCTV: false,
        isStudent: true,
        loading: true, // Bắt đầu với trạng thái loading để chờ check DB
        userEmail: null,
        session: null
    });

    useEffect(() => {
        // Nguyên tắc 2: Hàm fetch quyền trực tiếp từ Database
        const checkRole = async (currentSession: Session | null) => {
            if (!supabase) {
                setState(prev => ({ ...prev, loading: false }));
                return;
            }

            // Nếu không có session (chưa đăng nhập hoặc là khách)
            if (!currentSession) {
                setState({
                    role: 'student',
                    isAdmin: false,
                    isCTV: false,
                    isStudent: true,
                    loading: false,
                    userEmail: null,
                    session: null
                });
                return;
            }

            try {
                // SỬA QUAN TRỌNG: Dùng cột 'user_id' để query thay vì 'id' 
                // (Khớp với cấu trúc bảng user_roles và RLS đã tạo)
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', currentSession.user.id)
                    .maybeSingle();

                let role: UserRole = 'student';
                // Nếu tìm thấy trong bảng user_roles thì cập nhật quyền
                if (data && !error) {
                    role = data.role as UserRole;
                }

                // Cập nhật State (Nguyên tắc 1: Lưu quyền vào State/Memory, không lưu LocalStorage)
                setState({
                    role,
                    isAdmin: role === 'admin',
                    isCTV: role === 'editor',
                    isStudent: role !== 'admin' && role !== 'editor',
                    loading: false,
                    userEmail: currentSession.user.email || null,
                    session: currentSession
                });

            } catch (err) {
                console.error("Lỗi khi lấy phân quyền:", err);
                setState(prev => ({ ...prev, loading: false }));
            }
        };

        // 1. Kiểm tra quyền ngay khi trang vừa load xong
        supabase?.auth.getSession().then(({ data: { session } }) => {
            checkRole(session);
        });

        // 2. Lắng nghe mọi biến động (Đăng nhập, Đăng xuất, Token hết hạn/làm mới)
        const { data: { subscription } } = supabase?.auth.onAuthStateChange((_event, session) => {
            // Mỗi lần có thay đổi auth, gọi lại checkRole để xác minh Database ngay lập tức
            checkRole(session);
        }) || { data: { subscription: { unsubscribe: () => {} } } };

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    return state;
};