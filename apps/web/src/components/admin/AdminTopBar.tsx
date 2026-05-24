"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { ApiStatus } from "@/components/ApiStatus";
import { AdminMobileSheet } from "@/components/admin/AdminMobileSheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";

/**
 * AdminTopBar — sticky top edge on every admin page.
 *
 *   [Menu]                              [ApiStatus]  [התנתקות]
 *
 * Mobile: shows the hamburger (AdminMobileSheet trigger), ApiStatus,
 * and the logout button. Desktop: hamburger hides (md:hidden inside
 * AdminMobileSheet), the row stays at h-14 with ApiStatus + logout
 * pinned to the trailing edge.
 *
 * Brand mark deliberately not duplicated here — the sidebar already
 * carries "AutoTradeIL · Admin". Mirrors the dashboard top bar's
 * decision (no third copy on small screens).
 *
 * Logout is the only globally-reachable action; a full hard redirect
 * keeps the SPA bundle from holding stale admin state across
 * sign-out boundaries.
 */
export function AdminTopBar() {
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
    <header
      className={[
        "gap-md px-md sticky top-0 z-30 flex h-14 items-center",
        "border-hairline bg-paper/95 border-b backdrop-blur",
      ].join(" ")}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      aria-label="סרגל ניהול"
    >
      <AdminMobileSheet />
      <div className="flex-1" aria-hidden="true" />
      <ApiStatus />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void handleLogout()}
        disabled={signingOut}
        aria-busy={signingOut || undefined}
        className="gap-xs"
      >
        <LogOut aria-hidden="true" />
        <span>{signingOut ? "מתנתק…" : "התנתקות"}</span>
      </Button>
    </header>
  );
}
