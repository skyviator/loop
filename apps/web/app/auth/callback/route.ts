import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@loop/types";

import { configuredApplicationOrigin, safeAuthDestination } from "@/lib/auth-redirect";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const siteOrigin = configuredApplicationOrigin();
  const safeNext = safeAuthDestination(next, siteOrigin);
  if (code) {
    const response = NextResponse.redirect(new URL(safeNext, siteOrigin));
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookieOptions: authCookieOptions(),
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }
  return NextResponse.redirect(new URL("/sign-in?error=The+link+is+invalid+or+has+expired.", siteOrigin));
}
