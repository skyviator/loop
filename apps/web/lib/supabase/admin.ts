import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@loop/types";

function adminConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Privileged server operation is unavailable.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Privileged server operation is unavailable.");
  }

  const local = parsed.protocol === "http:"
    && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    && parsed.port === "54321";
  const originOnly = parsed.pathname === "/" && !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
  if ((!local && parsed.protocol !== "https:") || !originOnly) {
    throw new Error("Privileged server operation is unavailable.");
  }

  return { url: parsed.origin, secret, local };
}

function clientFor(configuration: ReturnType<typeof adminConfiguration>) {
  return createClient<Database>(configuration.url, configuration.secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createServerAdminClient() {
  return clientFor(adminConfiguration());
}

export function createLocalAdminClient() {
  const configuration = adminConfiguration();
  if (!configuration.local) throw new Error("Local privileged server operation is unavailable.");
  return clientFor(configuration);
}
