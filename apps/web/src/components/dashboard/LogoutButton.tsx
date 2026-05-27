"use client";

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";

import { createClient } from "@/lib/supabase";

/**
 * LogoutButton — sign-out trigger for the dealer chrome.
 *
 * Used by:
 *   - Sidebar.tsx (desktop, in the bottom footer slot; honors the
 *     collapsed icon-only mode via `collapsed` prop)
 *   - MobileSidebarSheet.tsx (mobile drawer, full-width row at the
 *     end of the nav stack)
 *
 * Sign-out flow:
 *   1. supabase.auth.signOut() — clears the Supabase JWT/session
 *   2. sessionStorage.clear() — wipes any client-only caches
 *      (impersonation token, dialog drafts, etc.). Wrapped in try
 *      because Safari private-browsing throws on storage access.
 *   3. Hard navigation to /login?signedOut=1 — `window.location.href`
 *      (not router.push) so the SPA bundle re-mounts fresh and no
 *      in-memory React state holds the previous dealer's data
 *      across the sign-out boundary. The query param triggers the
 *      "התנתקת בהצלחה" toast on the login page.
 *
 * The styling mirrors the nav-item rhythm used in Sidebar.tsx (muted
 * by default, ink on hover, bg-muted/10 hover surface) so the button
 * reads as part of the nav rather than a separate decoration.
 */

type Props = {
  /** When true, render icon only (used by the collapsed desktop sidebar). */
  collapsed?: boolean;
};

export function LogoutButton({ collapsed = false }: Props) {
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      sessionStorage.clear();
    } catch {
      // private browsing — ignore
    }
    window.location.href = "/login?signedOut=1";
  };

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={signingOut}
      aria-busy={signingOut || undefined}
      aria-label={signingOut ? "מתנתק" : "התנתק"}
      title={collapsed ? "התנתק" : undefined}
      className={[
        "gap-md duration-fast group flex w-full items-center rounded-md text-sm font-medium transition-colors",
        "px-md py-md text-muted hover:text-ink hover:bg-muted/10",
        "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        collapsed ? "justify-center" : "",
        signingOut ? "cursor-wait opacity-70" : "",
      ].join(" ")}
    >
      {signingOut ? (
        <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
      )}
      {!collapsed ? <span className="truncate">{signingOut ? "מתנתק…" : "התנתק"}</span> : null}
    </button>
  );
}
