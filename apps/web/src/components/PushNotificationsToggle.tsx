"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

/*
 * PushNotificationsToggle — opt-in for native browser push notifications.
 *
 * Flow:
 *   1. Mount → fetch /api/v1/notifications/push/vapid-key. Empty key
 *      means push is unconfigured server-side; render disabled tile
 *      with explanation.
 *   2. Read existing PushManager subscription state to set the
 *      initial toggle.
 *   3. On enable: request Notification.permission → register the
 *      service worker → call pushManager.subscribe with the VAPID
 *      key → POST the subscription JSON to the backend.
 *   4. On disable: unsubscribe + DELETE the row server-side so the
 *      backend stops sending.
 *
 * A11y:
 *   - Wrapped in a fieldset for labelled grouping.
 *   - Toggle is a real <button role="switch" aria-checked> with a
 *     visible state pill, not a CSS-toggle that hides input semantics.
 *   - Status messages announced via role="status" aria-live=polite.
 *   - Permission-denied + unsupported states each render an explicit
 *     instruction (cannot be fixed in-app — user must reset
 *     site permissions in browser settings).
 */

type State =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "no-vapid" }
  | { kind: "denied" }
  | { kind: "ready"; subscribed: boolean };

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Allocate a fresh ArrayBuffer (not SharedArrayBuffer) so the
  // resulting Uint8Array satisfies BufferSource — the strict TS dom
  // lib variant of pushManager.subscribe rejects Uint8Array<ArrayBufferLike>.
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export function PushNotificationsToggle({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [vapidKey, setVapidKey] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState({ kind: "unsupported" });
        return;
      }

      try {
        const { key } = await apiFetch<{ key: string }>("/api/v1/notifications/push/vapid-key", {
          token,
        });
        if (cancelled) return;
        if (!key) {
          setState({ kind: "no-vapid" });
          return;
        }
        setVapidKey(key);

        if (Notification.permission === "denied") {
          setState({ kind: "denied" });
          return;
        }

        const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setState({ kind: "ready", subscribed: !!sub });
      } catch {
        if (!cancelled) setState({ kind: "ready", subscribed: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const enable = async () => {
    setBusy(true);
    setStatusMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ kind: "denied" });
        return;
      }
      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await apiFetch("/api/v1/notifications/push/subscribe", {
        method: "POST",
        token,
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      setState({ kind: "ready", subscribed: true });
      setStatusMsg("התראות הופעלו — תקבל הודעה גם כשהדפדפן סגור");
    } catch (e) {
      setStatusMsg(
        e instanceof Error ? `שגיאה בהפעלת התראות: ${e.message}` : "שגיאה בהפעלת התראות",
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setStatusMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiFetch("/api/v1/notifications/push/unsubscribe", {
          method: "POST",
          token,
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setState({ kind: "ready", subscribed: false });
      setStatusMsg("התראות בוטלו");
    } catch (e) {
      setStatusMsg(
        e instanceof Error ? `שגיאה בביטול התראות: ${e.message}` : "שגיאה בביטול התראות",
      );
    } finally {
      setBusy(false);
    }
  };

  // ---------- render branches ----------

  if (state.kind === "loading") {
    return (
      <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
        <p role="status" className="text-brand-ink/60 text-sm">
          טוען…
        </p>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    return (
      <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
        <h3 className="text-brand-navy text-sm font-semibold">התראות דחיפה</h3>
        <p className="text-brand-ink/70 mt-2 text-sm">
          הדפדפן שלך לא תומך בהתראות דחיפה. ב-iPhone ניתן להפעיל לאחר התקנת האתר למסך הבית.
        </p>
      </div>
    );
  }

  if (state.kind === "no-vapid") {
    return (
      <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
        <h3 className="text-brand-navy text-sm font-semibold">התראות דחיפה</h3>
        <p className="text-brand-ink/70 mt-2 text-sm">השירות עדיין לא מוגדר במערכת.</p>
      </div>
    );
  }

  if (state.kind === "denied") {
    return (
      <div className="border-brand-navy/10 rounded-lg border bg-white p-5">
        <h3 className="text-brand-navy text-sm font-semibold">התראות דחיפה</h3>
        <p className="text-brand-ink/70 mt-2 text-sm">
          חסמת התראות מהאתר. כדי להפעיל — פתח את הגדרות האתר בדפדפן ואפשר התראות.
        </p>
      </div>
    );
  }

  const subscribed = state.subscribed;

  return (
    <fieldset className="border-brand-navy/10 rounded-lg border bg-white p-5">
      <legend className="px-1">
        <span className="text-brand-navy text-sm font-semibold">התראות דחיפה</span>
      </legend>
      <p className="text-brand-ink/70 mt-1 text-sm">
        קבל התראות מיידיות על הצעות חדשות, אישור עסקאות ומסרים מהמערכת — גם כשהדפדפן סגור.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-brand-ink text-sm font-medium">{subscribed ? "מופעל" : "כבוי"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={subscribed}
          aria-busy={busy || undefined}
          onClick={() => (subscribed ? void disable() : void enable())}
          disabled={busy}
          className={[
            "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors",
            "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
            subscribed ? "bg-ok" : "bg-brand-navy/20",
            busy ? "cursor-wait opacity-70" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              subscribed ? "translate-x-1" : "translate-x-8",
            ].join(" ")}
          />
        </button>
      </div>

      {statusMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="text-brand-ink/70 mt-3 text-xs"
          key={statusMsg}
        >
          {statusMsg}
        </p>
      ) : null}
    </fieldset>
  );
}
