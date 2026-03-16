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
        loading: true, // Khóa màn hình chờ lấy phiên
        userEmail: null,
        session: null
    });

    useEffect(() => {
        let isMounted = true;

        const fetchRole = async (currentSession: Session | null) => {
            // Trường hợp 1: Không có phiên đăng nhập (Khách thật sự)
            if (!currentSession) {
                if (isMounted) {
                    setState({
                        role: 'student', isAdmin: false, isCTV: false, isStudent: true,
                        loading: false, userEmail: null, session: null
                    });
                }
                return;
            }

            // Bảo vệ an toàn: Nếu supabase chưa sẵn sàng thì khoan hãy check DB
            if (!supabase) return;

            // Trường hợp 2: Có đăng nhập -> Chạy vào DB check xem có phải Admin không
            try {
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', currentSession.user.id)
                    .maybeSingle();

                const role = (data && !error) ? (data.role as UserRole) : 'student';

                if (isMounted) {
                    setState({
                        role,
                        isAdmin: role === 'admin',
                        isCTV: role === 'editor',
                        isStudent: role !== 'admin' && role !== 'editor',
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession // <-- Giữ nguyên phiên đăng nhập
                    });
                }
            } catch (err) {
                console.error("Lỗi lấy quyền:", err);
                // Trường hợp 3: DÙ CÓ LỖI DB THÌ VẪN PHẢI CHO ĐĂNG NHẬP (Chỉ là không có quyền Admin thôi)
                if (isMounted) {
                    setState({
                        role: 'student', isAdmin: false, isCTV: false, isStudent: true,
                        loading: false, 
                        userEmail: currentSession.user.email || null, 
                        session: currentSession // <-- QUAN TRỌNG: Tránh bị văng ra ẩn danh!
                    });
                }
            }
        };

        // BẢO VỆ AN TOÀN TRƯỚC KHI GỌI AUTH
        if (supabase && supabase.auth) {
            // 1. Lấy phiên tức thì khi vừa F5
            supabase.auth.getSession().then(({ data: { session } }) => {
                fetchRole(session);
            }).catch(err => {
                console.error("Lỗi getSession:", err);
                if (isMounted) setState(prev => ({ ...prev, loading: false }));
            });

            // 2. Lắng nghe mọi biến động (Hết hạn token, bị đá ra, v.v...)
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                fetchRole(session);
            });

            return () => {
                isMounted = false;
                subscription?.unsubscribe();
            };
        } else {
            // Nếu không có Supabase, buộc phải tắt loading để tránh treo app
            if (isMounted) setState(prev => ({ ...prev, loading: false }));
            return () => { isMounted = false; };
        }
    }, []);

    return state;
};