"use client";

import { Eye, EyeOff, GripVertical, Loader2, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageDropZone } from "@/components/ImageDropZone";
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
import { apiFetch } from "@/lib/api";

/*
 * VehicleImagesDialog — editorial image gallery manager.
 *
 *   תמונות — {make} {model} {year}                          ×
 *   {N} מתוך 10 תמונות · JPEG/PNG/WebP/HEIC · עד 10MB
 *   ─────
 *   ┌─ ImageDropZone (dashed; "גרור תמונות לכאן או לחץ לבחירה") ─┐
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   ┌── grid of thumbnails ────────────────────────────────────┐
 *   │ each tile: img + ⋮⋮ drag handle + Hide + Trash overlay  │
 *   │ reorder by drag (HTML5 native) OR keyboard ←/→ on focus │
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   [סגירה]
 *
 * Reorder is UI-local optimistic — the PATCH endpoint is a TODO:
 *   PATCH /api/v1/inventory/{id}/images/reorder
 *   { order: [imageId, imageId, …] }
 * When backend ships, the persistReorder call already wires through.
 * Until then 404 is swallowed and the local order resets on next
 * load. Drag/keyboard interactions still feel instant.
 *
 * A11y:
 *   - shadcn Dialog: focus trap, return focus, Escape, scroll lock
 *   - Counter is a live region
 *   - Per-tile delete + hide buttons announce position + total + label
 *   - Errors render as a single shadcn Alert
 *   - Delete confirmation → shadcn AlertDialog (was inline ribbon)
 *   - Reorder keyboard: ArrowLeft / ArrowRight on focused tile moves
 *     it one position left/right (RTL-aware via document order)
 */

const MAX_IMAGES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic)$/i;

type ImageRecord = { id: string; url: string; position: number; hidden?: boolean };

type Vehicle = { id: string; make: string; model: string; year: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  token: string;
};

export function VehicleImagesDialog({ open, onOpenChange, vehicle, token }: Props) {
  const [images, setImages] = useState<ImageRecord[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ImageRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const tileRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const vehicleLabel = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<ImageRecord[]>(`/api/v1/inventory/${vehicle.id}/images`, {
        token,
      });
      setImages(list);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "שגיאה בטעינת התמונות"]);
      setImages([]);
    }
  }, [vehicle.id, token]);

  // TODO: backend endpoint not yet shipped. When it lands the body
  // shape below should match. Until then we swallow 404 and keep the
  // local order — next `load()` will reset to whatever the server has.
  const persistReorder = useCallback(
    async (orderedIds: string[]) => {
      try {
        await apiFetch(`/api/v1/inventory/${vehicle.id}/images/reorder`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ order: orderedIds }),
        });
      } catch {
        // Silent — UI already updated optimistically. When the
        // endpoint ships, surface real errors through setErrors.
      }
    },
    [vehicle.id, token],
  );

  const toggleHidden = useCallback(
    async (img: ImageRecord) => {
      setTogglingId(img.id);
      try {
        const next = !img.hidden;
        await apiFetch(`/api/v1/inventory/${vehicle.id}/images/${img.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ hidden: next }),
        });
        setImages((prev) =>
          prev ? prev.map((it) => (it.id === img.id ? { ...it, hidden: next } : it)) : prev,
        );
        setStatusMsg(next ? "התמונה הוסתרה" : "התמונה הוצגה");
      } catch (e) {
        setErrors((prev) => [
          ...prev,
          e instanceof Error ? e.message : "שגיאה בעדכון נראות התמונה",
        ]);
      } finally {
        setTogglingId(null);
      }
    },
    [vehicle.id, token],
  );

  useEffect(() => {
    if (open) {
      setErrors([]);
      setStatusMsg("");
      setPendingDelete(null);
      setDragId(null);
      void load();
    }
  }, [open, load]);

  const count = images?.length ?? 0;
  const remaining = MAX_IMAGES - count;
  const atMax = remaining <= 0;

  const validateFiles = (files: File[]): { ok: File[]; errs: string[] } => {
    const ok: File[] = [];
    const errs: string[] = [];
    for (const f of files) {
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

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    const { ok, errs } = validateFiles(files);

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
    await load();
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !images) return;
    const target = pendingDelete;
    setDeletingId(target.id);

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
        if (fallbackId && tileRefs.current.get(fallbackId)) {
          tileRefs.current.get(fallbackId)?.focus();
        }
      });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "שגיאה במחיקה"]);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Reorder ────────────────────────────────────────────────────────
  const moveTo = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId || !images) return;
      const fromIdx = images.findIndex((i) => i.id === sourceId);
      const toIdx = images.findIndex((i) => i.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...images];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return;
      next.splice(toIdx, 0, moved);
      setImages(next);
      void persistReorder(next.map((i) => i.id));
    },
    [images, persistReorder],
  );

  const moveByDelta = useCallback(
    (id: string, delta: number) => {
      if (!images) return;
      const idx = images.findIndex((i) => i.id === id);
      const targetIdx = idx + delta;
      if (idx < 0 || targetIdx < 0 || targetIdx >= images.length) return;
      const next = [...images];
      const [moved] = next.splice(idx, 1);
      if (!moved) return;
      next.splice(targetIdx, 0, moved);
      setImages(next);
      void persistReorder(next.map((i) => i.id));
      queueMicrotask(() => tileRefs.current.get(id)?.focus());
    },
    [images, persistReorder],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby="img-dialog-desc"
          className="max-h-[90dvh] max-w-2xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>תמונות — {vehicleLabel}</DialogTitle>
            <DialogDescription id="img-dialog-desc">
              ניתן להעלות עד <span className="font-tabular">{MAX_IMAGES}</span> תמונות. עד{" "}
              <span className="font-tabular">10MB</span> לתמונה. JPEG / PNG / WebP / HEIC.
            </DialogDescription>
          </DialogHeader>

          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-muted mt-sm text-sm"
          >
            <span className="font-tabular text-ink font-medium">{count}</span> מתוך{" "}
            <span className="font-tabular">{MAX_IMAGES}</span> תמונות
          </p>

          {/* Drop zone — replaces the old "Upload Images" button */}
          {!atMax ? (
            <div className="mt-md">
              <ImageDropZone
                onPick={handleFiles}
                disabled={uploading}
                hint={
                  <>
                    נותרו <span className="text-ink font-medium">{remaining}</span> תמונות
                  </>
                }
              />
              {uploading ? (
                <p className="gap-xs text-muted mt-xs flex items-center text-xs">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  <span>מעלה תמונות…</span>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted mt-md text-sm">
              הגעת לגבול של <span className="font-tabular">{MAX_IMAGES}</span> תמונות. מחק תמונה
              קיימת כדי להעלות חדשה.
            </p>
          )}

          {statusMsg ? (
            <p role="status" aria-live="polite" className="sr-only">
              {statusMsg}
            </p>
          ) : null}

          {errors.length > 0 ? (
            <Alert variant="destructive" className="mt-md">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                <ul className="space-y-1">
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-lg">
            {images === null ? (
              <p role="status" className="text-muted py-lg text-center text-sm">
                טוען…
              </p>
            ) : images.length === 0 ? (
              <p className="text-muted py-2xl text-center text-sm">
                אין עדיין תמונות. גרור או בחר תמונות מעל כדי להתחיל.
              </p>
            ) : (
              <ul className="gap-md grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, i) => (
                  <ImageTile
                    key={img.id}
                    img={img}
                    index={i}
                    total={count}
                    vehicleLabel={vehicleLabel}
                    isToggling={togglingId === img.id}
                    isDragging={dragId === img.id}
                    onToggleHidden={() => void toggleHidden(img)}
                    onDelete={() => setPendingDelete(img)}
                    onMoveLeft={() => moveByDelta(img.id, -1)}
                    onMoveRight={() => moveByDelta(img.id, +1)}
                    onDragStart={() => setDragId(img.id)}
                    onDragEnd={() => setDragId(null)}
                    onDrop={(srcId) => {
                      moveTo(srcId, img.id);
                      setDragId(null);
                    }}
                    refMap={tileRefs}
                  />
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              סגירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — shadcn Dialog (alert-dialog primitive not
       *  installed; the same Radix Dialog primitive carries the
       *  semantics. Cancel is the first focusable so destructive
       *  actions never auto-focus). */}
      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent
          aria-describedby="img-delete-desc"
          className="max-w-md"
          onOpenAutoFocus={(e) => {
            // Don't auto-focus inside; let the close button take focus
            // (Radix default) so destructive confirm needs an explicit tab.
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              למחוק את תמונה מספר{" "}
              <span className="font-tabular">
                {pendingDelete ? pendingDelete.position + 1 : ""}
              </span>
              ?
            </DialogTitle>
            <DialogDescription id="img-delete-desc">
              {vehicleLabel} — המחיקה אינה הפיכה.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete ? (
            <div className="border-hairline bg-paper p-sm gap-md flex items-center rounded-md border">
              <div className="border-hairline relative h-16 w-24 shrink-0 overflow-hidden rounded-md border">
                <Image src={pendingDelete.url} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <p className="text-muted text-xs">תמונה זו תוסר מתצוגת הרכב בשוק.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId !== null}
            >
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deletingId !== null}
              aria-busy={deletingId !== null || undefined}
            >
              {deletingId !== null ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  <span>מוחק…</span>
                </>
              ) : (
                "אישור מחיקה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// ImageTile — single draggable thumbnail with hover overlay actions.
// ============================================================================

function ImageTile({
  img,
  index,
  total,
  vehicleLabel,
  isToggling,
  isDragging,
  onToggleHidden,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onDragStart,
  onDragEnd,
  onDrop,
  refMap,
}: {
  img: ImageRecord;
  index: number;
  total: number;
  vehicleLabel: string;
  isToggling: boolean;
  isDragging: boolean;
  onToggleHidden: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (srcId: string) => void;
  refMap: React.MutableRefObject<Map<string, HTMLLIElement>>;
}) {
  const labelN = index + 1;

  // Keyboard reorder — ArrowLeft moves toward index 0, ArrowRight away.
  // The dialog is `dir="rtl"` but the document order is unchanged, so
  // "Left" and "Right" map to "earlier" and "later" in the list logically.
  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onMoveLeft();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onMoveRight();
    }
  };

  return (
    <li
      ref={(el) => {
        if (el) refMap.current.set(img.id, el);
        else refMap.current.delete(img.id);
      }}
      draggable
      tabIndex={0}
      aria-label={`תמונה ${labelN} מתוך ${total} — ${vehicleLabel}. גרור או חצים כדי לסדר.`}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", img.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const srcId = e.dataTransfer.getData("text/plain");
        if (srcId) onDrop(srcId);
      }}
      onKeyDown={onKeyDown}
      className={[
        "border-hairline group relative aspect-[4/3] cursor-grab overflow-hidden rounded-md border",
        "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "duration-fast transition-opacity",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <Image
        src={img.url}
        alt=""
        fill
        sizes="(max-width: 768px) 50vw, 25vw"
        className={["object-cover transition-opacity", img.hidden ? "opacity-40" : ""].join(" ")}
      />

      {/* Drag handle — visible on hover + focus */}
      <span
        aria-hidden="true"
        className={[
          "text-paper bg-ink/70 absolute end-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md backdrop-blur",
          "duration-fast opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
        ].join(" ")}
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {/* Hidden badge */}
      {img.hidden ? (
        <span className="bg-ink text-paper px-xs py-xxs absolute start-2 top-2 rounded-md text-[11px] font-medium">
          מוסתר
        </span>
      ) : null}

      {/* Position badge */}
      <span
        aria-hidden="true"
        className="bg-paper/85 text-ink font-tabular absolute bottom-2 start-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-xs font-medium backdrop-blur"
      >
        {labelN}
      </span>

      {/* Hover/focus action row */}
      <div
        className={[
          "absolute inset-x-2 bottom-2 flex justify-end gap-1.5",
          "duration-fast opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
          aria-pressed={!!img.hidden}
          aria-label={
            img.hidden
              ? `הצג תמונה ${labelN} מתוך ${total} — ${vehicleLabel}`
              : `הסתר תמונה ${labelN} מתוך ${total} — ${vehicleLabel}`
          }
          disabled={isToggling}
          className="border-hairline bg-paper/95 text-ink hover:bg-paper focus-visible:outline-accent duration-fast inline-flex h-8 w-8 items-center justify-center rounded-md border backdrop-blur transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          {img.hidden ? (
            <Eye aria-hidden="true" className="h-4 w-4" />
          ) : (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`מחיקת תמונה ${labelN} מתוך ${total} — ${vehicleLabel}`}
          className="border-hairline bg-paper/95 text-danger-fg hover:bg-danger-bg focus-visible:outline-accent duration-fast inline-flex h-8 w-8 items-center justify-center rounded-md border backdrop-blur transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
