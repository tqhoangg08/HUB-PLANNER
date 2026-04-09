/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

// Ép kiểu (as string) để đảm bảo với TypeScript là biến này luôn tồn tại
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY as string;

// Khởi tạo thẳng luôn, KHÔNG dùng "? ... : null" nữa!
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "hubplanner-auth",
  },
});