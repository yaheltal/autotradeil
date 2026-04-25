"use client";

import { useRef } from "react";

/*
 * TabsBar — extracted from /dashboard/offers (Phase 4.1).
 *
 * RTL arrow contract: under `dir="rtl"`, ArrowRight = previous,
 * ArrowLeft = next (visual next/previous). Home/End jump to first/last.
 * Roving tabindex: only the selected tab is in the tab order.
 */

export type Tab<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
};

export function TabsBar<T extends string>({ tabs, active, onChange, ariaLabel }: Props<T>) {
  const refs = useRef<Map<T, HTMLButtonElement>>(new Map());

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = idx;
    if (e.key === "ArrowLeft") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowRight") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const t = tabs[next];
    if (!t) return;
    onChange(t.id);
    queueMicrotask(() => refs.current.get(t.id)?.focus());
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      dir="rtl"
      className="border-brand-navy/10 flex flex-wrap gap-1 border-b"
    >
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
              else refs.current.delete(t.id);
            }}
            role="tab"
            aria-selected={selected}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={onKeyDown}
            className={[
              "inline-flex min-h-11 items-center px-4 py-2 text-sm",
              "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "text-brand-navy border-brand-navy bg-brand-navy/5 border-b-2 font-bold"
                : "text-brand-ink/60 hover:text-brand-navy font-semibold",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
