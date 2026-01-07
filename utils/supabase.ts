import { createClient } from '@supabase/supabase-js';

// Helper to get environment variables from either process.env or import.meta.env
// This supports both standard Node-based builds and Vite environments without crashing
const getEnv = (key: string) => {
    // Check process.env first
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    // Check import.meta.env safely
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            // @ts-ignore
            return import.meta.env[key];
        }
    } catch {
        // Ignore errors accessing import.meta
    }
    return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_KEY');

// Use placeholder if missing to prevent app crash on load ("supabaseUrl is required" error)
// Functionality will fail gracefully (network error when fetching) rather than crashing the entire app.
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalKey = supabaseKey || 'placeholder';

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing. Check your .env file or Vercel configuration.");
}

export const supabase = createClient(finalUrl, finalKey);