import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@loop/types";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  if (code) {
    const response = NextResponse.redirect(new URL(safeNext, siteOrigin));
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
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
