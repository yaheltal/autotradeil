"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

/*
 * Vehicle images management.
 *
 * A11y decisions (approved, 6 required changes applied):
 *   1. Counter is a live region  <p aria-live="polite" aria-atomic>.
 *   2. Upload is a real <button> that calls inputRef.current?.click()
 *      (not label-as-button — no tab-order edge cases).
 *   3. Per-thumb delete aria-label carries position + total + car id.
 *   4. Errors rendered in a single <ul role="alert"> container; items
 *      are plain <li>.
 *   5. Focus after delete: next → prev → upload → close fallback.
 *   6. Confirm-delete inline ribbon shows thumbnail preview + position.
 *
 * We use a native <progress aria-hidden="true"> visually only — the
 * single role="status" line is the SR signal, gated to start/end.
 *
 * Storage: sessionStorage is NOT touched here; images are owned
 * server-side and re-fetched on open.
 */

const MAX_IMAGES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic)$/i;

type Image = { id: string; url: string; position: number };

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  token: string;
};

export function VehicleImagesDialog({ open, onOpenChange, vehicle, token }: Props) {
  const [images, setImages] = useState<Image[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Image | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const uploadBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const vehicleLabel = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<Image[]>(`/api/v1/inventory/${vehicle.id}/images`, { token });
      setImages(list);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "שגיאה בטעינת התמונות"]);
      setImages([]);
    }
  }, [vehicle.id, token]);

  useEffect(() => {
    if (open) {
      setErrors([]);
      setStatusMsg("");
      setPendingDelete(null);
      void load();
    }
  }, [open, load]);

  const count = images?.length ?? 0;
  const remaining = MAX_IMAGES - count;
  const atMax = remaining <= 0;

  const validateFiles = (files: FileList): { ok: File[]; errs: string[] } => {
    const ok: File[] = [];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_MIME.has(f.type) && !ALLOWED_EXT.test(f.name)) {
        errs.push(`${f.name}: סוג הקובץ אינו נתמך (JPEG / PNG / WebP / HEIC)`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        errs.push(`${f.name}: הקובץ גדול מדי (מקסימום 10MB)`);
        continue;
      }
      ok.push(f);
    }
    return { ok, errs };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { ok, errs } = validateFiles(files);

    // Cap by remaining slots
    const capped = ok.slice(0, remaining);
    if (ok.length > capped.length) {
      errs.push(`ניתן להעלות עוד ${remaining} תמונות בלבד; חלק מהקבצים נחתכו`);
    }
    if (errs.length) setErrors(errs);

    if (capped.length === 0) return;

    setUploading(true);
    setStatusMsg(capped.length === 1 ? "מעלה תמונה…" : `מעלה ${capped.length} תמונות…`);

    let uploadedCount = 0;
    const newErrs: string[] = [...errs];

    for (const file of capped) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/inventory/${vehicle.id}/images`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body.error?.message ?? body.detail ?? `HTTP ${res.status}`;
          newErrs.push(`${file.name}: ${msg}`);
        } else {
          uploadedCount++;
        }
      } catch (e) {
        newErrs.push(`${file.name}: ${e instanceof Error ? e.message : "שגיאת רשת"}`);
      }
    }

    setErrors(newErrs);
    setStatusMsg(
      uploadedCount > 0
        ? uploadedCount === 1
          ? "תמונה הועלתה בהצלחה"
          : `${uploadedCount} תמונות הועלו בהצלחה`
        : "ההעלאה נכשלה",
    );
    setUploading(false);

    if (inputRef.current) inputRef.current.value = "";

    await load();
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !images) return;
    const target = pendingDelete;
    setDeletingId(target.id);

    // Compute focus target BEFORE list refreshes
    const idx = images.findIndex((i) => i.id === target.id);
    const fallbackId = images[idx + 1]?.id ?? images[idx - 1]?.id ?? null;

    try {
      await apiFetch(`/api/v1/inventory/${vehicle.id}/images/${target.id}`, {
        method: "DELETE",
        token,
      });
      setStatusMsg("התמונה נמחקה");
      setPendingDelete(null);
      await load();

      queueMicrotask(() => {
        if (fallbackId && deleteBtnRefs.current.get(fallbackId)) {
          deleteBtnRefs.current.get(fallbackId)?.focus();
        } else if (uploadBtnRef.current && !atMax) {
          uploadBtnRef.current.focus();
        } else {
          closeBtnRef.current?.focus();
        }
      });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "שגיאה במחיקה"]);
    } finally {
      setDeletingId(null);
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
          aria-describedby="img-dialog-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 motion-reduce:transition-none"
        >
          <div className="bg-brand-cream max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">
              תמונות – {vehicleLabel}
            </Dialog.Title>
            <Dialog.Description id="img-dialog-desc" className="text-brand-ink/70 mt-1 text-sm">
              ניתן להעלות עד {MAX_IMAGES} תמונות. מקסימום 10MB לתמונה. JPEG / PNG / WebP / HEIC.
            </Dialog.Description>

            {/* Counter — live region */}
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-brand-navy mt-4 text-sm font-semibold"
            >
              {count} מתוך {MAX_IMAGES} תמונות
            </p>

            {/* Upload trigger — real button, not label */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                ref={uploadBtnRef}
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={atMax || uploading}
                aria-busy={uploading || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "מעלה…" : "העלאת תמונות"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                multiple
                onChange={(e) => void handleFiles(e.target.files)}
                className="sr-only"
              />
              {uploading ? <progress aria-hidden="true" className="h-2 w-full sm:w-48" /> : null}
            </div>

            {/* Status — SR signal */}
            {statusMsg ? (
              <p role="status" aria-live="polite" className="sr-only">
                {statusMsg}
              </p>
            ) : null}

            {/* Errors */}
            {errors.length > 0 ? (
              <ul
                role="alert"
                aria-live="assertive"
                className="bg-danger-bg text-danger-text mt-4 space-y-1 rounded-md px-4 py-3 text-sm"
              >
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            ) : null}

            {/* Inline confirm-delete ribbon */}
            {pendingDelete ? (
              <div
                role="region"
                aria-label="אישור מחיקה"
                className="border-danger-text/30 mt-4 rounded-md border bg-white p-4"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={pendingDelete.url}
                    alt=""
                    className="h-20 w-28 shrink-0 rounded-md object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-brand-navy text-sm font-semibold">
                      למחוק את תמונה מספר {pendingDelete.position + 1}?
                    </p>
                    <p className="text-brand-ink/70 mt-1 text-xs">
                      {vehicleLabel} · המחיקה אינה הפיכה.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    disabled={deletingId !== null}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDelete()}
                    disabled={deletingId !== null}
                    aria-busy={deletingId !== null || undefined}
                    className="bg-danger hover:bg-danger-text focus-visible:outline-danger-text inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                  >
                    {deletingId ? "מוחק…" : "אישור מחיקה"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Thumbnails */}
            <div className="mt-6">
              {images === null ? (
                <p role="status" className="text-brand-ink/60">
                  טוען…
                </p>
              ) : images.length === 0 ? (
                <p className="border-brand-navy/20 text-brand-ink/60 rounded-md border border-dashed bg-white p-6 text-center">
                  אין עדיין תמונות. לחץ על &quot;העלאת תמונות&quot; כדי להעלות.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, i) => (
                    <li
                      key={img.id}
                      className="border-brand-navy/10 relative aspect-[4/3] overflow-hidden rounded-md border bg-white"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <button
                        ref={(el) => {
                          if (el) deleteBtnRefs.current.set(img.id, el);
                          else deleteBtnRefs.current.delete(img.id);
                        }}
                        type="button"
                        onClick={() => setPendingDelete(img)}
                        aria-label={`מחיקת תמונה ${i + 1} מתוך ${count} – ${vehicleLabel}`}
                        className="bg-brand-navy/80 hover:bg-brand-navy absolute end-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/40 text-white backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <span aria-hidden="true" className="text-lg leading-none">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Dialog.Close asChild>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  סגירה
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
