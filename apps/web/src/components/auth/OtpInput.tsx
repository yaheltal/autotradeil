"use client";

import { OTPInput, type SlotProps } from "input-otp";
import { forwardRef } from "react";

/**
 * OtpInput — premium 6-slot one-time code field.
 *
 * Built on `input-otp`: behaves as a SINGLE accessible input (one
 * autocomplete=one-time-code field that screen readers announce as
 * one entity) but renders 6 visual slots with auto-advance.
 *
 * Brand styling:
 *   - 48×56 navy-bordered cream slots
 *   - Active slot: gold ring + slight scale-up
 *   - Filled slot: navy text on cream
 *   - dir=ltr (digits read left-to-right even in RTL pages)
 *
 * iOS Safari + Android Chrome auto-fill SMS OTPs into this field
 * when paired with autoComplete="one-time-code".
 */
export const OtpInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onComplete?: (v: string) => void;
    disabled?: boolean;
    "aria-label"?: string;
    "aria-describedby"?: string;
    autoFocus?: boolean;
  }
>(function OtpInputImpl({ value, onChange, onComplete, disabled, autoFocus, ...aria }, ref) {
  return (
    <OTPInput
      ref={ref}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={aria["aria-label"] ?? "קוד אימות חד פעמי"}
      aria-describedby={aria["aria-describedby"]}
      autoComplete="one-time-code"
      inputMode="numeric"
      pattern="^\d{6}$"
      // Outer container is RTL-neutral; the digits themselves render LTR
      // so a 6-digit code reads naturally from left to right.
      containerClassName="flex items-center justify-center gap-2 sm:gap-2.5 has-[:disabled]:opacity-50"
      render={({ slots }) => (
        <div dir="ltr" className="flex items-center gap-2 sm:gap-2.5">
          {slots.map((slot, idx) => (
            <Slot key={idx} {...slot} />
          ))}
        </div>
      )}
    />
  );
});

function Slot({ char, isActive }: SlotProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "relative flex h-14 w-12 items-center justify-center rounded-xl",
        "border-2 bg-white transition-all duration-150",
        "font-serif text-2xl font-bold tabular-nums",
        isActive
          ? "border-brand-gold text-brand-navy ring-brand-gold/30 z-10 scale-[1.04] ring-4"
          : char
            ? "border-brand-navy/30 text-brand-navy"
            : "border-brand-navy/15 text-brand-navy/40",
      ].join(" ")}
    >
      {char ?? ""}
      {isActive && !char ? (
        <span
          aria-hidden="true"
          className="bg-brand-navy/55 absolute h-6 w-px motion-safe:animate-pulse"
        />
      ) : null}
    </div>
  );
}
