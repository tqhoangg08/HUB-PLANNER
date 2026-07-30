import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Reads the browser's current Supabase session without making a separate
 * `/auth/v1/user` verification request. Server-side authorization must still
 * validate the access token independently.
 */
export const getLocalSessionUser = async (): Promise<User | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user ?? null;
};
