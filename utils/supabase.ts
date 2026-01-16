import { createClient } from '@supabase/supabase-js';

// Helper to get environment variables safely
const getEnv = (key: string) => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            return process.env[key];
        }
    } catch (e) {}

    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            // @ts-ignore
            return import.meta.env[key];
        }
    } catch (e) {}

    return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️ Supabase URL or Key is missing. Check your .env file.');
}

// Return null if keys are missing (Preview/Demo Mode)
// This prevents the app from crashing with "supabaseUrl is required"
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;
