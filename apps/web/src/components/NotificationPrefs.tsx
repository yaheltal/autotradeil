"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * Notification-preferences fieldset (Phase 4.4 Step 7).
 *
 * A11y:
 *   - <fieldset>+<legend> visible (per a11y-lead D).
 *   - Native <input type="checkbox"> + wrapping <label>.
 *   - Explicit Save button (no auto-save) — consistent with security page.
 *   - Save toast announces via role="status".
 */

type Prefs = {
  notification_offers: boolean;
  notification_deals: boolean;
  notification_updates: boolean;
};

type Props = {
  token: string;
  initial: Prefs;
};

export function NotificationPrefs({ token, initial }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [toast, setToast] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const dirty =
    prefs.notification_offers !== initial.notification_offers ||
    prefs.notification_deals !== initial.notification_deals ||
    prefs.notification_updates !== initial.notification_updates;

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/dealers/me", {
        method: "PATCH",
        token,
        body: JSON.stringify(prefs),
      }),
    onSuccess: () => {
      setToast("ההעדפות נשמרו");
      void qc.invalidateQueries({ queryKey: queryKeys.dealer.me() });
    },
  });
  const busy = saveMutation.isPending;
  const error =
    saveMutation.error instanceof Error
      ? saveMutation.error.message
      : saveMutation.error
        ? "שגיאה בשמירה"
        : null;
  const save = () => saveMutation.mutate();

  return (
    <section
      aria-labelledby="notif-heading"
      className="border-brand-navy/10 rounded-lg border bg-white p-6"
    >
      <h2 id="notif-heading" className="text-brand-navy text-lg font-semibold">
        הגדרות התראות
      </h2>
      <p className="text-brand-ink/70 mt-1 text-sm">בחר אילו אימיילים תרצה לקבל מהמערכת.</p>

      {toast ? (
        <p role="status" aria-live="polite" className="sr-only" key={toast}>
          {toast}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <fieldset className="mt-4 space-y-2 border-0 p-0">
        <legend className="text-brand-navy text-sm font-medium">סוגי התראות</legend>

        <label className="border-brand-navy/20 hover:bg-brand-navy/5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 py-2">
          <input
            type="checkbox"
            checked={prefs.notification_offers}
            onChange={(e) => setPrefs((p) => ({ ...p, notification_offers: e.target.checked }))}
            className="accent-brand-navy"
          />
          <span className="text-brand-ink text-sm">הצעה חדשה התקבלה על מלאי שלי</span>
        </label>

        <label className="border-brand-navy/20 hover:bg-brand-navy/5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 py-2">
          <input
            type="checkbox"
            checked={prefs.notification_deals}
            onChange={(e) => setPrefs((p) => ({ ...p, notification_deals: e.target.checked }))}
            className="accent-brand-navy"
          />
          <span className="text-brand-ink text-sm">הצעה שלי התקבלה / נדחתה / עסקה הושלמה</span>
        </label>

        <label className="border-brand-navy/20 hover:bg-brand-navy/5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 py-2">
          <input
            type="checkbox"
            checked={prefs.notification_updates}
            onChange={(e) => setPrefs((p) => ({ ...p, notification_updates: e.target.checked }))}
            className="accent-brand-navy"
          />
          <span className="text-brand-ink text-sm">עדכוני מערכת ושינויי מדיניות</span>
        </label>
      </fieldset>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !dirty}
        aria-busy={busy || undefined}
        className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "שומר…" : "שמור העדפות"}
      </button>
    </section>
  );
}
