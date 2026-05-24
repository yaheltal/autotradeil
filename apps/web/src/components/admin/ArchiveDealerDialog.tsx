"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * ArchiveDealerDialog — Phase 6.7. Soft-delete a dealer.
 *
 * Sets archived_at and DELETES the Supabase auth user so the email is
 * freed for re-signup. dealers/inventory/offers/deals rows stay.
 *
 * A11y notes: same as SuspendWithReasonDialog (reason picker + password
 * + warning panel + role=alert error). Strong red tone — destructive.
 */

type ReasonTemplate = { id: string; text_he: string; kind: string; active: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  dealerLabel: string;
  token: string;
  onArchived: () => void;
};

const OTHER = "__other__";

export function ArchiveDealerDialog({
  open,
  onOpenChange,
  dealerId,
  dealerLabel,
  token,
  onArchived,
}: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  const reasonsQuery = useQuery({
    queryKey: ["admin", "suspension-reasons", "archive"] as const,
    queryFn: () =>
      apiFetch<ReasonTemplate[]>("/api/v1/admin/suspension-reasons?kind=archive", { token }),
    enabled: open,
  });
  const reasons = reasonsQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setPicked("");
      setOtherText("");
      setSaveAsTemplate(false);
      setAdminPassword("");
      setError(null);
      queueMicrotask(() => fieldsetRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const finalReason =
    picked === OTHER ? otherText.trim() : (reasons.find((r) => r.id === picked)?.text_he ?? "");

  const archiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/admin/dealers/${dealerId}/archive`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: finalReason, admin_password: adminPassword }),
      }),
    onSuccess: () => {
      if (picked === OTHER && saveAsTemplate && otherText.trim()) {
        // Fire-and-forget template save; failure shouldn't block close.
        void apiFetch("/api/v1/admin/suspension-reasons", {
          method: "POST",
          token,
          body: JSON.stringify({ text_he: otherText.trim(), kind: "archive" }),
        }).catch(() => {});
      }
      void qc.invalidateQueries({ queryKey: ["admin", "dealers"] });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.dealersArchived() });
      onArchived();
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "שגיאה בארכוב"),
  });
  const busy = archiveMutation.isPending;
  const canSubmit = finalReason.length > 0 && adminPassword.length > 0 && !busy;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    await archiveMutation.mutateAsync();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          aria-describedby="archive-warning"
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream relative max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 text-lg font-bold">
              מחיקת סוחר (העברה לארכיון)
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/70 mt-1 text-sm">
              {dealerLabel}
            </Dialog.Description>

            <div
              id="archive-warning"
              className="bg-danger-bg border-danger-text/30 text-danger-text mt-4 rounded-md border-2 px-3 py-3 text-sm"
            >
              <strong>פעולה זו תמחק את חשבון האותנטיקציה של הסוחר.</strong>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>הסוחר לא יוכל יותר להתחבר עם הסיסמה הנוכחית</li>
                <li>האימייל שלו ישתחרר — הוא יוכל להירשם מחדש</li>
                <li>כל ההיסטוריה (מלאי, הצעות, עסקאות) נשמרת לצורכי תיעוד</li>
                <li>ניתן לשחזר את הרשומה מדף הארכיון, אבל המשתמש יזדקק להזמנה מחדש</li>
              </ul>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <fieldset ref={fieldsetRef} tabIndex={-1} className="focus:outline-none">
                <legend className="text-brand-ink mb-2 block text-sm font-semibold">
                  סיבת המחיקה
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
                    htmlFor="archive-other-text"
                    className="text-brand-ink block text-sm font-semibold"
                  >
                    סיבה מותאמת
                  </label>
                  <textarea
                    id="archive-other-text"
                    rows={3}
                    maxLength={100}
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
                  htmlFor="archive-admin-pw"
                  className="text-brand-ink block text-sm font-semibold"
                >
                  אישור — סיסמת המנהל שלך
                </label>
                <input
                  id="archive-admin-pw"
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
                  className="bg-danger-text hover:bg-danger-text/90 focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "מארכב…" : "ארכב את הסוחר"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
