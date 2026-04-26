"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

/*
 * Dealer self-service profile editor (Phase 4.4).
 *
 * A11y:
 *   - <fieldset>+<legend> grouping.
 *   - Phone input: type="tel", autocomplete="tel", dir="ltr".
 *   - Description textarea: max 1000 chars, polite live counter announced
 *     ≤ 50 remaining (matches Phase 3.5 KYC-reject pattern).
 *   - Save button disabled until dirty; success surfaces via role=status toast.
 */

const IL_MOBILE = /^(\+972|0)5\d{8}$/;

type Profile = {
  business_name: string;
  city: string;
  phone: string;
  description: string | null;
  logo_url: string | null;
};

type Props = {
  token: string;
  initial: Profile;
  onSaved: (next: Profile) => void;
};

export function ProfileEditor({ token, initial, onSaved }: Props) {
  const [businessName, setBusinessName] = useState(initial.business_name);
  const [city, setCity] = useState(initial.city);
  const [phone, setPhone] = useState(initial.phone);
  const [description, setDescription] = useState(initial.description ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logo_url);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const dirty =
    businessName !== initial.business_name ||
    city !== initial.city ||
    phone !== initial.phone ||
    (description ?? "") !== (initial.description ?? "");

  const remaining = 1000 - description.length;
  const counterAnnounce =
    remaining <= 0
      ? "לא ניתן להוסיף תווים נוספים"
      : remaining <= 50
        ? `נותרו ${remaining} תווים`
        : "";

  const save = async () => {
    setError(null);
    if (!IL_MOBILE.test(phone.replace(/[\s\-()]/g, ""))) {
      setError("פורמט טלפון לא תקין (דוגמה: 0501234567)");
      return;
    }
    if (description.length > 1000) {
      setError("תיאור ארוך מדי");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/v1/dealers/me", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          business_name: businessName,
          city,
          phone: phone.replace(/[\s\-()]/g, ""),
          description: description || null,
        }),
      });
      onSaved({
        business_name: businessName,
        city,
        phone,
        description: description || null,
        logo_url: logoUrl,
      });
      setToast("הפרופיל נשמר");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="profile-edit-heading"
      className="border-brand-navy/10 rounded-lg border bg-white p-5"
    >
      <h2 id="profile-edit-heading" className="text-brand-navy text-lg font-semibold">
        עריכת פרטי פרופיל
      </h2>

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

      <fieldset className="mt-4 space-y-4 border-0 p-0">
        <legend className="sr-only">פרטי פרופיל</legend>

        <div>
          <label htmlFor="pf-name" className="text-brand-navy block text-sm font-medium">
            שם העסק
          </label>
          <input
            id="pf-name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-city" className="text-brand-navy block text-sm font-medium">
              עיר
            </label>
            <input
              id="pf-city"
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
          <div>
            <label htmlFor="pf-phone" className="text-brand-navy block text-sm font-medium">
              טלפון
            </label>
            <p id="pf-phone-hint" dir="ltr" className="text-brand-navy/70 mt-1 text-xs">
              פורמט: 05X-XXXXXXX
            </p>
            <input
              id="pf-phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby="pf-phone-hint"
              className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pf-desc" className="text-brand-navy block text-sm font-medium">
            תיאור קצר של העסק
          </label>
          <p id="pf-desc-hint" className="text-brand-navy/70 mt-1 text-xs">
            עד 1000 תווים — יוצג לסוחרים אחרים בפרופיל הציבורי
          </p>
          <textarea
            id="pf-desc"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby="pf-desc-hint pf-desc-count"
            className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <p id="pf-desc-count" aria-live="polite" className="text-brand-ink/60 mt-1 text-xs">
            {counterAnnounce}
          </p>
        </div>

        {/* Desktop save button — inline. */}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          aria-busy={busy || undefined}
          className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy hidden min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
        >
          {busy ? "שומר…" : "שמור פרטי פרופיל"}
        </button>

        {/* Mobile sticky save — pinned to viewport bottom while the
            user is editing. Honors safe-area-inset-bottom on iPhone X+
            so the button doesn't overlap the home indicator. Only
            enabled when there's something to save. */}
        {dirty || busy ? (
          <div
            className="border-brand-navy/15 fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 py-3 backdrop-blur sm:hidden"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              aria-busy={busy || undefined}
              className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "שומר…" : "שמור פרטי פרופיל"}
            </button>
          </div>
        ) : null}
      </fieldset>
    </section>
  );
}
