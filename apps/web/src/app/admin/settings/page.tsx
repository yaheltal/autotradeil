"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { AdminStatusPill } from "@/components/admin/AdminStatusPill";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/settings — editorial system settings.
 *
 *   הגדרות מערכת
 *   ──────────
 *   שם המערכת · אימייל תמיכה · ניהול אדמינים
 *
 *   הגדרות כלליות
 *   ──────────
 *   {שם / אימייל / הודעת ברוכים הבאים}                [שמור]
 *
 *   דמי מנוי                                    [בקרוב]
 *   ──────────
 *   Bronze / Silver / Gold / Platinum stub
 *
 *   ניהול אדמינים                              [הוסף אדמין]
 *   ──────────
 *   ── email · "מנהל"                              ← hairline rows
 *
 * Three sections, same eyebrow + hairline rhythm. The add-admin
 * dialog uses shadcn <Dialog>. The "בקרוב" tier badge uses
 * AdminStatusPill neutral variant (no amber).
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

  const headingRef = useRef<HTMLHeadingElement>(null);

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
    if (settings) headingRef.current?.focus();
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

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-3xl">
      <AdminMasthead
        title="הגדרות מערכת"
        dek={<span>שם המערכת, אימייל תמיכה, ניהול אדמינים</span>}
        loading={loading || (!settings && !error)}
        headingRef={headingRef}
      />

      {toast ? (
        <p role="status" aria-live="polite" className="sr-only" key={toast}>
          {toast}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── SECTION 1: GENERAL ────────────────────────────────────── */}
      <section aria-labelledby="general-heading" className="mt-3xl">
        <p className="text-muted text-xs font-medium uppercase tracking-widest">הגדרות כלליות</p>
        <h2 id="general-heading" className="sr-only">
          הגדרות כלליות
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <fieldset className="mt-lg space-y-lg border-0 p-0">
          <legend className="sr-only">פרטי מערכת</legend>
          <div>
            <Label htmlFor="set-name">שם המערכת</Label>
            <Input
              id="set-name"
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="mt-xs"
            />
          </div>
          <div>
            <Label htmlFor="set-email">אימייל תמיכה</Label>
            <Input
              id="set-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="mt-xs"
            />
          </div>
          <div>
            <Label htmlFor="set-welcome">הודעת ברוכים הבאים לסוחרים חדשים</Label>
            <Textarea
              id="set-welcome"
              rows={3}
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              className="mt-xs"
            />
          </div>
          <Button
            type="button"
            onClick={() => void saveSettingsMutation.mutateAsync()}
            disabled={savingSettings}
            aria-busy={savingSettings || undefined}
          >
            {savingSettings ? "שומר…" : "שמור הגדרות"}
          </Button>
        </fieldset>
      </section>

      {/* ── SECTION 2: SUBSCRIPTION TIERS (stub) ─────────────────── */}
      <section aria-labelledby="tiers-heading" className="mt-3xl">
        <div className="gap-md flex items-center justify-between">
          <p className="text-muted text-xs font-medium uppercase tracking-widest">דמי מנוי</p>
          <AdminStatusPill variant="neutral">בקרוב</AdminStatusPill>
        </div>
        <h2 id="tiers-heading" className="sr-only">
          דמי מנוי
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <dl className="mt-lg">
          {[
            { tier: "Bronze", price: "חינם" },
            { tier: "Silver", price: "₪— / חודש" },
            { tier: "Gold", price: "₪— / חודש" },
            { tier: "Platinum", price: "₪— / חודש" },
          ].map((row) => (
            <div
              key={row.tier}
              className="border-hairline py-sm flex items-baseline justify-between border-b last:border-b-0"
            >
              <dt className="text-muted text-sm">{row.tier}</dt>
              <dd className="text-ink font-tabular text-sm">{row.price}</dd>
            </div>
          ))}
        </dl>
        <Button type="button" variant="outline" disabled className="mt-lg">
          שמור דמי מנוי (בקרוב)
        </Button>
      </section>

      {/* ── SECTION 3: ADMIN MANAGEMENT ──────────────────────────── */}
      <section aria-labelledby="admins-heading" className="mt-3xl">
        <div className="gap-md flex items-center justify-between">
          <p className="text-muted text-xs font-medium uppercase tracking-widest">ניהול אדמינים</p>
          <Button
            ref={addTriggerRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus aria-hidden="true" />
            <span>הוסף אדמין</span>
          </Button>
        </div>
        <h2 id="admins-heading" className="sr-only">
          ניהול אדמינים
        </h2>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {admins === null ? (
          <AdminsSkeleton />
        ) : admins.length === 0 ? (
          <p className="text-muted py-2xl text-center text-sm" role="status">
            אין אדמינים רשומים.
          </p>
        ) : (
          <ul className="mt-md">
            {admins.map((a) => (
              <li
                key={a.id}
                className="border-hairline py-md flex items-center justify-between border-b last:border-b-0"
              >
                <span className="text-ink text-sm" dir="ltr">
                  {a.email}
                </span>
                <span className="text-muted text-xs">מנהל</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ADD-ADMIN DIALOG ─────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הענקת הרשאות מנהל</DialogTitle>
            <DialogDescription>
              הזן את כתובת האימייל של משתמש קיים. משתמשים שאינם רשומים — יש לרשום קודם. פעולה זו
              תעניק הרשאות מנהל מלאות.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-md">
            <Label htmlFor="add-admin-email">אימייל</Label>
            <Input
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
              className="mt-xs"
            />
            {addError ? (
              <p id="add-admin-error" role="alert" className="text-danger-fg mt-xxs text-sm">
                {addError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => void submitAdd()}
              disabled={addBusy || !addEmail.trim()}
              aria-busy={addBusy || undefined}
            >
              {addBusy ? "מוסיף…" : "הענק הרשאות"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminsSkeleton() {
  return (
    <div className="mt-md" role="status" aria-live="polite">
      <span className="sr-only">טוען אדמינים…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline py-md flex items-center justify-between border-b last:border-b-0"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}
