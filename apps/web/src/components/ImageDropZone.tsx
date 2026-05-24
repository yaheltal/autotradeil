"use client";

import { ImageIcon, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/**
 * ImageDropZone — editorial drag-and-drop surface for image picking.
 *
 *   ┌─ dashed border-hairline rectangle ─────────────────────┐
 *   │  [Upload icon]                                          │
 *   │  גרור תמונות לכאן או לחץ לבחירה                          │
 *   │  JPEG / PNG / WebP / HEIC · עד 10MB · נותרו N           │
 *   └────────────────────────────────────────────────────────┘
 *
 * On drag-over the border + background flip to accent tint for an
 * unmistakable affordance. Click anywhere in the zone (or press
 * Enter / Space on focus) opens the native file picker. The hidden
 * `<input type="file">` lives inside so iOS Safari + Android pickers
 * work without a separate trigger.
 *
 * Validation is OWNED BY THE CALLER — this component just hands
 * back the File[] selected/dropped. The caller applies MIME/size
 * caps because policy lives at the dialog level (different dialogs
 * cap differently).
 *
 * Used by:
 *   - VehicleImagesDialog (upload-on-pick to an existing vehicle)
 *   - InventoryFormDialog step 3, create mode (queue locally,
 *     upload after vehicle creation)
 */

type Props = {
  /** Called with the File[] when the user picks or drops files. */
  onPick: (files: File[]) => void;
  /** Locks the surface — used while an upload is mid-flight. */
  disabled?: boolean;
  /** Hint copy under the icon — pass remaining-slots / size limits. */
  hint?: React.ReactNode;
  /** MIME / extension filter (passed to the native file input). */
  accept?: string;
  /** Multiple selection. Defaults to true. */
  multiple?: boolean;
  /** ID for aria wiring. */
  id?: string;
  className?: string;
};

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

export function ImageDropZone({
  onPick,
  disabled = false,
  hint,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  id = "image-drop-zone",
  className,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) onPick(files);
    },
    [disabled, onPick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    },
    [trigger],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label="גרור תמונות לכאן או לחץ לבחירה"
      onClick={trigger}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "border-hairline bg-paper px-lg py-xl group flex w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed text-center",
        "duration-fast transition-colors motion-reduce:transition-none",
        "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        dragOver ? "border-accent bg-accent-subtle" : "hover:border-ink hover:bg-muted/5",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className ?? "",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onPick(files);
          // Reset so picking the same file again still fires onChange.
          e.target.value = "";
        }}
        className="sr-only"
      />
      <div
        aria-hidden="true"
        className={[
          "border-hairline bg-paper gap-xs flex h-12 w-12 items-center justify-center rounded-md border",
          "duration-fast transition-colors",
          dragOver ? "border-accent text-accent" : "text-muted group-hover:text-ink",
        ].join(" ")}
      >
        {dragOver ? <Upload className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
      </div>
      <p className="text-ink mt-md text-sm font-medium">
        {dragOver ? "שחרר כדי להעלות" : "גרור תמונות לכאן או לחץ לבחירה"}
      </p>
      {hint ? <p className="text-muted mt-xxs font-tabular text-xs">{hint}</p> : null}
    </div>
  );
}
