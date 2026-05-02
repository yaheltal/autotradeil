"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { motion, useAnimationControls } from "framer-motion";
import { forwardRef, useEffect } from "react";

export type OtpState = "idle" | "error" | "success";

/**
 * OtpInput — premium 6-slot one-time code field.
 *
 * Built on `input-otp`: behaves as a SINGLE accessible input (one
 * autocomplete=one-time-code field that screen readers announce as
 * one entity) but renders 6 visual slots with auto-advance.
 *
 * iOS Safari + Android Chrome auto-fill SMS OTPs into this field
 * when paired with autoComplete="one-time-code". Do NOT replace
 * input-otp with manual <input> boxes — auto-fill breaks.
 *
 * Visual: large rounded brand-bordered slots with framer-motion
 * staggered entrance, active slot lifts, and an error-shake driven
 * by the parent via the `state` prop.
 */
export const OtpInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onComplete?: (v: string) => void;
    disabled?: boolean;
    state?: OtpState;
    "aria-label"?: string;
    "aria-describedby"?: string;
    autoFocus?: boolean;
  }
>(function OtpInputImpl(
  { value, onChange, onComplete, disabled, state = "idle", autoFocus, ...aria },
  ref,
) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (state === "error") {
      void controls.start({
        x: [0, 8, -8, 6, -6, 4, -4, 0],
        transition: { duration: 0.45 },
      });
    } else {
      controls.set({ x: 0 });
    }
  }, [state, controls]);

  return (
    <OTPInput
      ref={ref}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      disabled={disabled || state === "success"}
      autoFocus={autoFocus}
      aria-label={aria["aria-label"] ?? "קוד אימות חד פעמי"}
      aria-describedby={aria["aria-describedby"]}
      autoComplete="one-time-code"
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      containerClassName="flex items-center justify-center has-[:disabled]:opacity-60"
      render={({ slots }) => (
        <motion.div
          dir="ltr"
          animate={controls}
          className="flex items-center justify-center gap-2 sm:gap-2.5"
        >
          {slots.map((slot, idx) => (
            <Slot key={idx} index={idx} state={state} {...slot} />
          ))}
        </motion.div>
      )}
    />
  );
});

function Slot({
  char,
  isActive,
  index,
  state,
}: SlotProps & { index: number; state: OtpState }) {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: isActive && state === "idle" ? -3 : 0,
        scale: isActive && state === "idle" ? 1.04 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 700,
        damping: 22,
        delay: index * 0.04,
      }}
      className={[
        "relative flex h-16 w-14 items-center justify-center rounded-2xl",
        "border-2 bg-white transition-colors duration-200",
        "font-serif text-3xl font-bold tabular-nums",
        state === "error"
          ? "border-danger text-danger ring-danger/25 ring-4"
          : state === "success"
            ? "border-ok text-ok ring-ok/25 ring-4"
            : isActive
              ? "border-brand-gold text-brand-navy ring-brand-gold/30 z-10 shadow-md ring-4"
              : char
                ? "border-brand-navy/40 text-brand-navy shadow-sm"
                : "border-brand-navy/15 text-brand-navy/40",
      ].join(" ")}
    >
      {char ?? ""}
      {isActive && !char && state === "idle" ? (
        <span
          aria-hidden="true"
          className="bg-brand-navy/60 absolute h-7 w-px motion-safe:animate-pulse"
        />
      ) : null}
    </motion.div>
  );
}
