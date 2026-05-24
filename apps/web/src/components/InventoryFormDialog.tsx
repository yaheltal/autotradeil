"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Camera,
  Check,
  FileText,
  ImageIcon,
  Lightbulb,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/FormField";
import { ImageDropZone } from "@/components/ImageDropZone";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { CAR_MAKES, getModelsForMake, matchMake, matchModel } from "@/lib/car-data";
import { formatRelativeTime } from "@/lib/format";

/*
 * InventoryFormDialog — editorial 3-step wizard.
 *
 *  ┌───────────────────────────────────────────────────────────────┐
 *  │  הוספת רכב                                                  ×  │
 *  │  שדות חובה מסומנים *                                            │
 *  │  ─────                                                          │
 *  │  ❶━━━━━━━━○━━━━━━━━○      רכב · מחיר · אחריות                  │
 *  │                                                                  │
 *  │  [טיוטה שמורה מלפני 12 דקות.  שחזר · מחק]   (only if draft)     │
 *  │                                                                  │
 *  │  STEP 1: רכב                                                    │
 *  │    מילוי אוטומטי                                                │
 *  │    [רישיון רכב · מספר רכב · תמונה]   ← shadcn Tabs              │
 *  │    פרטי הרכב                                                    │
 *  │    יצרן* / דגם* / שנה* / ק"מ* / יד / נפח / דלק / תיבה / צבע    │
 *  │                                                                  │
 *  │  STEP 2: מחיר                                                   │
 *  │    מחיר* (AI hint inline)                                       │
 *  │    חשיפה (private/b2b/b2c/both)                                 │
 *  │    b2b_price / b2c_price / עלות קנייה / הערות                   │
 *  │                                                                  │
 *  │  STEP 3: אחריות + תמונות                                        │
 *  │    סוג אחריות · תוקף  (optional)                                │
 *  │    תמונות — link to manage OR (create mode) drop zone           │
 *  │                                                                  │
 *  │  [← הקודם]  [שמור טיוטה]              [ביטול]  [הבא / הוסף רכב] │
 *  └───────────────────────────────────────────────────────────────┘
 *
 * Preserves verbatim from the long-scroll version:
 *   - useForm + zod schema + all field validations
 *   - 3 auto-fill paths (registration scan / plate lookup / image
 *     recognition) — now consolidated into a shadcn Tabs row at the
 *     top of step 1 instead of three vertical disclosure panels
 *   - applyAutoFill + matchMake/matchModel canonicalization
 *   - autofilledFields highlight set
 *   - market-price hint (debounced /price-hint fetch)
 *   - AI price estimate (debounced /price-estimate fetch)
 *   - electric-vehicle engine_volume conditional
 *   - MODEL_ENGINE_MAP per-model engine narrowing
 *   - hand_combo encoded value (hand + ownership_type)
 *   - visibility radio with B2C/both locked behind "בקרוב"
 *   - sr-only live regions for combo/price announcements
 *   - submit payload shape + ID-photo attach-on-create
 *
 * NEW in this commit:
 *   - 3-step gating via react-hook-form trigger(stepFields)
 *   - Stepper UI (clickable BACK only)
 *   - Autosave to localStorage every 800ms (keyed per mode + edit id)
 *   - Draft-restore Alert at top on open if a <24h draft exists
 *   - "שמור טיוטה" button writes + closes
 *   - Successful submit clears the draft
 *   - shadcn Dialog/Button/Input/Label/Select/Textarea/Tabs throughout
 *   - lucide icons replace 📋/📷/🖼️/✏️/✦/💡/⏳/✓ glyphs
 *   - ink/paper/accent/muted/hairline token sweep
 *
 * Followed by commit 5 (drop zone in step 3 create mode + smart polish).
 */

export type Visibility = "private" | "b2b" | "b2c" | "both";
export type WarrantyType = "manufacturer" | "dealer" | "extended" | "none";
export type OwnershipType = "private" | "dealer" | "leasing" | "rental" | "government";

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
  purchase_cost: number | null;
  warranty_type: WarrantyType | null;
  warranty_until: string | null;
  hand: number | null;
  ownership_type: OwnershipType | null;
};

const HAND_OPTIONS: Array<{
  value: string;
  label: string;
  hand: number | null;
  ownership: OwnershipType | null;
}> = [
  { value: "", label: "בחר יד…", hand: null, ownership: null },
  { value: "1-private", label: "יד 1 — פרטית", hand: 1, ownership: "private" },
  { value: "2-private", label: "יד 2 — פרטית", hand: 2, ownership: "private" },
  { value: "3-private", label: "יד 3 — פרטית", hand: 3, ownership: "private" },
  { value: "4-private", label: "יד 4+ — פרטית", hand: 4, ownership: "private" },
  { value: "1-dealer", label: "יד 1 — סוחר", hand: 1, ownership: "dealer" },
  { value: "2-dealer", label: "יד 2 — סוחר", hand: 2, ownership: "dealer" },
  { value: "3-dealer", label: "יד 3+ — סוחר", hand: 3, ownership: "dealer" },
  { value: "leasing", label: "ליסינג", hand: null, ownership: "leasing" },
  { value: "rental", label: "השכרה", hand: null, ownership: "rental" },
  { value: "government", label: "ממשלתי / רשות", hand: null, ownership: "government" },
];

function encodeHand(
  hand: number | null | undefined,
  ownership: OwnershipType | null | undefined,
): string {
  if (!ownership) return "";
  if (ownership === "leasing" || ownership === "rental" || ownership === "government") {
    return ownership;
  }
  if (hand == null) return "";
  return `${hand}-${ownership}`;
}

function decodeHand(value: string): { hand: number | null; ownership: OwnershipType | null } {
  const opt = HAND_OPTIONS.find((o) => o.value === value);
  if (!opt) return { hand: null, ownership: null };
  return { hand: opt.hand, ownership: opt.ownership };
}

export type InventoryInitial = Partial<InventoryPayload> & { id?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InventoryPayload) => Promise<{ id: string } | void>;
  initial?: InventoryInitial | null;
  mode: "create" | "edit";
  token?: string | null;
  onManageImages?: (vehicleId: string) => void;
  imageCount?: number;
};

const IL_NUMERIC = /^\d+$/;

const ENGINE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "בחר נפח מנוע…" },
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

const MODEL_ENGINE_MAP: Record<string, string[]> = {
  "toyota|corolla": ["1.6", "1.8", "2.0"],
  "טויוטה|קורולה": ["1.6", "1.8", "2.0"],
  "toyota|yaris": ["1.0", "1.2", "1.5"],
  "טויוטה|יאריס": ["1.0", "1.2", "1.5"],
  "toyota|rav4": ["2.0", "2.5"],
  "טויוטה|rav4": ["2.0", "2.5"],
  "toyota|chr": ["1.2", "1.8", "2.0"],
  "טויוטה|chr": ["1.2", "1.8", "2.0"],
  "toyota|camry": ["2.0", "2.5"],
  "טויוטה|קאמרי": ["2.0", "2.5"],
  "hyundai|i20": ["1.0", "1.2", "1.4"],
  "יונדאי|i20": ["1.0", "1.2", "1.4"],
  "hyundai|i30": ["1.4", "1.6", "2.0"],
  "יונדאי|i30": ["1.4", "1.6", "2.0"],
  "hyundai|tucson": ["1.6", "2.0", "2.5"],
  "יונדאי|טוסון": ["1.6", "2.0", "2.5"],
  "hyundai|kona": ["1.0", "1.6"],
  "יונדאי|קונה": ["1.0", "1.6"],
  "kia|picanto": ["1.0", "1.2"],
  "קיה|פיקנטו": ["1.0", "1.2"],
  "kia|rio": ["1.2", "1.4"],
  "קיה|ריו": ["1.2", "1.4"],
  "kia|sportage": ["1.6", "2.0", "2.5"],
  "קיה|ספורטאז'": ["1.6", "2.0", "2.5"],
  "kia|niro": ["1.6"],
  "קיה|נירו": ["1.6"],
  "mazda|3": ["1.5", "2.0", "2.5"],
  "מאזדה|3": ["1.5", "2.0", "2.5"],
  "mazda|cx-5": ["2.0", "2.5"],
  "מאזדה|cx-5": ["2.0", "2.5"],
  "skoda|octavia": ["1.0", "1.4", "1.5", "2.0"],
  "סקודה|אוקטביה": ["1.0", "1.4", "1.5", "2.0"],
  "skoda|kodiaq": ["1.5", "2.0"],
  "סקודה|קודיאק": ["1.5", "2.0"],
  "bmw|3 series": ["2.0", "3.0"],
  "ב.מ.וו|סדרה 3": ["2.0", "3.0"],
  "ב.מ.וו|3": ["2.0", "3.0"],
  "bmw|5 series": ["2.0", "3.0"],
  "ב.מ.וו|5": ["2.0", "3.0"],
  "bmw|x1": ["1.5", "2.0"],
  "ב.מ.וו|x1": ["1.5", "2.0"],
  "bmw|x3": ["2.0", "3.0"],
  "ב.מ.וו|x3": ["2.0", "3.0"],
  "bmw|x5": ["3.0", "4.0"],
  "ב.מ.וו|x5": ["3.0", "4.0"],
  "mercedes|c class": ["1.5", "2.0", "3.0"],
  "מרצדס|c class": ["1.5", "2.0", "3.0"],
  "audi|a3": ["1.4", "1.5", "2.0"],
  "אודי|a3": ["1.4", "1.5", "2.0"],
  "audi|a4": ["2.0", "3.0"],
  "אודי|a4": ["2.0", "3.0"],
  "audi|q3": ["1.5", "2.0"],
  "אודי|q3": ["1.5", "2.0"],
  "volkswagen|polo": ["1.0", "1.2"],
  "פולקסווגן|פולו": ["1.0", "1.2"],
  "volkswagen|golf": ["1.0", "1.4", "1.5", "2.0"],
  "פולקסווגן|גולף": ["1.0", "1.4", "1.5", "2.0"],
  "volkswagen|tiguan": ["1.5", "2.0"],
  "פולקסווגן|טיגואן": ["1.5", "2.0"],
  "nissan|x-trail": ["1.6", "2.0", "2.5"],
  "ניסאן|x-trail": ["1.6", "2.0", "2.5"],
  "nissan|qashqai": ["1.6", "2.0"],
  "ניסאן|קשקאי": ["1.6", "2.0"],
  "nissan|juke": ["1.0", "1.6"],
  "ניסאן|ג'וק": ["1.0", "1.6"],
  "mitsubishi|outlander": ["2.0"],
  "מיצובישי|אאוטלנדר": ["2.0", "2.5"],
};

function modelEngineKey(make: string, model: string): string {
  return `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
}

const schema = z.object({
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
  hand_combo: z
    .string()
    .optional()
    .refine((v) => !v || HAND_OPTIONS.some((o) => o.value === v), "ערך לא תקין"),
});

type FormValues = z.infer<typeof schema>;

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
    visibility: (v?.visibility ?? "b2b") as Visibility,
    b2b_price: v?.b2b_price != null ? String(v.b2b_price) : "",
    b2c_price: v?.b2c_price != null ? String(v.b2c_price) : "",
    purchase_cost:
      (v as InventoryInitial & { purchase_cost?: number | null })?.purchase_cost != null
        ? String((v as { purchase_cost: number }).purchase_cost)
        : "",
    warranty_type: ((v as { warranty_type?: WarrantyType | null })?.warranty_type ??
      "") as FormValues["warranty_type"],
    warranty_until: (v as { warranty_until?: string | null })?.warranty_until ?? "",
    hand_combo: encodeHand(
      (v as InventoryInitial & { hand?: number | null })?.hand,
      (v as InventoryInitial & { ownership_type?: OwnershipType | null })?.ownership_type,
    ),
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

const STEP_FIELDS = {
  1: ["make", "model", "year", "mileage"] as const,
  2: ["price", "b2b_price", "b2c_price", "purchase_cost", "notes"] as const,
  3: ["warranty_until"] as const,
} as const;

type StepNum = 1 | 2 | 3;

const STEPS: Array<{ num: StepNum; label: string }> = [
  { num: 1, label: "רכב" },
  { num: 2, label: "מחיר" },
  { num: 3, label: "אחריות" },
];

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// ── Create-mode image queue constants ──────────────────────────────
// Match VehicleImagesDialog so the same MIME/size policy applies on both
// surfaces. The 10-image cap is enforced before submit; uploads happen
// fire-and-forget after the vehicle is created.
const QUEUE_MAX_IMAGES = 10;
const QUEUE_MAX_BYTES = 10 * 1024 * 1024;
const QUEUE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const QUEUE_ALLOWED_EXT = /\.(jpe?g|png|webp|heic)$/i;

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
    trigger,
    getValues,
    formState: { errors, isSubmitting },
    setError: setFieldError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: toFormValues(initial),
  });

  const watchMake = watch("make");
  const watchedModel = watch("model");
  const watchedYear = watch("year");
  const watchedMileage = watch("mileage");
  const watchedHandCombo = watch("hand_combo");
  const watchedVisibility = watch("visibility");
  const watchedFuel = watch("fuel_type");

  // ── Step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState<StepNum>(1);

  // ── Autofill tracking ──────────────────────────────────────────────
  const [autofilledFields, setAutofilledFields] = useState<Set<string>>(new Set());
  const clearAutofill = useCallback((field: string) => {
    setAutofilledFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  // ── Plate lookup ───────────────────────────────────────────────────
  const [plate, setPlate] = useState("");
  const [plateBusy, setPlateBusy] = useState(false);
  const [plateStatus, setPlateStatus] = useState<string>("");
  const [plateError, setPlateError] = useState<string>("");
  const [plateAutofilled, setPlateAutofilled] = useState(false);

  // ── Image lookup ───────────────────────────────────────────────────
  const imgInputRef = useRef<HTMLInputElement>(null);
  const imgGalleryRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgStatus, setImgStatus] = useState<string>("");
  const [imgError, setImgError] = useState<string>("");

  // ── Registration scan ─────────────────────────────────────────────
  const regInputRef = useRef<HTMLInputElement>(null);
  const [regBusy, setRegBusy] = useState(false);
  const [regStatus, setRegStatus] = useState<string>("");
  const [regError, setRegError] = useState<string>("");

  // ── Live regions ──────────────────────────────────────────────────
  const [comboStatus, setComboStatus] = useState<string>("");
  const [priceHintStatus, setPriceHintStatus] = useState<string>("");
  const lastAnnouncedPrice = useRef<number | null>(null);

  // ── Create-mode image queue ────────────────────────────────────────
  // Drop zone in step 3 (create mode only) collects File[] locally.
  // On submit success, each queued file is uploaded to the new vehicle
  // fire-and-forget (non-fatal — dealer can re-add if any fail).
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [queueErrors, setQueueErrors] = useState<string[]>([]);

  const handleQueuePick = useCallback(
    (files: File[]) => {
      const errs: string[] = [];
      const ok: File[] = [];
      const remaining = QUEUE_MAX_IMAGES - queuedFiles.length;
      for (const f of files) {
        if (!QUEUE_ALLOWED_MIME.has(f.type) && !QUEUE_ALLOWED_EXT.test(f.name)) {
          errs.push(`${f.name}: סוג קובץ לא נתמך`);
          continue;
        }
        if (f.size > QUEUE_MAX_BYTES) {
          errs.push(`${f.name}: גדול מ-10MB`);
          continue;
        }
        ok.push(f);
      }
      const capped = ok.slice(0, remaining);
      if (ok.length > capped.length) {
        errs.push(`ניתן להוסיף עוד ${remaining} תמונות בלבד`);
      }
      setQueueErrors(errs);
      if (capped.length) setQueuedFiles((prev) => [...prev, ...capped]);
    },
    [queuedFiles.length],
  );

  const removeQueuedFile = useCallback((index: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Market price hint + AI price estimate ─────────────────────────
  const [marketPriceHint, setMarketPriceHint] = useState<number | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<{
    price: number;
    confidence: "high" | "medium" | "low";
    breakdown: string;
  } | null>(null);
  const [priceEstimateBusy, setPriceEstimateBusy] = useState(false);

  const announcePrice = useCallback((price: number | null) => {
    if (price == null || price <= 0) return;
    if (lastAnnouncedPrice.current === price) return;
    lastAnnouncedPrice.current = price;
    setPriceHintStatus(`מחיר מחירון חדש: ${price.toLocaleString("he-IL")} שקלים`);
  }, []);

  // ── Reset when dialog opens ───────────────────────────────────────
  useEffect(() => {
    if (open) {
      reset(toFormValues(initial));
      setStep(1);
      setAutofilledFields(new Set());
      setPlate("");
      setPlateStatus("");
      setPlateError("");
      setPlateAutofilled(false);
      setImgFile(null);
      setImgStatus("");
      setImgError("");
      setRegStatus("");
      setRegError("");
      setComboStatus("");
      setMarketPriceHint(null);
      setPriceEstimate(null);
      setPriceHintStatus("");
      lastAnnouncedPrice.current = null;
      setQueuedFiles([]);
      setQueueErrors([]);
    }
  }, [open, initial, reset]);

  // ── Live market-price hint ────────────────────────────────────────
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

  // ── Live AI price estimate ────────────────────────────────────────
  useEffect(() => {
    if (!open || !token) return;
    const yearNum = parseInt(String(watchedYear), 10);
    const mileageNum = parseInt(String(watchedMileage), 10);
    const allValid =
      !!watchMake &&
      !!watchedModel &&
      Number.isFinite(yearNum) &&
      yearNum >= 1900 &&
      yearNum <= 2030 &&
      Number.isFinite(mileageNum) &&
      mileageNum >= 0;
    if (!allValid) {
      setPriceEstimate(null);
      return;
    }

    const decoded = decodeHand(String(watchedHandCombo ?? ""));

    const timer = setTimeout(async () => {
      setPriceEstimateBusy(true);
      try {
        const res = await apiFetch<{
          estimated_price: number | null;
          confidence: "high" | "medium" | "low" | "unavailable";
          breakdown: string;
        }>("/api/v1/inventory/price-estimate", {
          method: "POST",
          token,
          body: JSON.stringify({
            make: watchMake,
            model: watchedModel,
            year: yearNum,
            mileage: mileageNum,
            hand: decoded.hand,
            ownership_type: decoded.ownership,
          }),
        });
        if (res.estimated_price && res.estimated_price > 0) {
          setPriceEstimate({
            price: res.estimated_price,
            confidence: res.confidence === "unavailable" ? "low" : res.confidence,
            breakdown: res.breakdown,
          });
        } else {
          setPriceEstimate(null);
        }
      } catch {
        setPriceEstimate(null);
      } finally {
        setPriceEstimateBusy(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [open, token, watchMake, watchedModel, watchedYear, watchedMileage, watchedHandCombo]);

  // ── Autofill apply ────────────────────────────────────────────────
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
      setPlateStatus("הפרטים מולאו אוטומטית");
    } catch (e) {
      setPlateStatus("");
      setPlateError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setPlateBusy(false);
    }
  };

  const runRegistrationScan = async (file: File) => {
    if (!token) return;
    setRegBusy(true);
    setRegError("");
    setRegStatus("סורק רישיון רכב…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/inventory/scan-registration`,
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
      const data = (await res.json()) as {
        plate_number: string | null;
        make: string | null;
        model: string | null;
        year: number | null;
        engine_volume: number | null;
        fuel_type: FuelType | null;
        color: string | null;
        ownership_type: OwnershipType | null;
      };

      const filled: string[] = [];

      if (data.plate_number) {
        setPlate(data.plate_number);
        setPlateAutofilled(true);
      }
      if (data.make) {
        const canonMake = matchMake(data.make) ?? data.make;
        setValue("make", canonMake, { shouldValidate: true });
        filled.push("make");
        if (data.model) {
          const canonModel = matchModel(canonMake, data.model) ?? data.model;
          setValue("model", canonModel, { shouldValidate: true });
          filled.push("model");
        }
      } else if (data.model) {
        setValue("model", data.model, { shouldValidate: true });
        filled.push("model");
      }
      if (data.year) {
        setValue("year", String(data.year), { shouldValidate: true });
        filled.push("year");
      }
      if (data.color) {
        setValue("color", data.color, { shouldValidate: true });
        filled.push("color");
      }
      if (data.fuel_type) {
        setValue("fuel_type", data.fuel_type, { shouldValidate: true });
        filled.push("fuel_type");
      }
      if (data.engine_volume != null && data.engine_volume > 0) {
        const ev = String(data.engine_volume);
        const allowed = ENGINE_OPTIONS.map((o) => o.value);
        if (allowed.includes(ev)) {
          setValue("engine_volume", ev as FormValues["engine_volume"], {
            shouldValidate: true,
          });
          filled.push("engine_volume");
        }
      }
      if (data.ownership_type) {
        const ownership = data.ownership_type;
        const fallbackHand = ownership === "private" || ownership === "dealer" ? 1 : null;
        const encoded = encodeHand(fallbackHand, ownership);
        if (encoded) {
          setValue("hand_combo", encoded, { shouldValidate: true });
          filled.push("hand_combo");
        }
      }
      setAutofilledFields((prev) => {
        const next = new Set(prev);
        filled.forEach((f) => next.add(f));
        return next;
      });

      setRegStatus(
        filled.length
          ? `הרישיון נסרק — מולאו ${filled.length} שדות אוטומטית. בדוק ועדכן לפני שמירה.`
          : "הרישיון נסרק — לא ניתן היה לחלץ שדות. נסה תמונה ברורה יותר.",
      );
    } catch (e) {
      setRegError(e instanceof Error ? e.message : "שגיאה בסריקת הרישיון");
      setRegStatus("");
    } finally {
      setRegBusy(false);
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
      const plateDigits = data.plate_number ? data.plate_number.replace(/\D/g, "") : "";
      const plateLooksValid = plateDigits.length >= 6 && plateDigits.length <= 9;
      if (data.plate_number && plateLooksValid) {
        setPlate(data.plate_number);
        setPlateAutofilled(true);
        setPlateError("");
      } else if (data.plate_number && !plateLooksValid) {
        setPlate("");
        setPlateAutofilled(false);
        setPlateError(
          `זוהה מספר רכב חלקי בתמונה (${data.plate_number}) — אנא הזן ידנית את המספר המלא`,
        );
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
        setImgStatus("הרכב זוהה");
      } else if (data.plate_number) {
        setComboStatus(`מספר רכב זוהה מהתמונה: ${data.plate_number} — אנא מלא את שאר הפרטים`);
        setImgStatus("מספר רכב זוהה");
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

  // ── Autosave to localStorage ───────────────────────────────────────
  const draftKey = `inv-form-draft-${mode}-${initial?.id ?? "new"}`;
  const [draftRestoreAvailable, setDraftRestoreAvailable] = useState<{ savedAt: number } | null>(
    null,
  );

  // Check draft on open
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        setDraftRestoreAvailable(null);
        return;
      }
      const parsed = JSON.parse(raw) as { values: FormValues; savedAt: number };
      const age = Date.now() - parsed.savedAt;
      if (age > DRAFT_TTL_MS) {
        localStorage.removeItem(draftKey);
        setDraftRestoreAvailable(null);
        return;
      }
      const hasContent = !!(
        parsed.values.make ||
        parsed.values.model ||
        parsed.values.year ||
        parsed.values.mileage ||
        parsed.values.price
      );
      setDraftRestoreAvailable(hasContent ? { savedAt: parsed.savedAt } : null);
      if (!hasContent) localStorage.removeItem(draftKey);
    } catch {
      setDraftRestoreAvailable(null);
    }
  }, [open, draftKey]);

  // Debounced save (800ms after last field change)
  const allValues = watch();
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      try {
        const hasContent = !!(
          allValues.make ||
          allValues.model ||
          allValues.year ||
          allValues.mileage ||
          allValues.price
        );
        if (!hasContent) return;
        localStorage.setItem(draftKey, JSON.stringify({ values: allValues, savedAt: Date.now() }));
      } catch {
        // localStorage full — silent
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [allValues, open, draftKey]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { values: FormValues };
      reset(parsed.values);
      setDraftRestoreAvailable(null);
    } catch {
      localStorage.removeItem(draftKey);
      setDraftRestoreAvailable(null);
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    setDraftRestoreAvailable(null);
  };

  const saveDraftAndClose = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values: getValues(), savedAt: Date.now() }));
    } catch {
      // silent
    }
    onOpenChange(false);
  };

  // ── Step navigation ────────────────────────────────────────────────
  const goNext = async () => {
    const ok = await trigger([...STEP_FIELDS[step]] as (keyof FormValues)[]);
    if (!ok) return;
    setStep((s) => (s < 3 ? ((s + 1) as StepNum) : s));
  };

  const goPrev = () => {
    setStep((s) => (s > 1 ? ((s - 1) as StepNum) : s));
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const submit = handleSubmit(async (values) => {
    const handDecoded = decodeHand(values.hand_combo ?? "");
    const payload: InventoryPayload = {
      make: values.make,
      model: values.model,
      year: parseInt(values.year, 10),
      mileage: parseInt(values.mileage, 10),
      price: parseInt(values.price, 10),
      color: values.color ? values.color : null,
      transmission: values.transmission === "" ? null : (values.transmission ?? null),
      fuel_type: values.fuel_type === "" ? null : (values.fuel_type ?? null),
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
      hand: handDecoded.hand,
      ownership_type: handDecoded.ownership,
    };
    try {
      const created = await onSubmit(payload);
      // Clear the autosaved draft on success.
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // silent
      }
      const fileToAttach = mode === "create" ? imgFile : null;
      const newId = mode === "create" && created ? created.id : null;
      const queuedToAttach = mode === "create" ? queuedFiles : [];
      onOpenChange(false);
      reset(toFormValues(null));
      if (newId && token) {
        // Fire-and-forget uploads. AI identification photo first (so it
        // becomes position 1), then any queued gallery files in order.
        // Non-fatal failures — vehicle exists, dealer can re-upload.
        const uploadOne = (file: File) => {
          const form = new FormData();
          form.append("file", file);
          return fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/inventory/${newId}/images`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          ).catch(() => {
            // Silent — non-fatal
          });
        };
        if (fileToAttach) void uploadOne(fileToAttach);
        for (const f of queuedToAttach) void uploadOne(f);
      }
    } catch (e) {
      setFieldError("root", {
        message: e instanceof Error ? e.message : "שגיאה בשליחה",
      });
    }
  });

  const title = mode === "create" ? "הוספת רכב" : "עריכת רכב";
  const draftRel = draftRestoreAvailable
    ? formatRelativeTime(new Date(draftRestoreAvailable.savedAt).toISOString())
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        aria-describedby="inv-form-desc"
        className="max-h-[90dvh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="inv-form-desc">
            שדות חובה מסומנים{" "}
            <span aria-hidden="true" className="text-danger-fg">
              *
            </span>
          </DialogDescription>
        </DialogHeader>

        <Stepper
          step={step}
          onJump={(s) => {
            if (s < step) setStep(s);
          }}
        />

        {/* sr-only live regions for combo/price announcements */}
        {comboStatus ? (
          <p role="status" aria-live="polite" className="sr-only" key={comboStatus}>
            {comboStatus}
          </p>
        ) : null}
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

        {/* Draft restore */}
        {draftRestoreAvailable && draftRel ? (
          <Alert className="mt-md">
            <FileText aria-hidden="true" />
            <AlertDescription>
              <div className="gap-md flex flex-wrap items-center justify-between">
                <span>
                  טיוטה שמורה מ-<span className="font-tabular">{draftRel.visual}</span>
                </span>
                <div className="gap-xs flex">
                  <Button type="button" size="sm" variant="outline" onClick={discardDraft}>
                    מחק
                  </Button>
                  <Button type="button" size="sm" onClick={restoreDraft}>
                    שחזר
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {errors.root?.message ? (
          <Alert variant="destructive" className="mt-md">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} noValidate className="mt-lg">
          {step === 1 ? (
            <Step1
              register={register}
              setValue={setValue}
              watch={watch}
              errors={errors}
              clearAutofill={clearAutofill}
              autofilledFields={autofilledFields}
              watchMake={watchMake}
              watchedFuel={watchedFuel}
              plate={plate}
              setPlate={setPlate}
              plateBusy={plateBusy}
              plateStatus={plateStatus}
              plateError={plateError}
              plateAutofilled={plateAutofilled}
              setPlateAutofilled={setPlateAutofilled}
              runPlateLookup={runPlateLookup}
              imgInputRef={imgInputRef}
              imgGalleryRef={imgGalleryRef}
              imgFile={imgFile}
              setImgFile={setImgFile}
              imgBusy={imgBusy}
              imgStatus={imgStatus}
              imgError={imgError}
              runImageLookup={runImageLookup}
              regInputRef={regInputRef}
              regBusy={regBusy}
              regStatus={regStatus}
              regError={regError}
              runRegistrationScan={runRegistrationScan}
              setComboStatus={setComboStatus}
            />
          ) : null}

          {step === 2 ? (
            <Step2
              register={register}
              errors={errors}
              watchedVisibility={watchedVisibility}
              priceEstimateBusy={priceEstimateBusy}
              priceEstimate={priceEstimate}
              marketPriceHint={marketPriceHint}
            />
          ) : null}

          {step === 3 ? (
            <Step3
              register={register}
              setValue={setValue}
              watch={watch}
              errors={errors}
              mode={mode}
              initialId={initial?.id}
              imageCount={imageCount}
              onManageImages={onManageImages}
              queuedFiles={queuedFiles}
              onQueuePick={handleQueuePick}
              onQueueRemove={removeQueuedFile}
              queueErrors={queueErrors}
            />
          ) : null}

          {/* Footer */}
          <div className="border-hairline mt-2xl pt-lg gap-md flex flex-col-reverse border-t sm:flex-row sm:items-center sm:justify-between">
            <div className="gap-xs flex flex-col-reverse sm:flex-row">
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={goPrev} disabled={isSubmitting}>
                  הקודם
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={saveDraftAndClose}
                disabled={isSubmitting}
              >
                שמור טיוטה
              </Button>
            </div>
            <div className="gap-xs flex flex-col-reverse sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                ביטול
              </Button>
              {step < 3 ? (
                <Button type="button" onClick={() => void goNext()} disabled={isSubmitting}>
                  הבא
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
                  {isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      <span>שומר…</span>
                    </>
                  ) : mode === "create" ? (
                    "הוסף רכב"
                  ) : (
                    "שמור שינויים"
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Stepper — 3-circle indicator with accent connectors for completed segments.
// Clickable BACK only; forward gating goes through the goNext() validator.
// ============================================================================

function Stepper({ step, onJump }: { step: StepNum; onJump: (s: StepNum) => void }) {
  return (
    <ol className="mt-md flex items-start gap-0" aria-label="שלבי הטופס">
      {STEPS.map((s, i) => {
        const isCompleted = s.num < step;
        const isActive = s.num === step;
        const canJump = s.num < step;
        const label =
          `שלב ${s.num} מתוך 3 — ${s.label}` +
          (isCompleted ? " (הושלם)" : isActive ? " (נוכחי)" : " (ממתין)");
        return (
          <Fragment key={s.num}>
            <li className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => canJump && onJump(s.num)}
                disabled={!canJump}
                aria-current={isActive ? "step" : undefined}
                aria-label={label}
                className={[
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm",
                  "duration-fast transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  isCompleted ? "bg-accent text-accent-ink border-accent cursor-pointer" : "",
                  isActive ? "border-ink bg-paper text-ink font-medium" : "",
                  !isCompleted && !isActive ? "border-hairline bg-paper text-subtle" : "",
                  !canJump && !isActive ? "cursor-default" : "",
                ].join(" ")}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <span className="font-tabular">{s.num}</span>
                )}
              </button>
              <span
                className={[
                  "mt-xs text-xs font-medium",
                  isActive ? "text-ink" : isCompleted ? "text-muted" : "text-subtle",
                ].join(" ")}
              >
                {s.label}
              </span>
            </li>
            {i < STEPS.length - 1 ? (
              <li aria-hidden="true" className="mt-4 flex-1">
                <span
                  className={[
                    "duration-fast block h-px w-full transition-colors",
                    isCompleted ? "bg-accent" : "bg-hairline",
                  ].join(" ")}
                />
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}

// ============================================================================
// Step 1 — Vehicle identity. Three auto-fill paths consolidated into a
// shadcn Tabs row (collapsed by default, each tab expands its panel inline)
// followed by the manual entry grid.
// ============================================================================

type Step1Props = {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  clearAutofill: (field: string) => void;
  autofilledFields: Set<string>;
  watchMake: string;
  watchedFuel: FormValues["fuel_type"];
  plate: string;
  setPlate: (v: string) => void;
  plateBusy: boolean;
  plateStatus: string;
  plateError: string;
  plateAutofilled: boolean;
  setPlateAutofilled: (v: boolean) => void;
  runPlateLookup: () => Promise<void>;
  imgInputRef: React.RefObject<HTMLInputElement>;
  imgGalleryRef: React.RefObject<HTMLInputElement>;
  imgFile: File | null;
  setImgFile: (f: File | null) => void;
  imgBusy: boolean;
  imgStatus: string;
  imgError: string;
  runImageLookup: () => Promise<void>;
  regInputRef: React.RefObject<HTMLInputElement>;
  regBusy: boolean;
  regStatus: string;
  regError: string;
  runRegistrationScan: (file: File) => Promise<void>;
  setComboStatus: (v: string) => void;
};

function Step1(p: Step1Props) {
  const watchedMake = p.watch("make");
  const watchedModel = p.watch("model");

  return (
    <div className="space-y-xl">
      {/* ── Auto-fill tabs ─────────────────────────────────────────── */}
      <section aria-labelledby="autofill-heading">
        <div className="gap-xxs flex items-center">
          <Sparkles aria-hidden="true" className="text-accent h-3.5 w-3.5" />
          <p
            id="autofill-heading"
            className="text-muted text-xs font-medium uppercase tracking-widest"
          >
            מילוי אוטומטי (אופציונלי)
          </p>
        </div>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <Tabs defaultValue="registration" className="mt-md">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="registration">
              <FileText aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="ms-1 hidden sm:inline">רישיון רכב</span>
              <span className="ms-1 sm:hidden">רישיון</span>
            </TabsTrigger>
            <TabsTrigger value="plate">
              <span className="ms-1">מספר רכב</span>
            </TabsTrigger>
            <TabsTrigger value="image">
              <Camera aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="ms-1 hidden sm:inline">תמונה</span>
              <span className="ms-1 sm:hidden">תמונה</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registration" className="mt-md">
            <p className="text-muted text-xs">
              צלם או העלה תמונה של רישיון הרכב — Claude AI יחלץ אוטומטית את כל הפרטים.
            </p>
            <input
              ref={p.regInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void p.runRegistrationScan(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              onClick={() => p.regInputRef.current?.click()}
              disabled={p.regBusy}
              aria-busy={p.regBusy || undefined}
              variant="outline"
              className="mt-sm"
            >
              {p.regBusy ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  <span>סורק…</span>
                </>
              ) : (
                <>
                  <FileText aria-hidden="true" />
                  <span>סרוק רישיון רכב</span>
                </>
              )}
            </Button>
            {p.regStatus ? (
              <p
                role="status"
                aria-live="polite"
                className="text-muted mt-xs text-xs"
                key={p.regStatus}
              >
                {p.regStatus}
              </p>
            ) : null}
            {p.regError ? (
              <Alert variant="destructive" className="mt-xs">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{p.regError}</AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>

          <TabsContent value="plate" className="mt-md">
            <Label htmlFor="plate-lookup-input">מספר רכב</Label>
            <p id="plate-lookup-hint" className="text-muted mt-xxs text-xs">
              <span className="font-tabular">7</span> או <span className="font-tabular">8</span>{" "}
              ספרות, עם או בלי מקפים
            </p>
            <div className="gap-xs mt-xs flex flex-col sm:flex-row">
              <Input
                id="plate-lookup-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={p.plate}
                onChange={(e) => {
                  p.setPlate(e.target.value);
                  if (p.plateAutofilled) p.setPlateAutofilled(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void p.runPlateLookup();
                  }
                }}
                aria-describedby={
                  p.plateAutofilled ? "plate-lookup-hint plate-lookup-source" : "plate-lookup-hint"
                }
                className="font-tabular flex-1"
              />
              {p.plateAutofilled ? (
                <span id="plate-lookup-source" className="sr-only">
                  זוהה אוטומטית מהתמונה — ניתן לערוך
                </span>
              ) : null}
              <Button
                type="button"
                onClick={() => void p.runPlateLookup()}
                disabled={p.plateBusy}
                aria-busy={p.plateBusy || undefined}
              >
                {p.plateBusy ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    <span>מחפש…</span>
                  </>
                ) : (
                  "חפש"
                )}
              </Button>
            </div>
            {p.plateStatus ? (
              <p
                role="status"
                aria-live="polite"
                className="text-accent gap-xxs mt-xs inline-flex items-center text-sm"
              >
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {p.plateStatus}
              </p>
            ) : null}
            {p.plateError ? (
              <Alert variant="destructive" className="mt-xs">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{p.plateError}</AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>

          <TabsContent value="image" className="mt-md">
            <p className="text-muted text-xs">
              צלם או בחר תמונה של הרכב — Claude AI יזהה יצרן, דגם, שנה וצבע.
            </p>
            <input
              ref={p.imgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              className="sr-only"
              aria-label="צילום תמונת רכב במצלמה"
              onChange={(e) => p.setImgFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={p.imgGalleryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              aria-label="בחירת תמונת רכב מהגלריה"
              onChange={(e) => p.setImgFile(e.target.files?.[0] ?? null)}
            />
            <div className="gap-xs mt-sm flex flex-col sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => p.imgInputRef.current?.click()}
                className="flex-1"
              >
                <Camera aria-hidden="true" />
                <span>צלם תמונה</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => p.imgGalleryRef.current?.click()}
                className="flex-1"
              >
                <ImageIcon aria-hidden="true" />
                <span>בחר מהגלריה</span>
              </Button>
            </div>
            {p.imgFile ? (
              <p className="text-muted mt-xs font-tabular text-xs" key={p.imgFile.name}>
                נבחר: {p.imgFile.name}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={() => void p.runImageLookup()}
              disabled={!p.imgFile || p.imgBusy}
              aria-busy={p.imgBusy || undefined}
              className="mt-sm w-full"
            >
              {p.imgBusy ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  <span>מזהה…</span>
                </>
              ) : (
                "זהה רכב מתמונה"
              )}
            </Button>
            {p.imgStatus ? (
              <p
                role="status"
                aria-live="polite"
                className="text-accent gap-xxs mt-xs inline-flex items-center text-sm"
              >
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {p.imgStatus}
              </p>
            ) : null}
            {p.imgError ? (
              <Alert variant="destructive" className="mt-xs">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{p.imgError}</AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>
        </Tabs>
      </section>

      {/* ── Manual entry ──────────────────────────────────────────── */}
      <section aria-labelledby="vehicle-heading">
        <p
          id="vehicle-heading"
          className="text-muted text-xs font-medium uppercase tracking-widest"
        >
          פרטי הרכב
        </p>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <div className="gap-md mt-lg grid sm:grid-cols-2">
          <SearchableSelect
            id="inv-make"
            label="יצרן"
            value={watchedMake}
            onChange={(v) => {
              p.setValue("make", v, { shouldValidate: true });
              p.setValue("model", "", { shouldValidate: true });
              p.clearAutofill("make");
              p.clearAutofill("model");
            }}
            options={CAR_MAKES}
            placeholder="בחר יצרן…"
            required
            autofilled={p.autofilledFields.has("make")}
            error={p.errors.make?.message}
            onBlurInvalid={() => p.setComboStatus("נא בחר יצרן מהרשימה — הוחזר לערך הקודם")}
          />
          <SearchableSelect
            id="inv-model"
            label="דגם"
            value={watchedModel}
            onChange={(v) => {
              p.setValue("model", v, { shouldValidate: true });
              p.clearAutofill("model");
            }}
            options={getModelsForMake(p.watchMake)}
            placeholder="בחר דגם…"
            required
            disabled={!p.watchMake}
            disabledHint="בחר יצרן תחילה"
            autofilled={p.autofilledFields.has("model")}
            error={p.errors.model?.message}
            onBlurInvalid={() => p.setComboStatus("נא בחר דגם מהרשימה — הוחזר לערך הקודם")}
          />
          <HighlightedField
            id="inv-year"
            label="שנה"
            required
            hint="ארבע ספרות"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            registration={p.register("year", {
              onChange: () => p.clearAutofill("year"),
            })}
            error={p.errors.year?.message}
            autofilled={p.autofilledFields.has("year")}
          />
          <SelectShadcn
            id="inv-hand"
            label="יד / סוג בעלות"
            value={p.watch("hand_combo") ?? ""}
            onChange={(v) => p.setValue("hand_combo", v, { shouldValidate: true })}
            options={HAND_OPTIONS}
            error={p.errors.hand_combo?.message}
          />
          <HighlightedField
            id="inv-mileage"
            label="קילומטראז׳"
            required
            inputMode="numeric"
            autoComplete="off"
            registration={p.register("mileage", {
              onChange: () => p.clearAutofill("mileage"),
            })}
            error={p.errors.mileage?.message}
          />
          <HighlightedField
            id="inv-color"
            label="צבע"
            autoComplete="off"
            registration={p.register("color", {
              onChange: () => p.clearAutofill("color"),
            })}
            error={p.errors.color?.message}
            autofilled={p.autofilledFields.has("color")}
          />
          <SelectShadcn
            id="inv-transmission"
            label="תיבת הילוכים"
            value={p.watch("transmission") ?? ""}
            onChange={(v) =>
              p.setValue("transmission", v as FormValues["transmission"], {
                shouldValidate: true,
              })
            }
            options={[
              { value: "", label: "בחירה…" },
              { value: "automatic", label: "אוטומט" },
              { value: "manual", label: "ידני" },
            ]}
            error={p.errors.transmission?.message}
          />
          <SelectShadcn
            id="inv-fuel"
            label="סוג דלק"
            value={p.watch("fuel_type") ?? ""}
            onChange={(v) => {
              p.setValue("fuel_type", v as FormValues["fuel_type"], { shouldValidate: true });
              p.clearAutofill("fuel_type");
            }}
            options={[
              { value: "", label: "בחירה…" },
              { value: "petrol", label: "בנזין" },
              { value: "diesel", label: "דיזל" },
              { value: "electric", label: "חשמלי" },
              { value: "hybrid", label: "היברידי" },
            ]}
            error={p.errors.fuel_type?.message}
            autofilled={p.autofilledFields.has("fuel_type")}
          />
          {p.watchedFuel === "electric" ? (
            <div>
              <Label>נפח מנוע</Label>
              <p className="border-hairline bg-muted/5 text-muted px-md mt-xs inline-flex h-10 w-full items-center rounded-md border text-sm">
                חשמלי (ללא מנוע)
              </p>
            </div>
          ) : (
            <SelectShadcn
              id="inv-engine"
              label="נפח מנוע (ליטרים)"
              value={p.watch("engine_volume") ?? ""}
              onChange={(v) =>
                p.setValue("engine_volume", v as FormValues["engine_volume"], {
                  shouldValidate: true,
                })
              }
              options={(() => {
                const m = String(p.watch("make") ?? "");
                const mo = String(p.watch("model") ?? "");
                if (!m || !mo) return ENGINE_OPTIONS;
                const allowed = MODEL_ENGINE_MAP[modelEngineKey(m, mo)];
                if (!allowed) return ENGINE_OPTIONS;
                const allowedSet = new Set(allowed);
                return ENGINE_OPTIONS.filter((o) => o.value === "" || allowedSet.has(o.value));
              })()}
              error={p.errors.engine_volume?.message}
            />
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Step 2 — Commercial: price, AI hint, visibility, b2b/b2c, purchase_cost,
// notes.
// ============================================================================

type Step2Props = {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  watchedVisibility: FormValues["visibility"];
  priceEstimateBusy: boolean;
  priceEstimate: {
    price: number;
    confidence: "high" | "medium" | "low";
    breakdown: string;
  } | null;
  marketPriceHint: number | null;
};

function Step2(p: Step2Props) {
  const confidenceLabel = p.priceEstimate
    ? {
        high: "ביטחון גבוה",
        medium: "ביטחון בינוני",
        low: "ביטחון נמוך",
      }[p.priceEstimate.confidence]
    : "";

  return (
    <div className="space-y-xl">
      <section aria-labelledby="pricing-heading">
        <p
          id="pricing-heading"
          className="text-muted text-xs font-medium uppercase tracking-widest"
        >
          פירוט מסחרי
        </p>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <div className="gap-md mt-lg grid sm:grid-cols-2">
          <HighlightedField
            id="inv-price"
            label="מחיר מבוקש ₪"
            required
            inputMode="numeric"
            autoComplete="off"
            registration={p.register("price")}
            error={p.errors.price?.message}
            hint={
              p.priceEstimateBusy ? (
                <span className="gap-xxs inline-flex items-center">
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                  מחשב הערכת מחיר שוק…
                </span>
              ) : p.priceEstimate ? (
                <span>
                  <span className="gap-xxs text-accent inline-flex items-center font-medium">
                    <Sparkles aria-hidden="true" className="h-3 w-3" />
                    מחיר שוק משוער:{" "}
                    <span className="font-tabular">
                      ₪{p.priceEstimate.price.toLocaleString("he-IL")}
                    </span>
                  </span>
                  <span className="text-muted"> · {confidenceLabel}</span>
                  <span className="text-subtle mt-xxs block text-[11px]">
                    {p.priceEstimate.breakdown}
                  </span>
                </span>
              ) : p.marketPriceHint ? (
                <span className="gap-xxs text-muted inline-flex items-center">
                  <Lightbulb aria-hidden="true" className="h-3 w-3" />
                  מחיר מחירון רכב חדש:{" "}
                  <span className="font-tabular">
                    ₪{p.marketPriceHint.toLocaleString("he-IL")}
                  </span>{" "}
                  (לצורך השוואה בלבד)
                </span>
              ) : undefined
            }
          />
          <HighlightedField
            id="inv-purchase-cost"
            label="עלות קנייה ₪ (אופציונלי)"
            inputMode="numeric"
            autoComplete="off"
            registration={p.register("purchase_cost")}
            error={p.errors.purchase_cost?.message}
            hint="לצורך חישוב רווח אוטומטי בעת המכירה"
          />
        </div>

        <div className="mt-lg">
          <Label htmlFor="inv-notes">הערות</Label>
          <p id="inv-notes-hint" className="text-muted mt-xxs text-xs">
            עד <span className="font-tabular">2000</span> תווים. ההערות אינן מופיעות לצרכנים.
          </p>
          <Textarea
            id="inv-notes"
            rows={4}
            maxLength={2000}
            aria-describedby={
              p.errors.notes?.message ? "inv-notes-hint inv-notes-error" : "inv-notes-hint"
            }
            aria-invalid={p.errors.notes?.message ? true : undefined}
            {...p.register("notes")}
            className="mt-xs"
          />
          {p.errors.notes?.message ? (
            <p id="inv-notes-error" className="text-danger-fg mt-xxs text-sm">
              {p.errors.notes.message}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="visibility-heading">
        <p
          id="visibility-heading"
          className="text-muted text-xs font-medium uppercase tracking-widest"
        >
          חשיפת הרכב
        </p>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <div className="mt-lg space-y-2">
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
                "border-hairline px-md py-sm gap-sm bg-paper flex min-h-11 items-center rounded-md border",
                "duration-fast transition-colors",
                "focus-within:outline-accent focus-within:outline-none focus-within:outline focus-within:outline-2 focus-within:outline-offset-2",
                locked ? "cursor-not-allowed opacity-50" : "hover:bg-muted/5 cursor-pointer",
              ].join(" ")}
            >
              <input
                type="radio"
                value={v}
                disabled={locked}
                aria-describedby={locked ? `vis-${v}-soon` : undefined}
                {...p.register("visibility")}
                className="accent-ink"
              />
              <span className="text-ink text-sm font-medium">{label}</span>
              {locked ? (
                <Badge id={`vis-${v}-soon`} variant="outline" className="ms-auto font-normal">
                  בקרוב
                </Badge>
              ) : null}
            </label>
          ))}
        </div>

        {p.watchedVisibility === "b2b" || p.watchedVisibility === "both" ? (
          <div className="mt-md">
            <Label htmlFor="inv-b2b-price">מחיר B2B ₪ (אופציונלי)</Label>
            <p id="inv-b2b-price-hint" className="text-muted mt-xxs text-xs">
              אם לא הוזן — יוצג המחיר המבוקש הרגיל
            </p>
            <Input
              id="inv-b2b-price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              {...p.register("b2b_price")}
              aria-describedby="inv-b2b-price-hint"
              aria-invalid={p.errors.b2b_price?.message ? true : undefined}
              className="font-tabular mt-xs"
            />
            {p.errors.b2b_price?.message ? (
              <p className="text-danger-fg mt-xxs text-sm">{p.errors.b2b_price.message}</p>
            ) : null}
          </div>
        ) : null}

        {p.watchedVisibility === "b2c" || p.watchedVisibility === "both" ? (
          <div className="mt-md">
            <Label htmlFor="inv-b2c-price">מחיר קמעונאי ₪ (אופציונלי)</Label>
            <p id="inv-b2c-price-hint" className="text-muted mt-xxs text-xs">
              המחיר המוצג ללקוחות הקצה
            </p>
            <Input
              id="inv-b2c-price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              {...p.register("b2c_price")}
              aria-describedby="inv-b2c-price-hint"
              aria-invalid={p.errors.b2c_price?.message ? true : undefined}
              className="font-tabular mt-xs"
            />
            {p.errors.b2c_price?.message ? (
              <p className="text-danger-fg mt-xxs text-sm">{p.errors.b2c_price.message}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ============================================================================
// Step 3 — Warranty (optional) + images (link to manage on edit; drop zone
// will be added in commit 5 for create mode).
// ============================================================================

type Step3Props = {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  mode: "create" | "edit";
  initialId: string | undefined;
  imageCount?: number;
  onManageImages?: (vehicleId: string) => void;
  /** Create-mode image queue — built locally, uploaded post-create. */
  queuedFiles: File[];
  onQueuePick: (files: File[]) => void;
  onQueueRemove: (index: number) => void;
  queueErrors: string[];
};

function Step3(p: Step3Props) {
  return (
    <div className="space-y-xl">
      <section aria-labelledby="warranty-heading">
        <p
          id="warranty-heading"
          className="text-muted text-xs font-medium uppercase tracking-widest"
        >
          אחריות (אופציונלי)
        </p>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        <p className="text-muted mt-md text-sm">
          מלא רק אם יש לרכב אחריות בתוקף — יוצג לקונים בשוק.
        </p>

        <div className="gap-md mt-lg grid sm:grid-cols-2">
          <SelectShadcn
            id="inv-warranty-type"
            label="סוג אחריות"
            value={p.watch("warranty_type") ?? ""}
            onChange={(v) =>
              p.setValue("warranty_type", v as FormValues["warranty_type"], {
                shouldValidate: true,
              })
            }
            options={[
              { value: "", label: "בחר סוג אחריות…" },
              { value: "manufacturer", label: "אחריות יצרן" },
              { value: "dealer", label: "אחריות סוחר" },
              { value: "extended", label: "אחריות מורחבת" },
              { value: "none", label: "ללא אחריות" },
            ]}
            error={p.errors.warranty_type?.message}
          />
          <div>
            <Label htmlFor="inv-warranty-until">תוקף האחריות</Label>
            <Input
              id="inv-warranty-until"
              type="date"
              dir="ltr"
              {...p.register("warranty_until")}
              aria-invalid={p.errors.warranty_until?.message ? true : undefined}
              aria-describedby="inv-warranty-until-hint"
              className="font-tabular mt-xs"
            />
            <p id="inv-warranty-until-hint" className="text-muted mt-xxs text-xs">
              התאריך עד אליו האחריות בתוקף
            </p>
            {p.errors.warranty_until?.message ? (
              <p className="text-danger-fg mt-xxs text-sm">{p.errors.warranty_until.message}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="images-heading">
        <p id="images-heading" className="text-muted text-xs font-medium uppercase tracking-widest">
          תמונות
        </p>
        <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

        {p.mode === "create" || !p.initialId ? (
          <CreateModeImageQueue
            queuedFiles={p.queuedFiles}
            onQueuePick={p.onQueuePick}
            onQueueRemove={p.onQueueRemove}
            queueErrors={p.queueErrors}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (p.initialId && p.onManageImages) p.onManageImages(p.initialId);
            }}
            className="mt-md"
          >
            <ImageIcon aria-hidden="true" />
            <span>
              ניהול תמונות
              {p.imageCount != null ? (
                <>
                  {" "}
                  (<span className="font-tabular">{p.imageCount}</span>)
                </>
              ) : null}
            </span>
          </Button>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// CreateModeImageQueue — drop zone + thumbnail previews for the create flow.
// Files are uploaded fire-and-forget after the vehicle is created (the
// parent's submit handler reads `queuedFiles` and POSTs to /images).
// ============================================================================

function CreateModeImageQueue({
  queuedFiles,
  onQueuePick,
  onQueueRemove,
  queueErrors,
}: {
  queuedFiles: File[];
  onQueuePick: (files: File[]) => void;
  onQueueRemove: (index: number) => void;
  queueErrors: string[];
}) {
  // Build local object-URL previews and revoke when the file list changes
  // or the component unmounts.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = queuedFiles.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [queuedFiles]);

  const remaining = QUEUE_MAX_IMAGES - queuedFiles.length;

  return (
    <div className="mt-md">
      {remaining > 0 ? (
        <ImageDropZone
          id="inv-create-images"
          onPick={onQueuePick}
          hint={
            <>
              נותרו <span className="text-ink font-medium">{remaining}</span> תמונות · JPEG / PNG /
              WebP / HEIC · עד <span className="font-tabular">10MB</span>
            </>
          }
        />
      ) : (
        <p className="border-hairline bg-muted/5 px-md py-md text-muted rounded-md border text-sm">
          הגעת לגבול של <span className="font-tabular">{QUEUE_MAX_IMAGES}</span> תמונות. הסר תמונה
          כדי להוסיף חדשה.
        </p>
      )}

      {queueErrors.length > 0 ? (
        <Alert variant="destructive" className="mt-sm">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <ul className="space-y-1">
              {queueErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {queuedFiles.length > 0 ? (
        <>
          <p
            role="status"
            aria-live="polite"
            className="text-muted mt-md text-xs"
            key={queuedFiles.length}
          >
            <span className="text-ink font-tabular font-medium">{queuedFiles.length}</span> מתוך{" "}
            <span className="font-tabular">{QUEUE_MAX_IMAGES}</span> תמונות בתור — יועלו לאחר שמירת
            הרכב
          </p>
          <ul className="gap-sm mt-sm grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {queuedFiles.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="border-hairline bg-paper group relative aspect-[4/3] overflow-hidden rounded-md border"
              >
                {previews[i] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-subtle flex h-full w-full items-center justify-center">
                    <ImageIcon aria-hidden="true" className="h-6 w-6" />
                  </div>
                )}
                <span
                  aria-hidden="true"
                  className="bg-paper/85 text-ink font-tabular absolute bottom-1 start-1 inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1.5 text-xs font-medium backdrop-blur"
                >
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onQueueRemove(i)}
                  aria-label={`הסר תמונה ${i + 1} מתוך ${queuedFiles.length}`}
                  className="border-hairline bg-paper/95 text-danger-fg hover:bg-danger-bg focus-visible:outline-accent duration-fast absolute end-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md border backdrop-blur transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// HighlightedField — wraps FormField with autofill accent border. Kept
// because FormField has the existing label + error wiring; the wrapper adds
// the data-autofilled border tone.
// ============================================================================

type HighlightedFieldProps = Omit<Parameters<typeof FormField>[0], "label"> & {
  label: string;
  autofilled?: boolean;
};

function HighlightedField({ autofilled, ...rest }: HighlightedFieldProps) {
  return (
    <div
      data-autofilled={autofilled ? "true" : undefined}
      className="[&[data-autofilled=true]_input]:border-accent [&[data-autofilled=true]_input]:ring-accent/30 [&[data-autofilled=true]_input]:ring-1"
    >
      <FormField {...rest} />
    </div>
  );
}

// ============================================================================
// SelectShadcn — shadcn Select wrapped with label + error wiring + optional
// autofill accent. Supports two call patterns:
//   (a) controlled via value + onChange
//   (b) react-hook-form via registration prop (Select doesn't accept ref,
//       so we read/write through the registration's onChange + the form's
//       getValues/setValue when the caller provides registration)
// ============================================================================

function SelectShadcn({
  id,
  label,
  options,
  error,
  autofilled,
  value,
  onChange,
  registration,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  autofilled?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  registration?: UseFormRegisterReturn;
}): ReactNode {
  const errorId = `${id}-error`;

  // When `registration` is passed (react-hook-form), we synthesize a controlled
  // pattern that bridges to RHF's onChange handler. Native <select> change
  // events are what RHF expects, so we fabricate a minimal event object on
  // shadcn Select value change.
  const handleChange = (next: string) => {
    if (registration) {
      const synth = {
        target: { name: registration.name, value: next },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      void registration.onChange(synth);
    }
    if (onChange) onChange(next);
  };

  return (
    <div
      data-autofilled={autofilled ? "true" : undefined}
      className="[&[data-autofilled=true]_button]:border-accent [&[data-autofilled=true]_button]:ring-accent/30 [&[data-autofilled=true]_button]:ring-1"
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-xs">
        <Select value={value ?? ""} onValueChange={handleChange}>
          <SelectTrigger
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <SelectValue placeholder={options.find((o) => o.value === "")?.label ?? "בחר…"} />
          </SelectTrigger>
          <SelectContent>
            {options
              .filter((o) => o.value !== "")
              .map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <p id={errorId} className="text-danger-fg mt-xxs text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
