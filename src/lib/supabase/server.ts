// ===========================================
// Aim Expense — Supabase Client (Server)
// ใช้ service_role key สำหรับ server-side operations
// ===========================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client with service role
 * ใช้สำหรับ API routes, tRPC procedures เท่านั้น
 * ⚠️ อย่าใช้ฝั่ง client — มี full access
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
