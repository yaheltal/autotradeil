import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protects /dashboard and /admin/* behind a Supabase session.
 *
 * If no session, redirect to `/login?next=<original>`. The login page
 * uses `next` to return the user after authentication.
 *
 * We deliberately do NOT enforce role (admin vs dealer) in middleware —
 * role is resolved by the API (`/api/v1/auth/whoami`) after login.
 * That keeps server state out of the edge runtime.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon || anon === "FILL_ME_IN") {
    // Fail closed when misconfigured — redirect to login.
    return redirectToLogin(request);
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(request);
  }

  return response;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
