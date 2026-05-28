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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either the legacy ANON_KEY or the new PUBLISHABLE_KEY name
  // Supabase v2 introduced. Failing closed on a name mismatch causes the
  // exact symptom users see: immediate bounce from /dashboard back to
  // /login after a successful login.
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anon || anon === "FILL_ME_IN") {
    // Fail closed when misconfigured — redirect to login.
    return redirectToLogin(request);
  }

  // Canonical Supabase SSR template. The prior implementation skipped
  // two steps that matter for the access-token refresh flow:
  //   1. NextResponse.next({ request }) — preserves request headers so
  //      downstream route handlers see the same request context.
  //   2. setAll() writes cookies to BOTH request and a freshly-rebuilt
  //      response. Without rebuilding `response` inside setAll(), the
  //      refreshed access-token cookie wasn't always making it back to
  //      the browser — which is exactly the symptom reported as
  //      "session expires during navigation". The 1-hour access token
  //      would expire mid-session and the auto-refresh that getUser()
  //      triggers had nowhere to persist its result.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
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
