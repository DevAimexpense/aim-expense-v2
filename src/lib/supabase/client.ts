// ===========================================
// Aim Expense — Supabase Client (Browser)
// ===========================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client
 * ใช้สำหรับ client components เท่านั้น
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
