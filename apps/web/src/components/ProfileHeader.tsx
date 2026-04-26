"use client";

import { useEffect, useRef, useState } from "react";

import { TrustBadge, type Tier } from "@/components/TrustBadge";

/*
 * ProfileHeader — large circular avatar + business name + tier badge.
 *
 * The avatar is the click target for changing the dealer's logo: tap
 * opens an action sheet with three options (gallery / camera / remove).
 * If no logo is set, the avatar shows the dealer's first business-name
 * letter on a navy background.
 *
 * Logo uploads POST to /api/v1/dealers/me/logo (multipart). Remove
 * sends `remove=1` flag the backend supports. We don't validate
 * file types here — the backend rejects anything outside its
 * allow-list with a Hebrew error.
 *
 * A11y:
 *   - Avatar wrapped in a real <button aria-label> so SR users hear
 *     "שנה תמונת לוגו של {business}".
 *   - Action sheet is a Radix-style listbox built from native
 *     <button>s inside a role=dialog overlay; Escape closes; first
 *     button is the autofocus target.
 *   - Tier badge inherits TrustBadge's a11y (tooltip + label).
 *   - role=status region announces upload progress.
 */

type Props = {
  token: string;
  businessName: string;
  city: string | null;
  tier: Tier;
  trustScore: number;
  logoUrl: string | null;
  onLogoChanged: (next: string | null) => void;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function ProfileHeader({
  token,
  businessName,
  city,
  tier,
  trustScore,
  logoUrl,
  onLogoChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sheetFirstBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => sheetFirstBtnRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      queueMicrotask(() => triggerRef.current?.focus());
    };
  }, [sheetOpen]);

  const initial = businessName.trim().charAt(0) || "?";

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setStatus("מעלה לוגו…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/v1/dealers/me/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? body.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { logo_url: string | null };
      onLogoChanged(data.logo_url);
      setStatus("הלוגו עודכן");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהעלאת הלוגו");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setSheetOpen(false);
    setBusy(true);
    setError(null);
    setStatus("מסיר לוגו…");
    try {
      const res = await fetch(`${API_BASE}/api/v1/dealers/me/logo`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 405) {
        // 405 = backend doesn't support DELETE; fall back to PATCH null
        const patch = await fetch(`${API_BASE}/api/v1/dealers/me`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ logo_url: null }),
        });
        if (!patch.ok) {
          throw new Error("שגיאה בהסרת הלוגו");
        }
      }
      onLogoChanged(null);
      setStatus("הלוגו הוסר");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהסרת הלוגו");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="profile-header-name"
      className="border-brand-navy/10 rounded-xl border bg-white p-5 sm:p-6"
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`שנה תמונת לוגו של ${businessName}`}
          aria-haspopup="dialog"
          disabled={busy}
          className={[
            "border-brand-gold/40 hover:border-brand-gold focus-visible:outline-brand-navy relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-28 sm:w-28",
            busy ? "cursor-wait opacity-70" : "cursor-pointer",
          ].join(" ")}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="bg-brand-navy text-brand-cream flex h-full w-full items-center justify-center font-serif text-4xl font-bold sm:text-5xl"
            >
              {initial}
            </span>
          )}
          {/* Camera glyph overlay — small, only visible on hover/focus
              to hint that the avatar is interactive. */}
          <span
            aria-hidden="true"
            className="bg-brand-navy/85 text-brand-cream pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100 sm:text-xs"
          >
            ערוך
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <h2
            id="profile-header-name"
            className="text-brand-navy font-serif text-xl font-bold leading-tight sm:text-2xl"
          >
            {businessName}
          </h2>
          {city ? <p className="text-brand-ink/65 mt-0.5 text-sm">{city}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TrustBadge tier={tier} />
            <span className="text-brand-ink/65 text-xs font-medium">
              · ציון אמון <span className="text-brand-navy font-semibold">{trustScore}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Hidden inputs feed the action sheet */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setSheetOpen(false);
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setSheetOpen(false);
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      {status ? (
        <p role="status" aria-live="polite" className="text-brand-ink/70 mt-3 text-xs" key={status}>
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-danger-bg text-danger-text mt-3 rounded-md px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}

      {/* Action sheet — bottom-anchored on mobile, centered card on sm+ */}
      {sheetOpen ? (
        <>
          <button
            type="button"
            aria-label="סגור"
            onClick={() => setSheetOpen(false)}
            className="bg-brand-navy/40 fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="שינוי תמונת לוגו"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-xl bg-white p-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
          >
            <p className="text-brand-navy text-base font-bold">שנה תמונת לוגו</p>
            <ul className="mt-3 space-y-2">
              <li>
                <button
                  ref={sheetFirstBtnRef}
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="border-brand-navy/15 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 w-full items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">🖼</span>
                  בחר מהגלריה
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="border-brand-navy/15 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 w-full items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">📷</span>
                  צלם תמונה
                </button>
              </li>
              {logoUrl ? (
                <li>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="border-danger-text/30 text-danger-text hover:bg-danger-bg/40 focus-visible:outline-danger-text inline-flex min-h-12 w-full items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span aria-hidden="true">🗑</span>
                    הסר תמונה
                  </button>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="text-brand-ink/70 hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  ביטול
                </button>
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}
