"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";
import { apiFetch } from "@/lib/api";

/**
 * SuspendWithReasonDialog — Phase 6.7. Loud (visible) suspension.
 *
 * The dealer keeps logging in but every authenticated request returns 403
 * with the reason in the detail. They also receive an email. Reversible
 * via the Unsuspend button.
 *
 * A11y notes (per a11y-lead bundle review):
 *   - Native fieldset+legend + radio inputs styled as cards (no role=radiogroup).
 *   - "שמור כתבנית" checkbox reveals only when "אחר" is selected AND the
 *     textarea has non-empty content.
 *   - Admin password clears on dialog close.
 *   - aria-describedby points to the warning panel.
 *   - Submit disabled until reason chosen AND password entered.
 *   - Submit failure → role="alert" near the form, focus moves to it.
 */

type ReasonTemplate = { id: string; text_he: string; kind: string; active: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  dealerLabel: string;
  token: string;
  onSuspended: () => void;
};

const OTHER = "__other__";

export function SuspendWithReasonDialog({
  open,
  onOpenChange,
  dealerId,
  dealerLabel,
  token,
  onSuspended,
}: Props) {
  const [reasons, setReasons] = useState<ReasonTemplate[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (open) {
      setPicked("");
      setOtherText("");
      setSaveAsTemplate(false);
      setAdminPassword("");
      setError(null);
      void apiFetch<ReasonTemplate[]>("/api/v1/admin/suspension-reasons?kind=suspend", { token })
        .then(setReasons)
        .catch(() => setReasons([]));
      // Initial focus: reason fieldset (NOT the destructive button).
      queueMicrotask(() => fieldsetRef.current?.focus());
    }
  }, [open, token]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const finalReason =
    picked === OTHER ? otherText.trim() : (reasons.find((r) => r.id === picked)?.text_he ?? "");
  const canSubmit = finalReason.length > 0 && adminPassword.length > 0 && !busy;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/dealers/${dealerId}/suspend`, {
        method: "POST",
        token,
        body: JSON.stringify({
          silent: false,
          reason: finalReason,
          admin_password: adminPassword,
        }),
      });
      // If admin chose "אחר" + asked to save as template, fire-and-forget.
      if (picked === OTHER && saveAsTemplate && otherText.trim()) {
        void apiFetch("/api/v1/admin/suspension-reasons", {
          method: "POST",
          token,
          body: JSON.stringify({
            text_he: otherText.trim(),
            kind: "suspend",
          }),
        }).catch(() => {});
      }
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
          aria-describedby="suspend-warning"
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream relative max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              השעיית סוחר
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {dealerLabel}
            </Dialog.Description>

            <div
              id="suspend-warning"
              className="mt-4 rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <strong>שים לב:</strong> הסוחר לא יוכל לבצע פעולות במערכת ויקבל מייל עם הסיבה להשעיה.
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <fieldset ref={fieldsetRef} tabIndex={-1} className="focus:outline-none">
                <legend className="text-brand-ink mb-2 block text-sm font-semibold">
                  סיבת ההשעיה
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {reasons.map((r) => {
                    const selected = picked === r.id;
                    return (
                      <label
                        key={r.id}
                        className={[
                          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-semibold transition",
                          "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          selected
                            ? "border-brand-navy bg-brand-navy/10 text-brand-navy"
                            : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={r.id}
                          checked={selected}
                          onChange={() => setPicked(r.id)}
                          className="sr-only"
                        />
                        {r.text_he}
                      </label>
                    );
                  })}
                  <label
                    className={[
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-semibold transition",
                      "has-[:focus-visible]:outline-brand-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                      picked === OTHER
                        ? "border-brand-navy bg-brand-navy/10 text-brand-navy"
                        : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 bg-white",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={OTHER}
                      checked={picked === OTHER}
                      onChange={() => setPicked(OTHER)}
                      className="sr-only"
                    />
                    אחר…
                  </label>
                </div>
              </fieldset>

              {picked === OTHER ? (
                <div className="space-y-2">
                  <label
                    htmlFor="suspend-other-text"
                    className="text-brand-ink block text-sm font-semibold"
                  >
                    סיבה מותאמת
                  </label>
                  <textarea
                    id="suspend-other-text"
                    rows={3}
                    maxLength={200}
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    className="border-brand-navy/20 focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                  {otherText.trim().length > 0 ? (
                    <label className="text-brand-ink/70 inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={saveAsTemplate}
                        onChange={(e) => setSaveAsTemplate(e.target.checked)}
                      />
                      שמור כתבנית לשימוש הבא
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="suspend-admin-pw"
                  className="text-brand-ink block text-sm font-semibold"
                >
                  אישור — סיסמת המנהל שלך
                </label>
                <input
                  id="suspend-admin-pw"
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
                  {busy ? "משעה…" : "השעה את הסוחר"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
