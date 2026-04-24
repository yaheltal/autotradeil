import type { InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

/**
 * Accessible text input with label + optional hint + optional error.
 *
 * A11y decisions (approved in Phase 2.6 review):
 *   - `<label htmlFor>` always paired — never placeholder-as-label.
 *   - `aria-describedby` order is hint-first, error-second so screen
 *     readers announce context before the violation.
 *   - Per-field error is a plain `<p>` — the top-of-form summary
 *     carries `role="alert"` so we don't trigger announcement storms
 *     on multi-field validation failures.
 *   - Relies on native `required`; no duplicate `aria-required`.
 */
type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  required?: boolean;
  pattern?: string;
  maxLength?: number;
  placeholder?: string;
  registration: UseFormRegisterReturn;
};

export function FormField({
  id,
  label,
  hint,
  error,
  type = "text",
  inputMode,
  autoComplete,
  required,
  pattern,
  maxLength,
  placeholder,
  registration,
}: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

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
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...registration}
        className={[
          "text-brand-ink mt-2 block w-full rounded-md border px-3 py-2 text-base",
          "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
          error ? "border-danger-text bg-danger-bg" : "border-brand-navy/20 bg-white",
        ].join(" ")}
      />
      {error ? (
        <p id={errorId} className="text-danger-text mt-1 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
