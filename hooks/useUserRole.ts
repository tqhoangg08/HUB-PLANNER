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
        loading: true,
        userEmail: null,
        session: null
    });

    useEffect(() => {
        const checkRole = async () => {
            if (!supabase) {
                setState(prev => ({ ...prev, loading: false }));
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
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
                // Fetch role from 'user_roles' table
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                let role: UserRole = 'student';
                if (data && !error) {
                    role = data.role as UserRole;
                }

                setState({
                    role,
                    isAdmin: role === 'admin',
                    isCTV: role === 'editor',
                    isStudent: role !== 'admin' && role !== 'editor',
                    loading: false,
                    userEmail: session.user.email || null,
                    session: session
                });

            } catch (err) {
                console.error("Error fetching user role:", err);
                setState(prev => ({ ...prev, loading: false }));
            }
        };

        checkRole();

        // Listen to auth changes
        const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (_event, session) => {
             if (_event === 'SIGNED_OUT') {
                 setState({
                    role: 'student',
                    isAdmin: false,
                    isCTV: false,
                    isStudent: true,
                    loading: false,
                    userEmail: null,
                    session: null
                 });
             } else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
                 checkRole();
             }
        }) || { data: { subscription: { unsubscribe: () => {} } } };

        return () => subscription.unsubscribe();
    }, []);

    return state;
};
