"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { queryKeys } from "@/lib/query-keys";

/*
 * Admin system-settings page (Phase 4.4 Step 1).
 *
 * A11y plan (approved):
 *   - H1 focusable on data-ready.
 *   - Three sections: system / subscription tiers (disabled stub) /
 *     admin management (table + add dialog).
 *   - Add-admin dialog: email input with associated <label>, dir="ltr",
 *     autocomplete="email", required, aria-invalid + aria-describedby
 *     error wiring on 404 (a11y-lead required change A).
 *   - Toast region for save announcements (role="status").
 */

type Settings = {
  site_name: string;
  support_email: string;
  welcome_message: string;
  subscription_tiers: Record<string, unknown> | null;
};

type AdminUser = { id: string; email: string; created_at: string };

export default function AdminSettingsPage() {
  const { token, loading } = useAdminAuth();
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Edit form state
  const [siteName, setSiteName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");

  // Add-admin dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.settings(),
    queryFn: () => apiFetch<Settings>("/api/v1/admin/settings", { token: token! }),
    enabled: !!token,
  });
  const adminsQuery = useQuery({
    queryKey: ["admin", "admins"] as const,
    queryFn: () => apiFetch<AdminUser[]>("/api/v1/admin/admins", { token: token! }),
    enabled: !!token,
  });
  const settings = settingsQuery.data ?? null;
  const admins = adminsQuery.data ?? null;

  // Seed form fields once settings arrive.
  useEffect(() => {
    if (settings) {
      setSiteName(settings.site_name);
      setSupportEmail(settings.support_email);
      setWelcomeMsg(settings.welcome_message);
    }
  }, [settings]);

  useEffect(() => {
    const e = settingsQuery.error || adminsQuery.error;
    if (e) setError(e instanceof Error ? e.message : "שגיאה בטעינה");
  }, [settingsQuery.error, adminsQuery.error]);

  useEffect(() => {
    if (settings) h1Ref.current?.focus();
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (addOpen) queueMicrotask(() => addInputRef.current?.focus());
  }, [addOpen]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/admin/settings", {
        method: "PATCH",
        token: token!,
        body: JSON.stringify({
          site_name: siteName,
          support_email: supportEmail,
          welcome_message: welcomeMsg,
        }),
      }),
    onSuccess: () => {
      setToast("ההגדרות נשמרו");
      void qc.invalidateQueries({ queryKey: queryKeys.admin.settings() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "שגיאה בשמירה"),
  });
  const savingSettings = saveSettingsMutation.isPending;
  const saveSettings = () => saveSettingsMutation.mutateAsync();

  const addAdminMutation = useMutation({
    mutationFn: (email: string) =>
      apiFetch("/api/v1/admin/admins", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ email }),
      }),
    onSuccess: async (_d, email) => {
      setToast(`${email} קיבל הרשאות מנהל`);
      setAddOpen(false);
      setAddEmail("");
      await qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      queueMicrotask(() => addTriggerRef.current?.focus());
    },
    onError: (e) => {
      setAddError(e instanceof Error ? e.message : "שגיאה");
      addInputRef.current?.focus();
    },
  });
  const addBusy = addAdminMutation.isPending;
  const submitAdd = async () => {
    setAddError(null);
    await addAdminMutation.mutateAsync(addEmail.trim());
  };

  if (loading || !token) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          href="/admin"
          className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">→</span>
          חזרה ללוח ניהול
        </Link>

        <h1
          ref={h1Ref}
          tabIndex={-1}
          className="text-brand-navy mt-4 text-3xl font-bold tracking-tight focus:outline-none"
        >
          הגדרות מערכת
        </h1>

        {toast ? (
          <p role="status" aria-live="polite" className="sr-only" key={toast}>
            {toast}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        {/* ====================================================
            1) System settings
            ==================================================== */}
        <section
          aria-labelledby="sys-heading"
          className="border-brand-navy/10 mt-6 rounded-lg border bg-white p-6"
        >
          <h2 id="sys-heading" className="text-brand-navy text-lg font-semibold">
            הגדרות כלליות
          </h2>

          <fieldset className="mt-4 space-y-4 border-0 p-0">
            <legend className="sr-only">פרטי מערכת</legend>
            <div>
              <label htmlFor="set-name" className="text-brand-navy block text-sm font-medium">
                שם המערכת
              </label>
              <input
                id="set-name"
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
            <div>
              <label htmlFor="set-email" className="text-brand-navy block text-sm font-medium">
                אימייל תמיכה
              </label>
              <input
                id="set-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
            <div>
              <label htmlFor="set-welcome" className="text-brand-navy block text-sm font-medium">
                הודעת ברוכים הבאים לסוחרים חדשים
              </label>
              <textarea
                id="set-welcome"
                rows={3}
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={savingSettings}
              aria-busy={savingSettings || undefined}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              {savingSettings ? "שומר…" : "שמור הגדרות"}
            </button>
          </fieldset>
        </section>

        {/* ====================================================
            2) Subscription tiers (disabled stub)
            ==================================================== */}
        <section
          aria-labelledby="tiers-heading"
          className="border-brand-navy/10 mt-6 rounded-lg border bg-white p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="tiers-heading" className="text-brand-navy text-lg font-semibold">
              דמי מנוי
            </h2>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-700/30">
              בקרוב
            </span>
          </div>
          <ul className="text-brand-ink/80 mt-3 space-y-1 text-sm">
            <li>Bronze — חינם</li>
            <li>Silver — ₪— / חודש</li>
            <li>Gold — ₪— / חודש</li>
            <li>Platinum — ₪— / חודש</li>
          </ul>
          <button
            type="button"
            disabled
            className="border-brand-navy/30 text-brand-navy/60 mt-4 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-md border bg-white px-5 py-2 text-sm font-semibold opacity-60"
          >
            שמור דמי מנוי (בקרוב)
          </button>
        </section>

        {/* ====================================================
            3) Admin management
            ==================================================== */}
        <section
          aria-labelledby="admins-heading"
          className="border-brand-navy/10 mt-6 rounded-lg border bg-white p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="admins-heading" className="text-brand-navy text-lg font-semibold">
              ניהול אדמינים
            </h2>
            <button
              ref={addTriggerRef}
              type="button"
              onClick={() => setAddOpen(true)}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              הוסף אדמין
            </button>
          </div>

          {admins === null ? (
            <p role="status" className="text-brand-ink/60 p-4">
              טוען…
            </p>
          ) : admins.length === 0 ? (
            <p className="text-brand-ink/60 mt-4">אין אדמינים רשומים</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {admins.map((a) => (
                <li
                  key={a.id}
                  className="border-brand-navy/10 bg-brand-cream/40 flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-brand-ink text-sm">{a.email}</span>
                  <span className="text-brand-ink/50 text-xs">מנהל</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Add-admin dialog */}
      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay aria-hidden="true" className="bg-brand-navy/40 fixed inset-0 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4">
            <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl">
              <Dialog.Title className="text-brand-navy text-lg font-bold">
                הענקת הרשאות מנהל
              </Dialog.Title>
              <Dialog.Description className="text-brand-ink/80 mt-2 text-sm">
                הזן את כתובת האימייל של משתמש קיים. משתמשים שאינם רשומים — יש לרשום קודם. פעולה זו
                תעניק הרשאות מנהל מלאות.
              </Dialog.Description>

              <label
                htmlFor="add-admin-email"
                className="text-brand-navy mt-4 block text-sm font-medium"
              >
                אימייל
              </label>
              <input
                id="add-admin-email"
                ref={addInputRef}
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={addEmail}
                onChange={(e) => {
                  setAddEmail(e.target.value);
                  setAddError(null);
                }}
                aria-describedby={addError ? "add-admin-error" : undefined}
                aria-invalid={addError ? true : undefined}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              {addError ? (
                <p id="add-admin-error" role="alert" className="text-danger-text mt-1 text-sm">
                  {addError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void submitAdd()}
                  disabled={addBusy || !addEmail.trim()}
                  aria-busy={addBusy || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {addBusy ? "מוסיף…" : "הענק הרשאות"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
