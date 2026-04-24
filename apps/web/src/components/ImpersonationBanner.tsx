"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

/**
 * Persistent banner rendered at the top of every page while an
 * impersonation session is active (token in sessionStorage).
 *
 * A11y:
 *   - Uses `role="region"` + `aria-label` (not `role="status"`) because
 *     it is persistent durable state, not a transient announcement.
 *   - A separate visually-hidden `role="status"` announces the
 *     ACTIVATION once, then unmounts, so SR users are not re-announced
 *     on every route change.
 *   - "סיים" button uses a white focus ring that reaches 3:1 against
 *     the navy background (SC 1.4.11).
 *
 * Storage:
 *   - sessionStorage (never localStorage) so the token vanishes when
 *     the tab closes.
 *   - Keys: impersonation_token, impersonation_business_name,
 *           impersonation_dealer_id
 */

const KEY_TOKEN = "impersonation_token";
const KEY_NAME = "impersonation_business_name";

export function ImpersonationBanner() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [justActivated, setJustActivated] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const token = window.sessionStorage.getItem(KEY_TOKEN);
    const name = window.sessionStorage.getItem(KEY_NAME);
    if (token && name) {
      setBusinessName(name);
      // Announce activation exactly once; parent component mounts on every
      // page but we only "just activated" on the tick the token appeared.
      const flag = window.sessionStorage.getItem("impersonation_just_activated");
      if (flag === "1") {
        setJustActivated(true);
        window.sessionStorage.removeItem("impersonation_just_activated");
        const t = window.setTimeout(() => setJustActivated(false), 2000);
        return () => window.clearTimeout(t);
      }
    }
  }, []);

  const end = async () => {
    setEnding(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        try {
          await apiFetch("/api/v1/admin/impersonate/end", {
            method: "POST",
            token: session.access_token,
          });
        } catch {
          /* even if the audit log call fails, we still want to clear locally */
        }
      }
    } finally {
      window.sessionStorage.removeItem(KEY_TOKEN);
      window.sessionStorage.removeItem(KEY_NAME);
      window.sessionStorage.removeItem("impersonation_dealer_id");
      router.push("/admin");
      router.refresh();
    }
  };

  if (!businessName) return null;

  return (
    <>
      {justActivated ? (
        <p className="sr-only" role="status" aria-live="polite">
          התחזות הופעלה — עכשיו פועל כסוחר {businessName}
        </p>
      ) : null}
      <div role="region" aria-label="מצב התחזות" className="bg-brand-navy text-brand-gold">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            מתחזה ל־<span className="font-bold">{businessName}</span>
          </p>
          <button
            type="button"
            onClick={end}
            disabled={ending}
            aria-busy={ending || undefined}
            className="border-brand-gold bg-brand-navy text-brand-gold hover:bg-brand-gold hover:text-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70"
          >
            {ending ? "מסיים…" : "סיים התחזות"}
          </button>
        </div>
      </div>
    </>
  );
}
