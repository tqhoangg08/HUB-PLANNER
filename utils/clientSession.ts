import { fetchBetterAuthSession } from './privateApi';

export interface SessionUser {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
}

/**
 * Resolves the current browser identity through the same-origin Better Auth
 * bridge. Migrated private paths must not depend on a browser Supabase token.
 */
export const getLocalSessionUser = async (): Promise<SessionUser | null> => {
    const session = await fetchBetterAuthSession();
    if (!session) return null;

    return {
        id: session.user.id,
        email: session.user.email,
        app_metadata: session.user.app_metadata,
        user_metadata: session.user.user_metadata,
    };
};
