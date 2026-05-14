import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

export type UserRole = 'admin' | 'auditor' | 'student';

interface UserRoleState {
    role: UserRole;
    isAdmin: boolean;
    isAuditor: boolean;
    isCTV: boolean;
    isStudent: boolean;
    loading: boolean;
    userEmail: string | null;
    session: Session | null;
}

const normalizeRole = (role?: string | null): UserRole => {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'auditor') return normalized;
    return 'student';
};

const fetchRoleRecord = async (userId: string, email?: string | null): Promise<UserRole> => {
    const readRole = async (column: 'id' | 'user_id', value: string) => {
        const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq(column, value)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn(`Khong the doc user_roles.${column}:`, error.message);
            return null;
        }
        return data?.role ? normalizeRole(data.role as string) : null;
    };

    const directRole = await readRole('id', userId);
    if (directRole && directRole !== 'student') return directRole;

    const userIdRole = await readRole('user_id', userId);
    if (userIdRole && userIdRole !== 'student') return userIdRole;

    if (email) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .limit(1)
            .maybeSingle();

        if (!profileError && profile?.id) {
            const profileRole = await readRole('user_id', profile.id as string);
            if (profileRole && profileRole !== 'student') return profileRole;
        }
    }

    return 'student';
};

const anonymousState: UserRoleState = {
    role: 'student',
    isAdmin: false,
    isAuditor: false,
    isCTV: false,
    isStudent: true,
    loading: false,
    userEmail: null,
    session: null,
};

export const useUserRole = () => {
    const [state, setState] = useState<UserRoleState>({
        ...anonymousState,
        loading: true,
    });

    useEffect(() => {
        let isMounted = true;

        const fetchRole = async (currentSession: Session | null) => {
            if (!currentSession) {
                if (isMounted) setState(anonymousState);
                return;
            }

            if (!supabase) {
                if (isMounted) {
                    setState({
                        ...anonymousState,
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession,
                    });
                }
                return;
            }

            try {
                const dbRole = await fetchRoleRecord(currentSession.user.id, currentSession.user.email);
                const metadataRole = normalizeRole(
                    (currentSession.user.app_metadata?.role as string | undefined)
                    || (currentSession.user.user_metadata?.role as string | undefined)
                );
                const role = dbRole !== 'student' ? dbRole : metadataRole;

                if (isMounted) {
                    setState({
                        role,
                        isAdmin: role === 'admin',
                        isAuditor: role === 'auditor',
                        isCTV: false,
                        isStudent: role === 'student',
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession,
                    });
                }
            } catch (err) {
                console.error('Loi lay quyen:', err);
                if (isMounted) {
                    setState({
                        ...anonymousState,
                        loading: false,
                        userEmail: currentSession.user.email || null,
                        session: currentSession,
                    });
                }
            }
        };

        if (supabase?.auth) {
            supabase.auth.getSession()
                .then(({ data: { session } }) => fetchRole(session))
                .catch(err => {
                    console.error('Loi getSession:', err);
                    if (isMounted) setState(prev => ({ ...prev, loading: false }));
                });

            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                fetchRole(session);
            });

            return () => {
                isMounted = false;
                subscription?.unsubscribe();
            };
        }

        setState(prev => ({ ...prev, loading: false }));
        return () => {
            isMounted = false;
        };
    }, []);

    return state;
};
