"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

/*
 * Dealer notification bell for the dashboard header.
 *
 * A11y decisions (pre-write approved):
 *   - Headless UI `Menu` carries the ARIA menu pattern (role=menu,
 *     arrow/Esc handling, focus mgmt) — equivalent to Radix DropdownMenu.
 *   - Trigger button's `aria-label` includes the unread count so SR
 *     users hear "התראות, 3 חדשות" without relying on the visual dot.
 *   - Unread badge pulse uses `motion-reduce:animate-none` to honor
 *     prefers-reduced-motion.
 *   - A dedicated `role="status" aria-live="polite"` region announces
 *     new notifications ONLY when unread count increases AND the page
 *     is visible (document.visibilityState === "visible"). Prevents
 *     stale announcements on tab re-focus or background polls.
 *   - A `<time datetime="…">` wraps each notification's time-ago so
 *     SRs/assistive UIs have the ISO timestamp available.
 *   - Each notification item is a `<Link>` so keyboard Enter activation
 *     navigates naturally; click-through also marks read via the API.
 */

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { offer_id?: string; inventory_id?: string; [k: string]: unknown } | null;
  read_at: string | null;
  created_at: string;
};

type ListResponse = {
  items: Notification[];
  unread_count: number;
};

type Props = {
  token: string;
};

const POLL_MS = 30_000;
const LIMIT = 10;

function hrefForNotification(n: Notification): string {
  const t = n.type;
  if (t.startsWith("offer.")) return "/dashboard/offers";
  return "/dashboard";
}

export function NotificationBell({ token }: Props) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<string>("");
  const lastUnreadRef = useRef<number>(0);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const fetchNow = async () => {
      try {
        const res = await apiFetch<ListResponse>(`/api/v1/notifications?limit=${LIMIT}`, { token });
        if (cancelled) return;
        setData(res);

        // Announce ONLY on increase AND when the page is visible — avoids
        // shouting on tab-focus re-fetches.
        if (
          res.unread_count > lastUnreadRef.current &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          const delta = res.unread_count - lastUnreadRef.current;
          const noun = delta === 1 ? "התראה חדשה" : `${delta} התראות חדשות`;
          setStatus(noun);
        }
        lastUnreadRef.current = res.unread_count;
      } catch {
        // Silently ignore — the bell is non-critical
      }
    };

    void fetchNow();
    const t = setInterval(() => void fetchNow(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token]);

  // Clear the status message a few seconds after announcement so the
  // live region doesn't hold stale text.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        token,
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread_count: Math.max(0, prev.unread_count - 1),
              items: prev.items.map((n) =>
                n.id === id && n.read_at == null ? { ...n, read_at: new Date().toISOString() } : n,
              ),
            }
          : prev,
      );
      // Sync the ref so we don't re-announce on the next poll
      lastUnreadRef.current = Math.max(0, lastUnreadRef.current - 1);
    } catch {
      /* best-effort */
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch(`/api/v1/notifications/read-all`, {
        method: "POST",
        token,
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread_count: 0,
              items: prev.items.map((n) =>
                n.read_at == null ? { ...n, read_at: new Date().toISOString() } : n,
              ),
            }
          : prev,
      );
      lastUnreadRef.current = 0;
    } catch {
      /* best-effort */
    }
  };

  const buttonLabel = unread > 0 ? `התראות, ${unread} חדשות` : "התראות";

  return (
    <div className="relative">
      {/* Live region — announcement-only, NOT in aria-describedby anywhere */}
      {status ? (
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" key={status}>
          {status}
        </p>
      ) : null}

      <Menu>
        <MenuButton
          aria-label={buttonLabel}
          className="text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="bg-brand-gold text-brand-navy absolute -end-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold motion-safe:animate-pulse motion-reduce:animate-none"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </MenuButton>

        <MenuItems
          anchor="bottom end"
          className="border-brand-navy/15 origin-top-end z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-md border bg-white py-1 text-sm shadow-lg focus:outline-none"
        >
          <div className="border-brand-navy/10 flex items-center justify-between border-b px-3 py-2">
            <span className="text-brand-navy font-semibold">התראות</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-brand-navy hover:text-brand-navy/80 focus-visible:outline-brand-navy rounded text-xs font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                סמן הכל כנקרא
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="text-brand-ink/60 px-3 py-4 text-center">אין התראות</p>
          ) : (
            <ul className="max-h-96 overflow-auto">
              {items.map((n) => {
                const rel = formatRelativeTime(n.created_at);
                const href = hrefForNotification(n);
                const isUnread = n.read_at == null;
                return (
                  <li key={n.id}>
                    <MenuItem>
                      {({ focus }) => (
                        <Link
                          href={href}
                          onClick={() => void markRead(n.id)}
                          className={[
                            "block px-3 py-2",
                            focus ? "bg-brand-navy/5" : "",
                            isUnread ? "bg-brand-gold/10" : "",
                          ].join(" ")}
                        >
                          <div className="text-brand-navy flex items-start justify-between gap-2 text-sm font-semibold">
                            <span>{n.title}</span>
                            {isUnread ? (
                              <span
                                aria-hidden="true"
                                className="bg-brand-gold mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                              />
                            ) : null}
                          </div>
                          <p className="text-brand-ink/80 mt-0.5 text-xs">{n.body}</p>
                          <time
                            dateTime={rel.iso}
                            className="text-brand-ink/50 mt-1 block text-[11px]"
                          >
                            {rel.visual}
                          </time>
                        </Link>
                      )}
                    </MenuItem>
                  </li>
                );
              })}
            </ul>
          )}
        </MenuItems>
      </Menu>
    </div>
  );
}
