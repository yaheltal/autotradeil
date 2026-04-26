"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SmartCameraCapture — Phase 6.6.
 *
 * Reusable single-document capture with three modes:
 *   1. Camera (live video + Sobel edge-detection overlay; shutter
 *      enables when a card-aspect-ratio quad is aligned)
 *   2. Gallery (file picker, no `capture` attr → OS gallery on mobile)
 *   3. Files (file picker, accepts PDF too)
 *
 * A11y notes (per accessibility-lead bundle review):
 *   - Hardened modal pattern: dir=rtl, w-screen h-[100dvh], dvh sizing
 *   - DialogTitle = `label` prop → aria-labelledby
 *   - <video> has role="img" + aria-label (it's a viewfinder, not media)
 *   - Shutter uses native `disabled`, NOT aria-disabled
 *   - Pre-mounted role=status live region; alignment state debounced
 *   - On mode switch to camera, focus moves to the BACK button, not
 *     the disabled shutter
 *   - Stream cleanup on back / close / unmount (privacy)
 *   - Permission-denied: role=alert + actionable button to switch modes
 *   - Edge detection unsupported → camera works, shutter always enabled
 */

type Mode = "menu" | "camera";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Document label e.g. "ת"ז קדמי" — rendered as DialogTitle. */
  label: string;
  onCapture: (blob: Blob) => void;
};

const CARD_RATIO = 1.586; // CR80 (ID-1) standard card aspect ratio

export function SmartCameraCapture({ open, onOpenChange, label, onCapture }: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [aligned, setAligned] = useState(false);
  const [alignAnnounce, setAlignAnnounce] = useState<string>("");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const announceTimerRef = useRef<number | null>(null);
  const lastAnnouncedRef = useRef<boolean | null>(null);
  const cameraBtnRef = useRef<HTMLButtonElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  // --- Stream cleanup (called from many places) ---------------------
  const stopStream = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setAligned(false);
    lastAnnouncedRef.current = null;
  }, []);

  // --- Reset on open/close + cleanup on unmount ---------------------
  useEffect(() => {
    if (open) {
      setMode("menu");
      setPermissionError(null);
      setAlignAnnounce("");
      queueMicrotask(() => cameraBtnRef.current?.focus());
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [open, stopStream]);

  // --- Start camera + edge-detection loop ---------------------------
  const startCamera = useCallback(async () => {
    setMode("camera");
    setPermissionError(null);
    queueMicrotask(() => backBtnRef.current?.focus());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      runEdgeLoop();
    } catch (err) {
      stopStream();
      setPermissionError(
        err instanceof Error ? `לא ניתן לפתוח מצלמה: ${err.message}` : "לא ניתן לפתוח מצלמה",
      );
    }
  }, [stopStream]);

  // --- Edge detection (lightweight Sobel) ---------------------------
  const runEdgeLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let lastTick = 0;
    const TICK_MS = 100; // 10 fps is plenty for alignment feedback

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastTick < TICK_MS) return;
      lastTick = now;
      if (video.videoWidth === 0) return;

      // Downsample for speed.
      const w = 240;
      const h = Math.round(w / (video.videoWidth / video.videoHeight));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      let img: ImageData;
      try {
        img = ctx.getImageData(0, 0, w, h);
      } catch {
        // Cross-origin or insecure — give up on edge detection silently.
        return;
      }

      // Quick "is there a strong horizontal+vertical edge in roughly the
      // right region" heuristic. Full quad detection would need OpenCV;
      // this is a lightweight proxy that catches "card placed in roughly
      // the target rect" without 10MB of WASM.
      const aligned = scoreCardPresence(img, w, h);

      if (aligned !== lastAnnouncedRef.current) {
        // Debounce announcements at 500ms.
        if (announceTimerRef.current) {
          window.clearTimeout(announceTimerRef.current);
        }
        announceTimerRef.current = window.setTimeout(() => {
          lastAnnouncedRef.current = aligned;
          setAligned(aligned);
          setAlignAnnounce(
            aligned ? "כרטיס מיושר — לחץ לצילום" : "מסגרת לא זוהתה — מקם את הכרטיס במסגרת",
          );
        }, 500);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // --- Capture current frame ----------------------------------------
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    c.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
          stopStream();
          onOpenChange(false);
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, onOpenChange, stopStream]);

  // --- File picker handler (gallery + files) ------------------------
  const onFilePicked = (file: File | null | undefined) => {
    if (!file) return;
    onCapture(file);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <Dialog.Title className="text-brand-navy text-lg font-bold">{label}</Dialog.Title>

            {/* Pre-mounted live region (per a11y-lead) */}
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
              key={alignAnnounce}
            >
              {alignAnnounce}
            </p>

            {/* Hidden file inputs */}
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onFilePicked(e.target.files?.[0])}
            />
            <input
              ref={filesRef}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => onFilePicked(e.target.files?.[0])}
            />

            {permissionError ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-3 text-sm"
              >
                <p className="font-semibold">{permissionError}</p>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="text-danger-text mt-2 inline-block text-sm font-semibold underline decoration-2 underline-offset-4"
                >
                  בחר מהגלריה במקום
                </button>
              </div>
            ) : null}

            {mode === "menu" ? (
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  ref={cameraBtnRef}
                  type="button"
                  onClick={() => void startCamera()}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">📷</span>
                  צילום במצלמה (זיהוי חכם של מסגרת)
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">🖼️</span>
                  בחירה מהגלריה
                </button>
                <button
                  type="button"
                  onClick={() => filesRef.current?.click()}
                  className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">📄</span>
                  בחירה מהמסמכים (כולל PDF)
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy mt-2 inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black">
                  <video
                    ref={videoRef}
                    role="img"
                    aria-label="תצוגת מצלמה חיה"
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {/* Card-shaped target overlay */}
                  <div
                    className={[
                      "absolute inset-0 flex items-center justify-center transition-colors",
                      aligned ? "outline-emerald-500" : "outline-amber-500",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    <div
                      className={[
                        "rounded-lg border-4",
                        aligned ? "border-emerald-500" : "border-amber-500",
                      ].join(" ")}
                      style={{
                        width: "85%",
                        aspectRatio: `${CARD_RATIO}`,
                      }}
                    />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                {/* Alignment hint — VISUAL GUIDANCE ONLY. Previously
                    this blocked the shutter, but the Sobel heuristic
                    is too noisy in real environments (textured walls,
                    glare, dim light) and users got stuck unable to
                    capture. Modern KYC UX (Stripe Identity, Onfido)
                    keeps the shutter always available — the overlay
                    just guides. */}
                <p
                  className={[
                    "rounded-md px-3 py-2 text-center text-sm font-semibold",
                    aligned ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900",
                  ].join(" ")}
                >
                  {aligned ? "✓ הכרטיס מיושר — אפשר לצלם" : "מקם את הכרטיס במסגרת ולחץ צלם"}
                </p>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <button
                    ref={backBtnRef}
                    type="button"
                    onClick={() => {
                      stopStream();
                      setMode("menu");
                      setPermissionError(null);
                      setAlignAnnounce("");
                      queueMicrotask(() => cameraBtnRef.current?.focus());
                    }}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ← חזרה
                  </button>
                  <button
                    type="button"
                    onClick={capture}
                    className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    📸 צלם
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// =============================================================================
// scoreCardPresence — heuristic edge detector for card-in-frame.
//
// Computes the avg gradient magnitude inside vs outside a centered target
// rectangle (CR80 aspect, ~85% of the frame). When the card is in place,
// the inside has structure (text/photo/edges) while the outside is mostly
// uniform. Returns true when inside-gradient meaningfully exceeds outside.
//
// This is intentionally NOT a full quad detector — that would require
// OpenCV.js (~10MB) and add significant bundle weight. The heuristic
// catches the common case: card placed roughly inside the visible target.
// =============================================================================

function scoreCardPresence(img: ImageData, w: number, h: number): boolean {
  const data = img.data;
  const targetW = Math.round(w * 0.85);
  const targetH = Math.round(targetW / CARD_RATIO);
  const x0 = Math.round((w - targetW) / 2);
  const y0 = Math.round((h - targetH) / 2);

  let insideSum = 0;
  let insideCount = 0;
  let outsideSum = 0;
  let outsideCount = 0;

  // Sobel x kernel only — fast and good enough for "is there structure".
  const luma = (i: number) =>
    0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);

  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = (y * w + x) * 4;
      const left = luma(i - 4);
      const right = luma(i + 4);
      const gx = Math.abs(right - left);
      const inside = x >= x0 && x < x0 + targetW && y >= y0 && y < y0 + targetH;
      if (inside) {
        insideSum += gx;
        insideCount++;
      } else {
        outsideSum += gx;
        outsideCount++;
      }
    }
  }
  if (insideCount === 0 || outsideCount === 0) return false;

  const insideAvg = insideSum / insideCount;
  const outsideAvg = outsideSum / outsideCount;
  // The card is "present" when inside has meaningfully more structure
  // than the surroundings AND the absolute inside structure is not zero
  // (avoids false positives on a black frame).
  return insideAvg > 18 && insideAvg > outsideAvg * 1.6;
}
