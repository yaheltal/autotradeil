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

export type Visibility = "private" | "b2b" | "b2c" | "both";

export type WarrantyType = "manufacturer" | "dealer" | "extended" | "none";

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
  visibility: Visibility;
  b2b_price: number | null;
  b2c_price: number | null;
  // Phase 6.5 — sale lifecycle + warranty (all optional)
  purchase_cost: number | null;
  warranty_type: WarrantyType | null;
  warranty_until: string | null; // YYYY-MM-DD
};

export type InventoryInitial = Partial<InventoryPayload> & { id?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns the created/updated row (callers in create mode use the
   *  returned `id` to attach the just-captured ID photo as the primary
   *  image). May return void in edit mode. */
  onSubmit: (payload: InventoryPayload) => Promise<{ id: string } | void>;
  initial?: InventoryInitial | null;
  mode: "create" | "edit";
  token?: string | null;
  /** Called when the dealer wants to manage images for an existing vehicle.
   *  Caller should close this dialog and open the images dialog. */
  onManageImages?: (vehicleId: string) => void;
  imageCount?: number;
};

const IL_NUMERIC = /^\d+$/;

// Engine displacement options — closed list. "0.0" is the electric
// sentinel (submitted as null so the backend's >= 0.5 check passes).
const ENGINE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "בחר נפח מנוע..." },
  { value: "1.0", label: '1.0 ליטר (1000 סמ"ק)' },
  { value: "1.2", label: '1.2 ליטר (1200 סמ"ק)' },
  { value: "1.4", label: '1.4 ליטר (1400 סמ"ק)' },
  { value: "1.5", label: '1.5 ליטר (1500 סמ"ק)' },
  { value: "1.6", label: '1.6 ליטר (1600 סמ"ק)' },
  { value: "1.8", label: '1.8 ליטר (1800 סמ"ק)' },
  { value: "2.0", label: '2.0 ליטר (2000 סמ"ק)' },
  { value: "2.5", label: '2.5 ליטר (2500 סמ"ק)' },
  { value: "3.0", label: '3.0 ליטר (3000 סמ"ק)' },
  { value: "3.5", label: '3.5 ליטר (3500 סמ"ק)' },
  { value: "4.0", label: '4.0 ליטר (4000 סמ"ק)' },
  { value: "0.0", label: "חשמלי (ללא מנוע)" },
];

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
  // Closed allowlist — values must match ENGINE_OPTIONS below.
  // "" = not selected, "0.0" = electric sentinel (submitted as null).
  engine_volume: z.enum([
    "",
    "1.0",
    "1.2",
    "1.4",
    "1.5",
    "1.6",
    "1.8",
    "2.0",
    "2.5",
    "3.0",
    "3.5",
    "4.0",
    "0.0",
  ]),
  notes: z.string().max(2000, "הערות ארוכות מדי").optional().or(z.literal("")),
  visibility: z.enum(["private", "b2b", "b2c", "both"]),
  b2b_price: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "יש להזין מספר"),
  b2c_price: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "יש להזין מספר"),
  purchase_cost: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "יש להזין מספר"),
  warranty_type: z
    .union([
      z.literal(""),
      z.literal("manufacturer"),
      z.literal("dealer"),
      z.literal("extended"),
      z.literal("none"),
    ])
    .optional(),
  warranty_until: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "תאריך לא תקין"),
});

type FormValues = z.infer<typeof schema>;

// Coerce any incoming engine_volume (free-text from pre-allowlist rows) to
// the closed set. Values outside the list fall back to "" so the form
// resolver doesn't throw on legacy inventory rows.
function normalizeEngineVolume(n: number | null | undefined): FormValues["engine_volume"] {
  if (n == null) return "";
  const s = String(n);
  const allowed = ENGINE_OPTIONS.map((o) => o.value);
  return (allowed.includes(s) ? s : "") as FormValues["engine_volume"];
}

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
    engine_volume: normalizeEngineVolume(v?.engine_volume ?? null),
    notes: v?.notes ?? "",
    visibility: (v?.visibility ?? "private") as Visibility,
    b2b_price: v?.b2b_price != null ? String(v.b2b_price) : "",
    b2c_price: v?.b2c_price != null ? String(v.b2c_price) : "",
    purchase_cost:
      (v as InventoryInitial & { purchase_cost?: number | null })?.purchase_cost != null
        ? String((v as { purchase_cost: number }).purchase_cost)
        : "",
    warranty_type: ((v as { warranty_type?: WarrantyType | null })?.warranty_type ??
      "") as FormValues["warranty_type"],
    warranty_until: (v as { warranty_until?: string | null })?.warranty_until ?? "",
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
  market_price: number | null;
};
type ImageLookupResult = {
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  fuel_type: FuelType | null;
  plate_number: string | null;
  source: "vision" | "plate+vision";
  market_price: number | null;
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
  // True when the plate input was populated by image OCR (not user typing).
  // Drives an extra aria-describedby line so AT users hear "auto-detected,
  // editable" when they focus the field.
  const [plateAutofilled, setPlateAutofilled] = useState(false);

  // Image lookup
  const imgInputRef = useRef<HTMLInputElement>(null);
  const imgGalleryRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgStatus, setImgStatus] = useState<string>("");
  const [imgError, setImgError] = useState<string>("");

  // Live-region for combobox revert announcements
  const [comboStatus, setComboStatus] = useState<string>("");

  // TODO Phase 6: replace gov.il price with internal market price calculated
  // from our own inventory data. Until then we display the ministry's
  // new-car list price as a non-binding hint.
  const [marketPriceHint, setMarketPriceHint] = useState<number | null>(null);
  // Separate sr-only live region — announcement-only, NOT wired into
  // aria-describedby. Keyed on value to force re-render of the status
  // message when a new price arrives (SRs reliably re-announce then).
  const [priceHintStatus, setPriceHintStatus] = useState<string>("");
  // Dedupe across plate/image lookups AND the live effect: never announce
  // the same price twice in a row.
  const lastAnnouncedPrice = useRef<number | null>(null);

  const announcePrice = useCallback((price: number | null) => {
    // Announce only on transition-to-number, and only if the value differs
    // from the previously announced one. Never announce on transition-to-null.
    if (price == null || price <= 0) return;
    if (lastAnnouncedPrice.current === price) return;
    lastAnnouncedPrice.current = price;
    setPriceHintStatus(`מחיר מחירון חדש: ${price.toLocaleString("he-IL")} שקלים`);
  }, []);

  // Reset when dialog opens for a different item
  useEffect(() => {
    if (open) {
      reset(toFormValues(initial));
      setAutofilledFields(new Set());
      setPlate("");
      setPlateStatus("");
      setPlateError("");
      setPlateAutofilled(false);
      setImgFile(null);
      setImgStatus("");
      setImgError("");
      setComboStatus("");
      setMarketPriceHint(null);
      setPriceHintStatus("");
      lastAnnouncedPrice.current = null;
    }
  }, [open, initial, reset]);

  // Live market-price hint — debounced fetch whenever make+model+year
  // are all valid. Clears synchronously on invalid input so stale hints
  // never flash under the price field.
  const watchedModel = watch("model");
  const watchedYear = watch("year");

  useEffect(() => {
    if (!open) return;
    const yearNum = parseInt(String(watchedYear), 10);
    const allValid =
      !!watchMake &&
      !!watchedModel &&
      Number.isFinite(yearNum) &&
      yearNum >= 1900 &&
      yearNum <= 2030 &&
      !!token;

    if (!allValid) {
      setMarketPriceHint(null);
      lastAnnouncedPrice.current = null;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          make: watchMake,
          model: watchedModel,
          year: String(yearNum),
        });
        const res = await apiFetch<{ price: number | null }>(
          `/api/v1/inventory/lookup/price-hint?${params.toString()}`,
          { token },
        );
        const mp = res.price && res.price > 0 ? res.price : null;
        setMarketPriceHint(mp);
        announcePrice(mp);
      } catch {
        setMarketPriceHint(null);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [open, watchMake, watchedModel, watchedYear, token, announcePrice]);

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
      const mp = res.market_price && res.market_price > 0 ? res.market_price : null;
      setMarketPriceHint(mp);
      announcePrice(mp);
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
      // Plate OCR populates the existing plate input so the user can edit
      // and re-search via the existing button. Track the OCR origin so the
      // input announces "auto-detected, editable" on focus.
      if (data.plate_number) {
        setPlate(data.plate_number);
        setPlateAutofilled(true);
        setPlateError("");
        // Auto-expand the plate panel so the dealer SEES the detected
        // number even if they only opened the image panel. The disclosure
        // flip is a direct, expected consequence of the upload they just
        // initiated. Expand-only — do NOT steal focus (WCAG 3.2.2).
        setPanelPlate(true);
      }
      if (data.make || data.model) {
        const sourceLabel =
          data.source === "plate+vision" && data.plate_number
            ? `מספר רכב מהתמונה (${data.plate_number})`
            : "זיהוי מתמונה";
        applyAutoFill(
          {
            make: data.make,
            model: data.model,
            year: data.year,
            color: data.color,
            fuel_type: data.fuel_type,
          },
          sourceLabel,
        );
        const mp = data.market_price && data.market_price > 0 ? data.market_price : null;
        setMarketPriceHint(mp);
        announcePrice(mp);
        // Keep imgStatus generic — plate detection is announced via the
        // sourceLabel that applyAutoFill writes to comboStatus, so we don't
        // collide three live regions in the same tick.
        setImgStatus("הרכב זוהה ✓");
      } else if (data.plate_number) {
        // Plate detected but no make/model — applyAutoFill didn't run, so
        // announce the plate detection through the comboStatus region so AT
        // users hear what happened.
        setComboStatus(`מספר רכב זוהה מהתמונה: ${data.plate_number} — אנא מלא את שאר הפרטים`);
        setImgStatus("מספר רכב זוהה ✓");
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
      // "" = not selected, "0.0" = electric sentinel → both submit as null
      engine_volume:
        values.engine_volume && values.engine_volume !== "0.0"
          ? parseFloat(values.engine_volume)
          : null,
      notes: values.notes ? values.notes : null,
      visibility: values.visibility,
      b2b_price:
        (values.visibility === "b2b" || values.visibility === "both") && values.b2b_price
          ? parseInt(values.b2b_price, 10)
          : null,
      b2c_price:
        (values.visibility === "b2c" || values.visibility === "both") && values.b2c_price
          ? parseInt(values.b2c_price, 10)
          : null,
      purchase_cost: values.purchase_cost ? parseInt(values.purchase_cost, 10) : null,
      warranty_type: values.warranty_type ? (values.warranty_type as WarrantyType) : null,
      warranty_until: values.warranty_until || null,
    };
    try {
      const created = await onSubmit(payload);
      // Close immediately (a11y-lead req: don't keep the dialog open during
      // background uploads). Then fire-and-forget the ID-photo attach so the
      // image used for AI identification becomes the new vehicle's primary.
      const fileToAttach = mode === "create" ? imgFile : null;
      const newId = mode === "create" && created ? created.id : null;
      onOpenChange(false);
      reset(toFormValues(null));
      if (newId && fileToAttach && token) {
        const form = new FormData();
        form.append("file", fileToAttach);
        void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/inventory/${newId}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }).catch(() => {
          // Non-fatal — vehicle exists, dealer can upload images later.
        });
      }
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
          dir="rtl"
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4"
        >
          <div className="bg-brand-cream max-h-[95dvh] w-full max-w-2xl overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
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

            {/* Dedicated live region for the market-price hint. Separate from
                comboStatus so blur-revert announcements don't clobber price
                notifications (and vice versa). Announcement-only — NOT wired
                into any aria-describedby. */}
            {priceHintStatus ? (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                key={priceHintStatus}
              >
                {priceHintStatus}
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
                      onChange={(e) => {
                        setPlate(e.target.value);
                        // User typed → no longer "auto-detected from image".
                        if (plateAutofilled) setPlateAutofilled(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runPlateLookup();
                        }
                      }}
                      aria-describedby={
                        plateAutofilled
                          ? "plate-lookup-hint plate-lookup-source"
                          : "plate-lookup-hint"
                      }
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    {plateAutofilled ? (
                      <span id="plate-lookup-source" className="sr-only">
                        זוהה אוטומטית מהתמונה — ניתן לערוך
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void runPlateLookup()}
                      disabled={plateBusy}
                      aria-busy={plateBusy || undefined}
                      aria-label={plateBusy ? "מחפש לפי מספר רכב" : "חפש לפי מספר רכב"}
                      className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                    >
                      {plateBusy ? "מחפש…" : "חפש לפי מספר רכב"}
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
                  {/* Two hidden inputs — one forces camera (capture=environment),
                   *  the other lets the OS picker show gallery + files. iOS
                   *  Safari requires this split because `capture` overrides
                   *  the picker UX completely. */}
                  <input
                    ref={imgInputRef}
                    id="img-camera-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    capture="environment"
                    className="sr-only"
                    aria-label="צילום תמונת רכב במצלמה"
                    onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
                  />
                  <input
                    ref={imgGalleryRef}
                    id="img-gallery-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="sr-only"
                    aria-label="בחירת תמונת רכב מהגלריה"
                    onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => imgInputRef.current?.click()}
                      className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <span aria-hidden="true">📷</span>
                      צלם תמונה
                    </button>
                    <button
                      type="button"
                      onClick={() => imgGalleryRef.current?.click()}
                      className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <span aria-hidden="true">🖼️</span>
                      בחר מהגלריה
                    </button>
                  </div>
                  {imgFile ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="text-brand-ink/70 mt-2 text-xs"
                      key={imgFile.name}
                    >
                      נבחר: {imgFile.name}
                    </p>
                  ) : null}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void runImageLookup()}
                      disabled={!imgFile || imgBusy}
                      aria-busy={imgBusy || undefined}
                      className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-11 w-full items-center justify-center rounded-md px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
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
                  hint={
                    marketPriceHint ? (
                      <>
                        <span aria-hidden="true">💡 </span>
                        {`מחיר מחירון רכב חדש: ₪${marketPriceHint.toLocaleString("he-IL")} (לצורך השוואה בלבד)`}
                      </>
                    ) : undefined
                  }
                />
                {/* Phase 6.5 — purchase_cost. Optional. Used by /sell and
                 *  the dealer's KPI dashboard to compute profit. */}
                <HighlightedField
                  id="inv-purchase-cost"
                  label="עלות קנייה ₪ (אופציונלי)"
                  inputMode="numeric"
                  autoComplete="off"
                  registration={register("purchase_cost")}
                  error={errors.purchase_cost?.message}
                  hint={
                    <span className="text-brand-ink/70">לצורך חישוב רווח אוטומטי בעת המכירה</span>
                  }
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

                <SelectField
                  id="inv-engine"
                  label="נפח מנוע (ליטרים)"
                  error={errors.engine_volume?.message}
                  registration={register("engine_volume")}
                  options={ENGINE_OPTIONS}
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

              {/* Phase 4.3 — visibility selector */}
              <fieldset className="border-brand-navy/15 rounded-lg border bg-white p-4">
                <legend className="text-brand-navy px-2 text-sm font-semibold">חשיפת הרכב</legend>
                <div className="mt-2 space-y-2">
                  {/* Phase 6.8.3 — B2C and "both" are locked behind a
                   *  "בקרוב" tooltip until the B2C marketplace launches. */}
                  {(
                    [
                      ["private", "פרטי — רק אני רואה", false],
                      ["b2b", "B2B — סוחרים בלבד", false],
                      ["b2c", "B2C — לקוחות בלבד", true],
                      ["both", "שניהם — סוחרים + לקוחות", true],
                    ] as const
                  ).map(([v, label, locked]) => (
                    <label
                      key={v}
                      title={locked ? "בקרוב — שוק B2C עדיין לא פתוח" : undefined}
                      className={[
                        "flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 py-2",
                        locked
                          ? "border-brand-navy/10 cursor-not-allowed opacity-50"
                          : "border-brand-navy/20 hover:bg-brand-navy/5 cursor-pointer",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        value={v}
                        disabled={locked}
                        aria-describedby={locked ? `vis-${v}-soon` : undefined}
                        {...register("visibility")}
                        className="accent-brand-navy"
                      />
                      <span className="text-brand-navy text-sm font-medium">{label}</span>
                      {locked ? (
                        <span
                          id={`vis-${v}-soon`}
                          className="bg-brand-navy/10 text-brand-navy/70 ms-auto rounded-full px-2 py-0.5 text-xs font-semibold"
                        >
                          בקרוב
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>

                {watch("visibility") === "b2b" || watch("visibility") === "both" ? (
                  <div className="mt-4">
                    <label
                      htmlFor="inv-b2b-price"
                      className="text-brand-navy block text-sm font-medium"
                    >
                      מחיר B2B ₪ (אופציונלי)
                    </label>
                    <p id="inv-b2b-price-hint" className="text-brand-navy/70 mt-1 text-xs">
                      אם לא הוזן — יוצג המחיר המבוקש הרגיל
                    </p>
                    <input
                      id="inv-b2b-price"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      {...register("b2b_price")}
                      aria-describedby="inv-b2b-price-hint"
                      aria-invalid={errors.b2b_price?.message ? true : undefined}
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    {errors.b2b_price?.message ? (
                      <p className="text-danger-text mt-1 text-sm">{errors.b2b_price.message}</p>
                    ) : null}
                  </div>
                ) : null}

                {watch("visibility") === "b2c" || watch("visibility") === "both" ? (
                  <div className="mt-4">
                    <label
                      htmlFor="inv-b2c-price"
                      className="text-brand-navy block text-sm font-medium"
                    >
                      מחיר קמעונאי ₪ (אופציונלי)
                    </label>
                    <p id="inv-b2c-price-hint" className="text-brand-navy/70 mt-1 text-xs">
                      המחיר המוצג ללקוחות הקצה
                    </p>
                    <input
                      id="inv-b2c-price"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      {...register("b2c_price")}
                      aria-describedby="inv-b2c-price-hint"
                      aria-invalid={errors.b2c_price?.message ? true : undefined}
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    {errors.b2c_price?.message ? (
                      <p className="text-danger-text mt-1 text-sm">{errors.b2c_price.message}</p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>

              {/* Phase 6.5 — Warranty (separate optional section, NOT a
               *  panel under "מלא פרטים אוטומטית") */}
              <section
                aria-labelledby="warranty-heading"
                className="border-brand-navy/15 mt-2 rounded-lg border bg-white p-4"
              >
                <h3 id="warranty-heading" className="text-brand-navy text-sm font-semibold">
                  פרטי אחריות (אופציונלי)
                </h3>
                <p className="text-brand-ink/70 mt-1 text-xs">
                  מלא רק אם יש לרכב אחריות בתוקף — יוצג לקונים בשוק
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField
                    id="inv-warranty-type"
                    label="סוג אחריות"
                    registration={register("warranty_type")}
                    options={[
                      { value: "", label: "בחר סוג אחריות..." },
                      { value: "manufacturer", label: "אחריות יצרן" },
                      { value: "dealer", label: "אחריות סוחר" },
                      { value: "extended", label: "אחריות מורחבת" },
                      { value: "none", label: "ללא אחריות" },
                    ]}
                    error={errors.warranty_type?.message}
                  />
                  <div>
                    <label
                      htmlFor="inv-warranty-until"
                      className="text-brand-navy block text-sm font-medium"
                    >
                      תוקף האחריות
                    </label>
                    <input
                      id="inv-warranty-until"
                      type="date"
                      dir="ltr"
                      {...register("warranty_until")}
                      aria-invalid={errors.warranty_until?.message ? true : undefined}
                      aria-describedby="inv-warranty-until-hint"
                      className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <p id="inv-warranty-until-hint" className="text-brand-ink/70 mt-1 text-xs">
                      התאריך עד אליו האחריות בתוקף
                    </p>
                    {errors.warranty_until?.message ? (
                      <p className="text-danger-text mt-1 text-sm">
                        {errors.warranty_until.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

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
        dir="rtl"
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
