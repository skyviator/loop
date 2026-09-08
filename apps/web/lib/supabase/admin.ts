import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@loop/types";

export function createLocalAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url) || !secret) {
    throw new Error("Local privileged server operation is unavailable.");
  }
  return createClient<Database>(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
