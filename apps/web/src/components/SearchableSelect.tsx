"use client";

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useEffect, useState } from "react";

/*
 * Searchable single-select combobox.
 *
 * Wraps @headlessui/react Combobox with our label / hint / error
 * pattern and the Phase 3.3 auto-fill highlight state.
 *
 * A11y (approved plan + corrections):
 *   - Label owns `htmlFor`; the Combobox.Input gets the matching id.
 *   - Hint + error exposed via aria-describedby (hint first, error
 *     second — already implemented on FormField; mirrored here).
 *   - Must-select-from-list: on blur with no valid selection we
 *     silent-revert to the last valid value AND announce via the
 *     form-level role="status" region (caller controls announcement).
 *   - Model-select "disabled" state uses aria-disabled="true" + a
 *     describedby hint (not native `disabled`, per a11y-lead fix #9).
 *   - Empty-filter `<ComboboxOption disabled>לא נמצא</ComboboxOption>`
 *     lives inside a listbox that's aria-live="polite".
 *   - Gold auto-fill highlight is paired with `aria-describedby`
 *     pointing to a sr-only reminder ONLY on the first auto-filled
 *     control (caller passes `showAutofillHint`).
 */

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  disabledHint?: string; // message shown + announced when disabled
  autofilled?: boolean;
  required?: boolean;
  onBlurInvalid?: () => void; // called when user blurs with unmatched text
};

export function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "בחר…",
  hint,
  error,
  disabled = false,
  disabledHint,
  autofilled = false,
  required = false,
  onBlurInvalid,
}: Props) {
  const [query, setQuery] = useState("");

  // Keep local query in sync with outside value
  useEffect(() => {
    setQuery("");
  }, [value]);

  const filtered =
    query === "" ? options : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const disabledId = `${id}-disabled`;
  const autofillId = `${id}-autofill`;

  const describedBy =
    [
      disabled && disabledHint ? disabledId : null,
      hint ? hintId : null,
      autofilled ? autofillId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = () => {
    if (disabled) return;
    // If the user typed text but never chose a valid option, revert.
    if (query && !options.some((o) => o.toLowerCase() === query.toLowerCase())) {
      setQuery("");
      onBlurInvalid?.();
    }
  };

  return (
    <div>
      <label htmlFor={id} className="text-brand-navy block text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-text ms-1">
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-brand-navy/70 mt-1 text-xs">
          {hint}
        </p>
      ) : null}

      {disabled && disabledHint ? (
        <p id={disabledId} className="text-brand-navy/70 mt-1 text-xs">
          {disabledHint}
        </p>
      ) : null}

      {autofilled ? (
        <span id={autofillId} className="sr-only">
          מולא אוטומטית — אנא בדוק ועדכן אם צריך
        </span>
      ) : null}

      <Combobox
        value={value}
        onChange={(v: string | null) => onChange(v ?? "")}
        disabled={disabled}
      >
        <div className="relative mt-2">
          <ComboboxInput
            id={id}
            aria-invalid={error ? true : undefined}
            aria-disabled={disabled || undefined}
            aria-describedby={describedBy}
            placeholder={placeholder}
            displayValue={(v: string) => v}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={handleBlur}
            className={[
              "text-brand-ink block w-full rounded-md border px-3 py-2 pe-10 text-base",
              "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
              error
                ? "border-danger-text bg-danger-bg"
                : autofilled
                  ? "border-brand-gold ring-brand-gold/40 bg-white ring-1"
                  : "border-brand-navy/20 bg-white",
              disabled ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          />
          <ComboboxButton
            aria-label="פתיחת רשימה"
            className="text-brand-ink/60 focus-visible:outline-brand-navy absolute inset-y-0 end-2 flex items-center px-1 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComboboxButton>

          <ComboboxOptions
            aria-live="polite"
            className="border-brand-navy/15 absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white py-1 text-sm shadow-lg focus:outline-none"
          >
            {filtered.length === 0 ? (
              <ComboboxOption
                value={null}
                disabled
                className="text-brand-ink/60 cursor-default px-3 py-2"
              >
                לא נמצא
              </ComboboxOption>
            ) : (
              filtered.map((o) => (
                <ComboboxOption
                  key={o}
                  value={o}
                  className={({ focus, selected }) =>
                    [
                      "cursor-pointer px-3 py-2",
                      focus ? "bg-brand-navy/5 text-brand-navy" : "text-brand-ink",
                      selected ? "font-semibold" : "",
                    ].join(" ")
                  }
                >
                  {o}
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>

      {error ? (
        <p id={errorId} className="text-danger-text mt-1 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
