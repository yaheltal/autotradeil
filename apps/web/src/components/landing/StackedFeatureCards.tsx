"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";

/*
 * StackedFeatureCards — Apple Wallet / Tinder-style card stack.
 *
 * 6 feature cards live physically on top of each other. The top
 * card is the "active" one, with the next two peeking out from
 * behind (smaller scale + slight Y offset). Swiping the top card
 * left/right (or clicking the prev/next buttons) animates it off
 * the stack and the next card rises into focus.
 *
 * Pure React + Tailwind transforms — no Framer Motion / no extra
 * deps. Each render computes per-card transforms based on its
 * distance from the active index, which keeps animations cheap and
 * the bundle untouched.
 *
 * A11y:
 *   - Container is role="region" with aria-label so the whole
 *     widget is announced as one unit.
 *   - Active card is the only one in the tab order; the rest are
 *     aria-hidden and tabIndex={-1} (can't be focused, SR skips).
 *   - aria-live="polite" announces the position when the user
 *     advances ("יתרון 3 מתוך 6").
 *   - Prev/Next buttons have aria-controls + aria-label.
 *   - Honors prefers-reduced-motion via the global motion-reduce
 *     CSS layer (transitions get clamped to ~0).
 */

// Icon registry lives in client space so we can pass plain string
// keys (`iconKey`) across the server→client component boundary.
// Functions can't be serialized into client component props in
// Next.js 14 App Router.

export type StackedIconKey = "ai" | "inventory" | "market" | "clipboard" | "bell" | "award";

const STACKED_ICONS: Record<StackedIconKey, (p: { className?: string }) => JSX.Element> = {
  ai: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  ),
  inventory: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  market: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9v11h18V9" />
      <path d="M3 9h18" />
      <path d="M9 14h6v6H9z" />
    </svg>
  ),
  clipboard: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4v-1a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 11h6M9 15h6M9 19h4" />
    </svg>
  ),
  bell: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9z" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  ),
  award: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="12" cy="9" r="6" />
      <path d="M8.21 13.89L7 22l5-3 5 3-1.21-8.12" />
    </svg>
  ),
};

export type StackedCard = {
  key: string;
  iconKey: StackedIconKey;
  title: string;
  body: string;
};

export function StackedFeatureCards({
  cards,
  ariaLabel,
}: {
  cards: StackedCard[];
  ariaLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Touch tracking for swipe gestures
  const touchStartXRef = useRef<number | null>(null);

  const total = cards.length;

  const goNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % total);
  }, [total]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + total) % total);
  }, [total]);

  // Keyboard arrows on the container (after the user tabs in).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goNext(); // RTL: visually-left arrow advances
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goPrev();
    }
  };

  // Touch — swipe horizontally. Threshold 50px; swipes shorter than
  // that are noise and dismissed.
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 50) return;
    if (dx < 0)
      goNext(); // swipe leftward → next (RTL)
    else goPrev();
  };

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-roledescription="קרוסלת כרטיסים"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      // touch-pan-y tells iOS Safari "the user can scroll the page
      // vertically through this element, but horizontal touches are
      // ours to handle" — prevents the WHOLE PAGE from sliding
      // sideways on iOS gestures while the user swipes the cards.
      // overflow-hidden clips any transform-induced visual overflow
      // so the carousel never expands the document width.
      className="relative mx-auto w-full max-w-md touch-pan-y overflow-hidden"
    >
      {/* Live region announces the position change to SR users.
          Keyed on activeIndex so it re-renders + re-announces
          on every change. Sr-only — visual users see the dots. */}
      <p role="status" aria-live="polite" className="sr-only" key={activeIndex}>
        {`כרטיס ${activeIndex + 1} מתוך ${total}: ${cards[activeIndex]?.title ?? ""}`}
      </p>

      {/* Stack canvas — fixed height so the next-section flow doesn't
          jump as cards animate. Slightly taller than one card to leave
          room for the peeking back-cards. */}
      <div className="relative h-[26rem] w-full sm:h-[28rem]">
        {cards.map((card, i) => {
          // Compute "depth" — how far this card is BEHIND the active
          // one in the stack. 0 = active (front), 1 = first behind,
          // 2 = second behind. We render only depth 0..2 visually;
          // the rest are positioned far below (off-screen).
          const rawOffset = (i - activeIndex + total) % total;
          const depth = rawOffset; // 0..total-1

          // Visual treatment per depth
          const isFront = depth === 0;
          const isBack1 = depth === 1;
          const isBack2 = depth === 2;
          const isHidden = depth > 2;

          // Per-depth transform. Back cards sit slightly lower + smaller
          // and a touch dimmer so the eye reads the stack correctly.
          let translateY = 0;
          let scale = 1;
          let opacity = 1;
          let zIndex = 30;

          if (isBack1) {
            translateY = 12;
            scale = 0.96;
            opacity = 0.85;
            zIndex = 20;
          } else if (isBack2) {
            translateY = 22;
            scale = 0.92;
            opacity = 0.6;
            zIndex = 10;
          } else if (isHidden) {
            translateY = 36;
            scale = 0.88;
            opacity = 0;
            zIndex = 0;
          }

          // Front-card swipe-out animation: if we just navigated, the
          // PREVIOUS active card is now at depth = total - 1 (wrapped).
          // We don't render a special "exiting" card — the smooth
          // transition on transform handles it. The wrap-around makes
          // the card briefly fly off the back-stack edge, which reads
          // visually as "swiped away".

          const Icon = STACKED_ICONS[card.iconKey];

          return (
            <article
              key={card.key}
              aria-hidden={isFront ? undefined : true}
              className={[
                "border-brand-navy/15 absolute inset-x-0 top-0 rounded-2xl border bg-white p-6 shadow-xl transition-all duration-500 ease-out motion-reduce:transition-none sm:p-7",
                isFront ? "" : "pointer-events-none",
              ].join(" ")}
              style={{
                transform: `translateY(${translateY}px) scale(${scale})`,
                opacity,
                zIndex,
              }}
              tabIndex={isFront ? 0 : -1}
            >
              {/* Gold top accent stripe */}
              <span
                aria-hidden="true"
                className="bg-brand-gold absolute inset-x-6 top-0 h-1 rounded-b-full"
              />
              <div
                aria-hidden="true"
                className="bg-brand-gold/15 text-brand-navy inline-flex h-14 w-14 items-center justify-center rounded-xl"
              >
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="text-brand-navy mt-5 font-serif text-2xl font-bold leading-tight sm:text-[1.7rem]">
                {card.title}
              </h3>
              <p className="text-brand-ink/75 mt-3 text-[15px] leading-relaxed sm:text-base">
                {card.body}
              </p>
              <p aria-hidden="true" className="text-brand-ink/40 mt-6 font-mono text-xs" lang="en">
                {String(i + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </p>
            </article>
          );
        })}
      </div>

      {/* Controls row — prev/next + dots */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={goPrev}
          aria-label="כרטיס קודם"
          className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 hover:border-brand-navy focus-visible:outline-brand-navy inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">→</span>
        </button>

        <ol aria-label="מיקום בקרוסלה" className="flex items-center gap-1.5">
          {cards.map((c, i) => {
            const isActive = i === activeIndex;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`עבור לכרטיס ${i + 1} מתוך ${total}: ${c.title}`}
                  aria-current={isActive ? "true" : undefined}
                  className={[
                    "inline-block h-2 rounded-full transition-all motion-reduce:transition-none",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    isActive ? "bg-brand-gold w-6" : "bg-brand-navy/25 hover:bg-brand-navy/45 w-2",
                  ].join(" ")}
                />
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={goNext}
          aria-label="כרטיס הבא"
          className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 hover:border-brand-navy focus-visible:outline-brand-navy inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">←</span>
        </button>
      </div>

      {/* Below-stack hint — only visible on mobile to teach the gesture
          on first paint. Desktop users see the prev/next buttons. */}
      <p aria-hidden="true" className="text-brand-ink/55 mt-3 text-center text-xs sm:hidden">
        החלק כדי לעבור בין הכרטיסיות
      </p>
    </div>
  );
}

// Direction constant kept for future use (e.g., per-direction
// fly-off animation). Currently the same transition path handles
// both directions visually.
export type StackDirection = "next" | "prev";
