"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/FormField";
import { SearchableSelect } from "@/components/SearchableSelect";
import { apiFetch } from "@/lib/api";
import { CAR_MAKES, getModelsForMake, matchMake, matchModel } from "@/lib/car-data";

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

export type InventoryInitial = Partial<InventoryPayload> & { id?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InventoryPayload) => Promise<void>;
  initial?: InventoryInitial | null;
  mode: "create" | "edit";
  token?: string | null;
  /** Called when the dealer wants to manage images for an existing vehicle.
   *  Caller should close this dialog and open the images dialog. */
  onManageImages?: (vehicleId: string) => void;
  imageCount?: number;
};

const IL_NUMERIC = /^\d+$/;

const schema = z.object({
  // `make` / `model` validated via the combobox component; zod still
  // enforces non-empty so the form can flag them on submit.
  make: z.string().min(1, "חובה לבחור יצרן"),
  model: z.string().min(1, "חובה לבחור דגם"),
  year: z
    .string()
    .regex(IL_NUMERIC, "יש להזין מספר")
    .refine((v) => {
      const n = parseInt(v, 10);
      return n >= 1900 && n <= 2030;
    }, "שנה בין 1900 ל-2030"),
  mileage: z
    .string()
    .regex(IL_NUMERIC, "יש להזין מספר")
    .refine((v) => parseInt(v, 10) >= 0, "חובה להזין מספר חיובי"),
  price: z
    .string()
    .regex(IL_NUMERIC, "יש להזין מספר")
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

type FuelType = "petrol" | "diesel" | "electric" | "hybrid";
type PlateLookupResult = {
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  fuel_type: FuelType | null;
  plate_number: string;
};
type ImageLookupResult = {
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
};

export function InventoryFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
  mode,
  token,
  onManageImages,
  imageCount,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    setError: setFieldError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: toFormValues(initial),
  });

  const watchMake = watch("make");

  // Track which fields were auto-filled (for highlight + describedby)
  const [autofilledFields, setAutofilledFields] = useState<Set<string>>(new Set());
  const clearAutofill = useCallback((field: string) => {
    setAutofilledFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  // Disclosure panels — all can be open simultaneously (not tabs)
  const [panelPlate, setPanelPlate] = useState(false);
  const [panelImage, setPanelImage] = useState(false);

  // Plate lookup
  const [plate, setPlate] = useState("");
  const [plateBusy, setPlateBusy] = useState(false);
  const [plateStatus, setPlateStatus] = useState<string>("");
  const [plateError, setPlateError] = useState<string>("");

  // Image lookup
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgStatus, setImgStatus] = useState<string>("");
  const [imgError, setImgError] = useState<string>("");

  // Live-region for combobox revert announcements
  const [comboStatus, setComboStatus] = useState<string>("");

  // Reset when dialog opens for a different item
  useEffect(() => {
    if (open) {
      reset(toFormValues(initial));
      setAutofilledFields(new Set());
      setPlate("");
      setPlateStatus("");
      setPlateError("");
      setImgFile(null);
      setImgStatus("");
      setImgError("");
      setComboStatus("");
    }
  }, [open, initial, reset]);

  const applyAutoFill = useCallback(
    (
      patch: {
        make?: string | null;
        model?: string | null;
        year?: number | null;
        color?: string | null;
        fuel_type?: FuelType | null;
      },
      sourceLabel: string,
    ) => {
      const newlyFilled: string[] = [];

      if (patch.make) {
        const canonMake = matchMake(patch.make) ?? patch.make;
        setValue("make", canonMake, { shouldValidate: true });
        newlyFilled.push("make");

        if (patch.model) {
          const canonModel = matchModel(canonMake, patch.model) ?? patch.model;
          setValue("model", canonModel, { shouldValidate: true });
          newlyFilled.push("model");
        }
      } else if (patch.model) {
        // Model without make — still set, user can fix
        setValue("model", patch.model, { shouldValidate: true });
        newlyFilled.push("model");
      }

      if (patch.year != null) {
        setValue("year", String(patch.year), { shouldValidate: true });
        newlyFilled.push("year");
      }
      if (patch.color) {
        setValue("color", patch.color, { shouldValidate: true });
        newlyFilled.push("color");
      }
      if (patch.fuel_type) {
        setValue("fuel_type", patch.fuel_type, { shouldValidate: true });
        newlyFilled.push("fuel_type");
      }

      setAutofilledFields(new Set(newlyFilled));

      // Announce via the single-status region
      const count = newlyFilled.length;
      setComboStatus(
        count > 0
          ? `${sourceLabel}: מולאו ${count} שדות אוטומטית — אנא בדוק`
          : `${sourceLabel}: לא נמצאו פרטים למלא`,
      );
    },
    [setValue],
  );

  const runPlateLookup = async () => {
    if (!token) return;
    const clean = plate.replace(/\D/g, "");
    if (clean.length < 6 || clean.length > 9) {
      setPlateError("יש להזין 6 עד 9 ספרות");
      setPlateStatus("");
      return;
    }
    setPlateBusy(true);
    setPlateError("");
    setPlateStatus("מחפש…");
    try {
      const res = await apiFetch<PlateLookupResult>(
        `/api/v1/inventory/lookup/plate/${encodeURIComponent(clean)}`,
        { token },
      );
      applyAutoFill(
        {
          make: res.make,
          model: res.model,
          year: res.year,
          color: res.color,
          fuel_type: res.fuel_type,
        },
        "מספר רכב",
      );
      setPlateStatus("הפרטים מולאו אוטומטית ✓");
    } catch (e) {
      setPlateStatus("");
      setPlateError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setPlateBusy(false);
    }
  };

  const runImageLookup = async () => {
    if (!token || !imgFile) return;
    setImgBusy(true);
    setImgError("");
    setImgStatus("מזהה רכב מהתמונה…");
    try {
      const form = new FormData();
      form.append("file", imgFile);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/inventory/lookup/image`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error?.message ?? body.detail ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ImageLookupResult;
      if (data.make || data.model) {
        applyAutoFill(data, "זיהוי מתמונה");
        setImgStatus("הרכב זוהה ✓");
      } else {
        setImgStatus("");
        setImgError("לא הצלחנו לזהות את הרכב, אנא מלא ידנית");
      }
    } catch (e) {
      setImgStatus("");
      setImgError(e instanceof Error ? e.message : "שגיאה בזיהוי");
    } finally {
      setImgBusy(false);
    }
  };

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
          <div className="bg-brand-cream max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6 shadow-xl">
            <Dialog.Title className="text-brand-navy text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Description id="inventory-form-desc" className="text-brand-ink/70 mt-1 text-sm">
              שדות המסומנים ב־<span aria-hidden="true">*</span>
              <span className="sr-only">כוכבית</span> הם שדות חובה.
            </Dialog.Description>

            {/* Single live region for combobox/auto-fill announcements */}
            {comboStatus ? (
              <p role="status" aria-live="polite" className="sr-only" key={comboStatus}>
                {comboStatus}
              </p>
            ) : null}

            {errors.root?.message ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-4 py-3 text-sm"
              >
                {errors.root.message}
              </div>
            ) : null}

            {/* ==========================================================
                Auto-fill bar (3 always-visible disclosures)
                ========================================================== */}
            <section
              aria-labelledby="autofill-heading"
              className="border-brand-navy/15 mt-5 rounded-lg border bg-white p-4"
            >
              <h3 id="autofill-heading" className="text-brand-navy text-sm font-semibold">
                מלא פרטים אוטומטית
              </h3>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPanelPlate((v) => !v)}
                  aria-expanded={panelPlate}
                  aria-controls="panel-plate"
                  className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">📋</span>
                  לפי מספר רכב
                </button>
                <button
                  type="button"
                  onClick={() => setPanelImage((v) => !v)}
                  aria-expanded={panelImage}
                  aria-controls="panel-image"
                  className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span aria-hidden="true">📷</span>
                  זהה מתמונה
                </button>
                <span className="text-brand-ink/60 inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm">
                  <span aria-hidden="true">✏️</span>
                  או מלא ידנית למטה
                </span>
              </div>

              {/* Plate lookup panel */}
              {panelPlate ? (
                <div
                  id="panel-plate"
                  role="region"
                  aria-labelledby="autofill-heading"
                  className="border-brand-navy/10 mt-4 border-t pt-4"
                >
                  <label
                    htmlFor="plate-lookup-input"
                    className="text-brand-navy block text-sm font-medium"
                  >
                    מספר רכב
                  </label>
                  <p id="plate-lookup-hint" className="text-brand-navy/70 mt-1 text-xs">
                    7 או 8 ספרות, עם או בלי מקפים
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="plate-lookup-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runPlateLookup();
                        }
                      }}
                      aria-describedby="plate-lookup-hint"
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <button
                      type="button"
                      onClick={() => void runPlateLookup()}
                      disabled={plateBusy}
                      aria-busy={plateBusy || undefined}
                      className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                    >
                      {plateBusy ? "מחפש…" : "חפש"}
                    </button>
                  </div>
                  {plateStatus ? (
                    <p role="status" aria-live="polite" className="text-ok-text mt-2 text-sm">
                      {plateStatus}
                    </p>
                  ) : null}
                  {plateError ? (
                    <p role="alert" className="text-danger-text mt-2 text-sm">
                      {plateError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Image recognition panel */}
              {panelImage ? (
                <div
                  id="panel-image"
                  role="region"
                  aria-labelledby="autofill-heading"
                  className="border-brand-navy/10 mt-4 border-t pt-4"
                >
                  <label htmlFor="img-lookup-input" className="sr-only">
                    תמונת רכב לזיהוי
                  </label>
                  <input
                    ref={imgInputRef}
                    id="img-lookup-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => imgInputRef.current?.click()}
                      aria-controls="img-lookup-input"
                      className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {imgFile ? imgFile.name : "בחירת תמונה…"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runImageLookup()}
                      disabled={!imgFile || imgBusy}
                      aria-busy={imgBusy || undefined}
                      className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                    >
                      {imgBusy ? "מזהה…" : "זהה רכב מתמונה"}
                    </button>
                  </div>
                  {imgStatus ? (
                    <p role="status" aria-live="polite" className="text-ok-text mt-2 text-sm">
                      {imgStatus}
                    </p>
                  ) : null}
                  {imgError ? (
                    <p role="alert" className="text-danger-text mt-2 text-sm">
                      {imgError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* ==========================================================
                Main form
                ========================================================== */}
            <form onSubmit={submit} noValidate className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <SearchableSelect
                  id="inv-make"
                  label="יצרן"
                  value={watch("make")}
                  onChange={(v) => {
                    setValue("make", v, { shouldValidate: true });
                    // Reset model when make changes
                    setValue("model", "", { shouldValidate: true });
                    clearAutofill("make");
                    clearAutofill("model");
                  }}
                  options={CAR_MAKES}
                  placeholder="בחר יצרן…"
                  required
                  autofilled={autofilledFields.has("make")}
                  error={errors.make?.message}
                  onBlurInvalid={() => setComboStatus("נא בחר יצרן מהרשימה — הוחזר לערך הקודם")}
                />
                <SearchableSelect
                  id="inv-model"
                  label="דגם"
                  value={watch("model")}
                  onChange={(v) => {
                    setValue("model", v, { shouldValidate: true });
                    clearAutofill("model");
                  }}
                  options={getModelsForMake(watchMake)}
                  placeholder="בחר דגם…"
                  required
                  disabled={!watchMake}
                  disabledHint="בחר יצרן תחילה"
                  autofilled={autofilledFields.has("model")}
                  error={errors.model?.message}
                  onBlurInvalid={() => setComboStatus("נא בחר דגם מהרשימה — הוחזר לערך הקודם")}
                />
                <HighlightedField
                  id="inv-year"
                  label="שנה"
                  required
                  hint="ארבע ספרות"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  registration={register("year", {
                    onChange: () => clearAutofill("year"),
                  })}
                  error={errors.year?.message}
                  autofilled={autofilledFields.has("year")}
                />
                <HighlightedField
                  id="inv-mileage"
                  label="קילומטראז׳"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  registration={register("mileage", {
                    onChange: () => clearAutofill("mileage"),
                  })}
                  error={errors.mileage?.message}
                />
                <HighlightedField
                  id="inv-price"
                  label="מחיר מבוקש ₪"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  registration={register("price")}
                  error={errors.price?.message}
                />
                <HighlightedField
                  id="inv-color"
                  label="צבע"
                  autoComplete="off"
                  registration={register("color", {
                    onChange: () => clearAutofill("color"),
                  })}
                  error={errors.color?.message}
                  autofilled={autofilledFields.has("color")}
                />

                <SelectField
                  id="inv-transmission"
                  label="תיבת הילוכים"
                  error={errors.transmission?.message}
                  registration={register("transmission")}
                  options={[
                    { value: "", label: "בחירה…" },
                    { value: "automatic", label: "אוטומט" },
                    { value: "manual", label: "ידני" },
                  ]}
                />

                <SelectField
                  id="inv-fuel"
                  label="סוג דלק"
                  error={errors.fuel_type?.message}
                  registration={register("fuel_type", {
                    onChange: () => clearAutofill("fuel_type"),
                  })}
                  autofilled={autofilledFields.has("fuel_type")}
                  options={[
                    { value: "", label: "בחירה…" },
                    { value: "petrol", label: "בנזין" },
                    { value: "diesel", label: "דיזל" },
                    { value: "electric", label: "חשמלי" },
                    { value: "hybrid", label: "היברידי" },
                  ]}
                />

                <HighlightedField
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

              {/* Images link-button */}
              <div className="border-brand-navy/10 rounded-lg border bg-white p-4">
                <p className="text-brand-navy text-sm font-semibold">תמונות הרכב</p>
                {mode === "create" || !initial?.id ? (
                  <p className="text-brand-ink/70 mt-1 text-sm">
                    תמונות יהיו זמינות לאחר שמירת הרכב.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (initial?.id && onManageImages) onManageImages(initial.id);
                    }}
                    className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy mt-2 inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ניהול תמונות{imageCount != null ? ` (${imageCount})` : ""}
                  </button>
                )}
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

/* -------------------------------------------------------------------
 * Local form helpers — thin wrappers that add auto-fill highlight +
 * describedby. Separated to keep the main component readable.
 * ----------------------------------------------------------------- */

type HighlightedFieldProps = Omit<Parameters<typeof FormField>[0], "label"> & {
  label: string;
  autofilled?: boolean;
};

function HighlightedField({ autofilled, ...rest }: HighlightedFieldProps) {
  // FormField doesn't accept `autofilled` today — emulate via a wrapper
  // that paints the input border gold when the flag is set. We rely on
  // FormField rendering an <input> inside a <div>.
  return (
    <div
      data-autofilled={autofilled ? "true" : undefined}
      className="[&[data-autofilled=true]_input]:border-brand-gold [&[data-autofilled=true]_input]:ring-brand-gold/40 [&[data-autofilled=true]_input]:ring-1"
    >
      <FormField {...rest} />
    </div>
  );
}

function SelectField({
  id,
  label,
  options,
  error,
  registration,
  autofilled,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  registration: UseFormRegisterReturn;
  autofilled?: boolean;
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
          error
            ? "border-danger-text"
            : autofilled
              ? "border-brand-gold ring-brand-gold/40 ring-1"
              : "border-brand-navy/20",
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
