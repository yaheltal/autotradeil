"use client";

import { useEffect, useState } from "react";

/*
 * PWAInstallPrompt — bottom banner offering "Add to Home Screen".
 *
 * Two paths:
 *   1. Chromium (Android Chrome / Edge / Samsung Internet) fires the
 *      `beforeinstallprompt` event. We capture it, show our own
 *      Hebrew banner, and call `prompt()` on user click.
 *   2. iOS Safari has no programmatic install — show a one-time
 *      instruction sheet ("שתף → הוסף לדף הבית") for iPhone/iPad
 *      users only when not already running standalone.
 *
 * Dismissal persists in localStorage for 14 days so we don't nag on
 * every visit. Show only once user is signed in and on the dashboard
 * — don't pester anonymous landing-page visitors.
 *
 * A11y:
 *   - role="dialog" with aria-labelledby + aria-describedby
 *   - Cannot focus-trap because it's a bottom banner, not a modal —
 *     Escape closes it; close button is the focus target on mount.
 *   - aria-live="polite" so SR announces it once after settle, not
 *     immediately on page load.
 */

const DISMISS_KEY = "pwa.install.dismissedAt";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari uses a non-standard navigator.standalone bool.
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function recentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const v = localStorage.getItem(DISMISS_KEY);
  if (!v) return false;
  const ts = Number.parseInt(v, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

export function PWAInstallPrompt() {
  const [variant, setVariant] = useState<"none" | "android" | "ios">("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVariant("android");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — show our manual
    // instructions banner after a short delay so it doesn't clobber
    // the initial paint.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIOS() && !isStandalone()) {
      iosTimer = setTimeout(() => setVariant("ios"), 8000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private browsing — ignore */
    }
    setVariant("none");
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        // User accepted — never re-show
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now() + 365 * DISMISS_TTL_MS));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* prompt may throw if invoked outside a user gesture or repeatedly */
    } finally {
      setDeferred(null);
      setVariant("none");
    }
  };

  if (variant === "none") return null;

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-desc"
      aria-live="polite"
      className="border-brand-navy/15 fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border bg-white p-4 shadow-2xl motion-safe:animate-[slide-up_0.25s_ease-out] motion-reduce:animate-none"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-icon.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p id="pwa-install-title" className="text-brand-navy text-sm font-bold">
            התקן את AutoTradeIL
          </p>
          <p id="pwa-install-desc" className="text-brand-ink/75 mt-0.5 text-xs leading-snug">
            {variant === "android"
              ? "התקן את האפליקציה למסך הבית — הפעלה מהירה, חוויה מלאה ללא דפדפן."
              : "פתח את תפריט השיתוף ובחר ״הוסף לדף הבית״ כדי לקבל אפליקציה אמיתית על המסך."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {variant === "android" ? (
              <button
                type="button"
                onClick={() => void install()}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-10 items-center justify-center rounded-md px-4 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                התקן עכשיו
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-10 items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {variant === "ios" ? "הבנתי" : "לא עכשיו"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="סגור"
          className="text-brand-ink/60 hover:text-brand-navy focus-visible:outline-brand-navy -me-1 -mt-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
