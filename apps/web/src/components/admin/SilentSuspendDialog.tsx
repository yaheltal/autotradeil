"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { apiFetch } from "@/lib/api";

/**
 * SilentSuspendDialog — Phase 6.7. Silent block (the "shibush").
 *
 * No reason picker. No email to the dealer. The dealer logs in and finds
 * every authenticated request returning a generic 503 "שירות לא זמין" —
 * they don't know they were singled out. Used during investigation.
 *
 * A11y notes (per a11y-lead bundle review):
 *   - Initial focus on password field (no reason fieldset here).
 *   - aria-describedby points to the warning panel.
 *   - Submit failure → role="alert" near the form, focus moves to it.
 *   - Amber tone — passes contrast on white background.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  dealerLabel: string;
  token: string;
  onSuspended: () => void;
};

export function SilentSuspendDialog({
  open,
  onOpenChange,
  dealerId,
  dealerLabel,
  token,
  onSuspended,
}: Props) {
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLParagraphElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAdminPassword("");
      setError(null);
      queueMicrotask(() => pwRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const canSubmit = adminPassword.length > 0 && !busy;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealerId}/suspend`, {
        method: "POST",
        token,
        body: JSON.stringify({ silent: true, admin_password: adminPassword }),
      });
      onSuspended();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהשעיה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          aria-describedby="silent-warning"
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <Dialog.Title className="text-brand-navy text-lg font-bold">השעיה שקטה</Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {dealerLabel}
            </Dialog.Description>

            <div
              id="silent-warning"
              className="mt-4 rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900"
            >
              <strong>פעולה זו אינה גלויה לסוחר.</strong>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>הסוחר יראה רק שגיאות גנריות &quot;שירות לא זמין&quot;</li>
                <li>לא יישלח מייל</li>
                <li>לא יופיע באנר במערכת</li>
                <li>השתמש רק לצורכי חקירה</li>
              </ul>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="silent-admin-pw"
                  className="text-brand-ink block text-sm font-semibold"
                >
                  אישור — סיסמת המנהל שלך
                </label>
                <input
                  id="silent-admin-pw"
                  ref={pwRef}
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="border-brand-navy/20 focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>

              {error ? (
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="bg-danger-bg text-danger-text rounded-md px-3 py-2 text-sm focus:outline-none"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-busy={busy || undefined}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "משעה…" : "השעה בשקט"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
