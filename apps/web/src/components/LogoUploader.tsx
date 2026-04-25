"use client";

import { useState } from "react";

/*
 * Dealer logo upload — Phase 4.4.
 *
 * A11y:
 *   - Visually-hidden file input (.sr-only) kept in tab order.
 *   - Filename announced via role="status" on selection.
 *   - Errors via role="alert".
 *   - Decorative thumbnail uses alt="" (adjacent text already labels it).
 */

type Props = {
  token: string;
  currentLogoUrl: string | null;
  onUploaded: (url: string) => void;
};

export function LogoUploader({ token, currentLogoUrl, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setBusy(true);
    setFilename(f.name);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/dealers/me/logo`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? body.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { logo_url: string };
      onUploaded(data.logo_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהעלאת הלוגו");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-brand-navy/10 rounded-md border bg-white p-4">
      <p className="text-brand-navy text-sm font-semibold">לוגו העסק</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {currentLogoUrl ? (
          // Decorative — adjacent label "לוגו העסק" already names it
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentLogoUrl}
            alt=""
            aria-hidden="true"
            className="border-brand-navy/10 h-16 w-16 rounded-md border object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="border-brand-navy/10 text-brand-ink/30 bg-brand-cream/40 flex h-16 w-16 items-center justify-center rounded-md border text-2xl"
          >
            🏢
          </div>
        )}

        <div className="flex flex-col gap-1">
          <input
            id="dealer-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onSelect}
            className="sr-only"
          />
          <label
            htmlFor="dealer-logo"
            aria-label={`${currentLogoUrl ? "החלפת" : "העלאת"} לוגו העסק`}
            className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-within:outline-brand-navy inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2"
          >
            {busy ? "מעלה…" : currentLogoUrl ? "החלף לוגו" : "העלאת לוגו"}
          </label>
          {filename ? (
            <p role="status" aria-live="polite" className="text-brand-ink/70 text-xs">
              נבחר: <span className="font-mono">{filename}</span>
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-danger-text text-xs">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
