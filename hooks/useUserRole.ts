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
        loading: true, // Bắt đầu luôn khóa màn hình
        userEmail: null,
        session: null
    });

    useEffect(() => {
        let isMounted = true;

        const updateRoleState = async (currentSession: Session | null) => {
            if (!supabase) {
                if (isMounted) setState(prev => ({ ...prev, loading: false }));
                return;
            }

            // Nếu không có ai đăng nhập, lập tức mở khóa màn hình
            if (!currentSession) {
                if (isMounted) {
                    setState({
                        role: 'student', isAdmin: false, isCTV: false, isStudent: true,
                        loading: false, userEmail: null, session: null
                    });
                }
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', currentSession.user.id)
                    .maybeSingle();

                const role: UserRole = (data && !error) ? (data.role as UserRole) : 'student';

                if (isMounted) {
                    setState({
                        role,
                        isAdmin: role === 'admin',
                        isCTV: role === 'editor',
                        isStudent: role !== 'admin' && role !== 'editor',
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession
                    });
                }
            } catch (err) {
                console.error("Lỗi phân quyền:", err);
                if (isMounted) setState(prev => ({ ...prev, loading: false }));
            }
        };

        // 🛡️ LƯỚI BẢO VỆ CUỐI CÙNG (FAILSAFE): 
        // Sau 2.5 giây, nếu Supabase vẫn bị treo thì ép ứng dụng mở khóa.
        const failsafeTimer = setTimeout(() => {
            if (isMounted) {
                setState(prev => {
                    if (prev.loading) {
                        console.warn("Supabase phản hồi quá chậm! Đã ép mở khóa màn hình.");
                        return { ...prev, loading: false };
                    }
                    return prev;
                });
            }
        }, 2500);

        // 1. CHỦ ĐỘNG ĐỌC SESSION BỌC TRONG TRY/CATCH
        const initSession = async () => {
            try {
                if (!supabase) throw new Error("Chưa kết nối Supabase");
                const { data: { session } } = await supabase.auth.getSession();
                await updateRoleState(session);
            } catch (error) {
                console.error("Lỗi khởi tạo Auth:", error);
                if (isMounted) setState(prev => ({ ...prev, loading: false }));
            }
        };
        initSession();

        // 2. NGỒI CANH SỰ KIỆN AUTH TỪ SUPABASE
        const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (_event, session) => {
            if (isMounted) await updateRoleState(session);
        }) || { data: { subscription: { unsubscribe: () => {} } } };

        return () => {
            isMounted = false;
            clearTimeout(failsafeTimer); // Dọn dẹp bộ đếm
            subscription?.unsubscribe();
        };
    }, []);

    return state;
};