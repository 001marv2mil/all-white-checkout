import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client (service role). Built lazily on first use so that
// importing this module never throws, which keeps `next build` working with no
// environment variables set. Never import this from a client component.

function buildClient(url: string, serviceKey: string) {
  try {
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    // e.g. a malformed URL. Keep the message generic so no config leaks.
    throw new Error("Database is not configured.");
  }
}

let cached: ReturnType<typeof buildClient> | null = null;

export function getSupabaseAdmin() {
  if (cached) return cached;

  // Trim whitespace/newlines that can sneak into env vars from some hosting setups.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    throw new Error("Database is not configured.");
  }

  const client = buildClient(url, serviceKey);
  cached = client;
  return client;
}
