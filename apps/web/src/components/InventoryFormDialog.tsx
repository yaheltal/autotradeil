"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/FormField";

export type InventoryPayload = {
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: number | null;
  notes: string | null;
};

export type InventoryInitial = Partial<InventoryPayload>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InventoryPayload) => Promise<void>;
  initial?: InventoryInitial | null;
  mode: "create" | "edit";
};

const schema = z.object({
  make: z.string().min(1, "חובה להזין יצרן").max(100, "יצרן ארוך מדי"),
  model: z.string().min(1, "חובה להזין דגם").max(100, "דגם ארוך מדי"),
  year: z
    .string()
    .regex(/^\d+$/, "יש להזין מספר")
    .refine((v) => {
      const n = parseInt(v, 10);
      return n >= 1900 && n <= 2030;
    }, "שנה בין 1900 ל-2030"),
  mileage: z
    .string()
    .regex(/^\d+$/, "יש להזין מספר")
    .refine((v) => parseInt(v, 10) >= 0, "חובה להזין מספר חיובי"),
  price: z
    .string()
    .regex(/^\d+$/, "יש להזין מספר")
    .refine((v) => parseInt(v, 10) >= 0, "חובה להזין מספר חיובי"),
  color: z.string().max(50, "צבע ארוך מדי").optional().or(z.literal("")),
  transmission: z.union([z.literal("automatic"), z.literal("manual"), z.literal("")]).optional(),
  fuel_type: z
    .union([
      z.literal("petrol"),
      z.literal("diesel"),
      z.literal("electric"),
      z.literal("hybrid"),
      z.literal(""),
    ])
    .optional(),
  engine_volume: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true;
      if (!/^\d+(\.\d+)?$/.test(v)) return false;
      const n = parseFloat(v);
      return n >= 0.5 && n <= 9.9;
    }, "נפח מנוע בין 0.5 ל-9.9"),
  notes: z.string().max(2000, "הערות ארוכות מדי").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(v: InventoryInitial | null | undefined): FormValues {
  return {
    make: v?.make ?? "",
    model: v?.model ?? "",
    year: v?.year != null ? String(v.year) : "",
    mileage: v?.mileage != null ? String(v.mileage) : "",
    price: v?.price != null ? String(v.price) : "",
    color: v?.color ?? "",
    transmission: (v?.transmission ?? "") as FormValues["transmission"],
    fuel_type: (v?.fuel_type ?? "") as FormValues["fuel_type"],
    engine_volume: v?.engine_volume != null ? String(v.engine_volume) : "",
    notes: v?.notes ?? "",
  };
}

export function InventoryFormDialog({ open, onOpenChange, onSubmit, initial, mode }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setError: setFieldError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: toFormValues(initial),
  });

  // When the dialog opens for a different item, reset with its values.
  useEffect(() => {
    if (open) reset(toFormValues(initial));
  }, [open, initial, reset]);

  const submit = handleSubmit(async (values) => {
    const payload: InventoryPayload = {
      make: values.make,
      model: values.model,
      year: parseInt(values.year, 10),
      mileage: parseInt(values.mileage, 10),
      price: parseInt(values.price, 10),
      color: values.color ? values.color : null,
      transmission: values.transmission === "" ? null : (values.transmission ?? null),
      fuel_type: values.fuel_type === "" ? null : (values.fuel_type ?? null),
      engine_volume: values.engine_volume ? parseFloat(values.engine_volume) : null,
      notes: values.notes ? values.notes : null,
    };
    try {
      await onSubmit(payload);
      onOpenChange(false);
      reset(toFormValues(null));
    } catch (e) {
      setFieldError("root", {
        message: e instanceof Error ? e.message : "שגיאה בשליחה",
      });
    }
  });

  const title = mode === "create" ? "הוספת רכב" : "עריכת רכב";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <Dialog.Content
          aria-describedby="inventory-form-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 motion-reduce:transition-none"
        >
          <div className="bg-brand-cream max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Description id="inventory-form-desc" className="text-brand-ink/70 mt-1 text-sm">
              שדות המסומנים ב־<span aria-hidden="true">*</span>
              <span className="sr-only">כוכבית</span> הם שדות חובה.
            </Dialog.Description>

            {errors.root?.message ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3 text-sm"
              >
                {errors.root.message}
              </div>
            ) : null}

            <form onSubmit={submit} noValidate className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  id="inv-make"
                  label="יצרן"
                  required
                  autoComplete="off"
                  registration={register("make")}
                  error={errors.make?.message}
                />
                <FormField
                  id="inv-model"
                  label="דגם"
                  required
                  autoComplete="off"
                  registration={register("model")}
                  error={errors.model?.message}
                />
                <FormField
                  id="inv-year"
                  label="שנה"
                  required
                  hint="ארבע ספרות"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  registration={register("year")}
                  error={errors.year?.message}
                />
                <FormField
                  id="inv-mileage"
                  label="קילומטראז׳"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  registration={register("mileage")}
                  error={errors.mileage?.message}
                />
                <FormField
                  id="inv-price"
                  label="מחיר מבוקש ₪"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  registration={register("price")}
                  error={errors.price?.message}
                />
                <FormField
                  id="inv-color"
                  label="צבע"
                  autoComplete="off"
                  registration={register("color")}
                  error={errors.color?.message}
                />

                <SelectField
                  id="inv-transmission"
                  label="תיבת הילוכים"
                  error={errors.transmission?.message}
                  options={[
                    { value: "", label: "בחירה…" },
                    { value: "automatic", label: "אוטומט" },
                    { value: "manual", label: "ידני" },
                  ]}
                  registration={register("transmission")}
                />

                <SelectField
                  id="inv-fuel"
                  label="סוג דלק"
                  error={errors.fuel_type?.message}
                  options={[
                    { value: "", label: "בחירה…" },
                    { value: "petrol", label: "בנזין" },
                    { value: "diesel", label: "דיזל" },
                    { value: "electric", label: "חשמלי" },
                    { value: "hybrid", label: "היברידי" },
                  ]}
                  registration={register("fuel_type")}
                />

                <FormField
                  id="inv-engine"
                  label="נפח מנוע (ליטרים)"
                  hint="בין 0.5 ל-9.9"
                  inputMode="decimal"
                  autoComplete="off"
                  registration={register("engine_volume")}
                  error={errors.engine_volume?.message}
                />
              </div>

              <div>
                <label htmlFor="inv-notes" className="text-brand-navy block text-sm font-medium">
                  הערות
                </label>
                <p id="inv-notes-hint" className="text-brand-navy/70 mt-1 text-xs">
                  עד 2000 תווים. ההערות אינן מופיעות לצרכנים.
                </p>
                <textarea
                  id="inv-notes"
                  rows={4}
                  maxLength={2000}
                  aria-describedby={
                    errors.notes?.message ? "inv-notes-hint inv-notes-error" : "inv-notes-hint"
                  }
                  aria-invalid={errors.notes?.message ? true : undefined}
                  {...register("notes")}
                  className={[
                    "text-brand-ink mt-2 block w-full rounded-md border px-3 py-2 text-base",
                    "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                    errors.notes
                      ? "border-danger-text bg-danger-bg"
                      : "border-brand-navy/20 bg-white",
                  ].join(" ")}
                />
                {errors.notes?.message ? (
                  <p id="inv-notes-error" className="text-danger-text mt-1 text-sm">
                    {errors.notes.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting || undefined}
                  className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSubmitting ? "שומר…" : mode === "create" ? "הוסף רכב" : "שמור שינויים"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SelectField({
  id,
  label,
  options,
  error,
  registration,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  registration: UseFormRegisterReturn;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-brand-navy block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...registration}
        className={[
          "text-brand-ink mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base",
          "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
          error ? "border-danger-text" : "border-brand-navy/20",
        ].join(" ")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-danger-text mt-1 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
