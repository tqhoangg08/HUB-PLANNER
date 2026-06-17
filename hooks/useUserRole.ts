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

const roleCache = new Map<string, UserRole>();
const roleRequestCache = new Map<string, Promise<UserRole>>();

const fetchRoleRecord = async (userId: string): Promise<UserRole> => {
    const readRole = async (column: 'id' | 'user_id', value: string) => {
        const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq(column, value)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn(`Không thể đọc user_roles.${column}:`, error.message);
            return null;
        }
        return data?.role ? normalizeRole(data.role as string) : null;
    };

    const directRole = await readRole('id', userId);
    if (directRole && directRole !== 'student') return directRole;

    const userIdRole = await readRole('user_id', userId);
    if (userIdRole && userIdRole !== 'student') return userIdRole;

    return 'student';
};

const getMetadataRole = (session: Session): UserRole => normalizeRole(
    (session.user.app_metadata?.role as string | undefined)
    || (session.user.user_metadata?.role as string | undefined)
);

const resolveRoleForSession = (session: Session): Promise<UserRole> => {
    const userId = session.user.id;
    const cachedRole = roleCache.get(userId);
    if (cachedRole) return Promise.resolve(cachedRole);

    const pendingRequest = roleRequestCache.get(userId);
    if (pendingRequest) return pendingRequest;

    const request = (async () => {
        const dbRole = supabase
            ? await fetchRoleRecord(userId)
            : 'student';
        const metadataRole = getMetadataRole(session);
        const role = dbRole !== 'student' ? dbRole : metadataRole;
        roleCache.set(userId, role);
        return role;
    })().finally(() => {
        roleRequestCache.delete(userId);
    });

    roleRequestCache.set(userId, request);
    return request;
};

const createRoleState = (role: UserRole, session: Session): UserRoleState => ({
    role,
    isAdmin: role === 'admin',
    isAuditor: role === 'auditor',
    isCTV: false,
    isStudent: role === 'student',
    loading: false,
    userEmail: session.user.email || null,
    session,
});

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
                    setState(createRoleState(getMetadataRole(currentSession), currentSession));
                }
                return;
            }

            try {
                const role = await resolveRoleForSession(currentSession);

                if (isMounted) {
                    setState(createRoleState(role, currentSession));
                }
            } catch (err) {
                console.error('Lỗi lấy quyền:', err);
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
                    console.error('Lỗi getSession:', err);
                    if (isMounted) setState(prev => ({ ...prev, loading: false }));
                });

            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    roleCache.clear();
                    roleRequestCache.clear();
                }
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
