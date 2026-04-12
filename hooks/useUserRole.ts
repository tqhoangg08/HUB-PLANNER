import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';

// 1. Thêm 'auditor' vào Type
export type UserRole = 'admin' | 'auditor' | 'editor' | 'student';

interface UserRoleState {
    role: UserRole;
    isAdmin: boolean;
    isAuditor: boolean; // 2. Thêm cờ nhận diện Auditor
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
        isAuditor: false, // 3. Khởi tạo mặc định
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
                        role: 'student', 
                        isAdmin: false, 
                        isAuditor: false, 
                        isCTV: false, 
                        isStudent: true,
                        loading: false, 
                        userEmail: null, 
                        session: null
                    });
                }
                return;
            }

            // Bảo vệ an toàn: Nếu supabase chưa sẵn sàng thì khoan hãy check DB
            if (!supabase) return;

            // Trường hợp 2: Có đăng nhập -> Chạy vào DB check xem có phải Admin/Auditor không
            try {
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', currentSession.user.id)
                    .maybeSingle();

                const role = (data && !error) ? (data.role as string).trim() as UserRole : 'student';

                if (isMounted) {
                    setState({
                        role,
                        isAdmin: role === 'admin',
                        isAuditor: role === 'auditor', // 4. Kiểm tra role auditor
                        isCTV: role === 'editor',
                        isStudent: role !== 'admin' && role !== 'editor' && role !== 'auditor', // 5. Cập nhật điều kiện sinh viên
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession // <-- Giữ nguyên phiên đăng nhập
                    });
                }
            } catch (err) {
                console.error("Lỗi lấy quyền:", err);
                // Trường hợp 3: DÙ CÓ LỖI DB THÌ VẪN PHẢI CHO ĐĂNG NHẬP (Chỉ là không có quyền)
                if (isMounted) {
                    setState({
                        role: 'student', 
                        isAdmin: false, 
                        isAuditor: false, 
                        isCTV: false, 
                        isStudent: true,
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