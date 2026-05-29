"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { AdminStatusPill } from "@/components/admin/AdminStatusPill";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/inventory/[id] — editorial deep-read on a single vehicle.
 *
 *   BMW X3 · 2018
 *   ──────────
 *   {status pill} · {visibility} · {pause if any} · נוצר/עודכן
 *
 *   תמונות
 *   ──────────
 *   grid of 2/3/4 thumbnails (hidden ones marked)
 *
 *   מחיר          מפרט          הסוחר הבעלים
 *   ──────────    ──────────    ──────────
 *   {DL pairs}    {DL pairs}    {DL pairs}
 *
 *   פרטי מכירה (only if sold)
 *   ──────────
 *   הערות + סטטוס פעילות (only if relevant)
 *
 * Definition lists with hairline row separators replace the bordered
 * <Card> boxes. Same dl pattern as marketplace detail on the dealer
 * dashboard.
 */

type AdminVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: string | null;
  // Wave 2 — notes split + retired paused mechanism. Admin sees both
  // halves of the notes split.
  public_notes: string | null;
  private_notes: string | null;
  plate_number: string | null;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  purchase_cost: number | null;
  status: "active" | "sold" | "hidden" | "in_transaction" | "pending_deletion";
  visibility: "private" | "b2b" | "b2c" | "both";
  // Wave 2 — pending-deletion workflow fields.
  pending_deletion_reason: string | null;
  pending_deletion_requested_at: string | null;
  previous_status: string | null;
  created_at: string;
  updated_at: string;
  sale_price: number | null;
  sold_at: string | null;
  sold_to: "b2b" | "b2c" | "external" | null;
  warranty_type: string | null;
  warranty_until: string | null;
  buyer_name: string | null;
  buyer_id_number: string | null;
  buyer_phone: string | null;
  was_trade_in: boolean;
  trade_in_make: string | null;
  trade_in_model: string | null;
  trade_in_year: number | null;
  trade_in_value: number | null;
  trade_in_plate: string | null;
  dealer: {
    id: string;
    business_name: string;
    city: string;
    phone: string;
    email: string;
    tier: string;
    trust_score: number;
    verified: boolean;
    suspended_at: string | null;
  };
  images: Array<{ id: string; url: string; position: number; hidden: boolean }>;
};

const VISIBILITY_LABEL: Record<AdminVehicle["visibility"], string> = {
  private: "פרטי",
  b2b: "B2B (סוחרים)",
  b2c: "B2C (לקוחות)",
  both: "שניהם",
};
const STATUS_LABEL: Record<AdminVehicle["status"], string> = {
  active: "פעיל",
  sold: "נמכר",
  hidden: "מוסתר",
  in_transaction: "בעסקה פעילה",
  pending_deletion: "ממתין למחיקה",
};
const SOLD_TO_LABEL: Record<NonNullable<AdminVehicle["sold_to"]>, string> = {
  b2b: "סוחר (B2B)",
  b2c: "לקוח פרטי (B2C)",
  external: "חיצוני",
};

function statusVariant(s: AdminVehicle["status"]): "ink" | "neutral" | "danger" | "accent" {
  if (s === "active") return "ink";
  if (s === "sold") return "accent";
  if (s === "in_transaction") return "neutral";
  // hidden + pending_deletion both warrant attention — admin should
  // see at a glance that something is off-marketplace.
  return "danger";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL");
}

export default function AdminVehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, loading: authLoading } = useAdminAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const vQuery = useQuery({
    queryKey: queryKeys.admin.inventoryDetail(id ?? ""),
    queryFn: () => apiFetch<AdminVehicle>(`/api/v1/admin/inventory/${id}`, { token: token! }),
    enabled: !!token && !!id,
  });
  const v = vQuery.data ?? null;
  const error =
    vQuery.error instanceof Error ? vQuery.error.message : vQuery.error ? "שגיאה בטעינה" : null;

  useEffect(() => {
    if (v) headingRef.current?.focus();
  }, [v]);

  const loading = authLoading || (!v && !error);

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-5xl">
      <AdminMasthead
        title={v ? `${v.make} ${v.model} · ${v.year}` : "טוען רכב…"}
        dek={
          v ? (
            <>
              <span>נוצר {fmtDate(v.created_at)}</span>
              <span aria-hidden="true" className="text-subtle mx-xxs">
                ·
              </span>
              <span>עודכן {fmtDate(v.updated_at)}</span>
            </>
          ) : undefined
        }
        loading={loading}
        count={
          v ? (
            <span className="gap-xs flex flex-wrap items-center">
              <AdminStatusPill variant={statusVariant(v.status)}>
                {STATUS_LABEL[v.status]}
              </AdminStatusPill>
              <Badge variant="outline" className="font-normal">
                {VISIBILITY_LABEL[v.visibility]}
              </Badge>
              {/* Wave 2 retired the paused mechanism; status drives the
                  whole pill story now (hidden / pending_deletion etc). */}
            </span>
          ) : undefined
        }
        headingRef={headingRef}
      />

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : v ? (
        <>
          {/* ── PHOTOS ───────────────────────────────────────────────── */}
          <section aria-labelledby="photos-heading" className="mt-3xl">
            <p className="text-muted text-xs font-medium uppercase tracking-widest">תמונות</p>
            <h2 id="photos-heading" className="sr-only">
              תמונות הרכב
            </h2>
            <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
            {v.images.length === 0 ? (
              <p className="text-muted py-2xl text-center text-sm">לא הועלו תמונות לרכב זה.</p>
            ) : (
              <ul className="gap-sm mt-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {v.images.map((img) => (
                  <li key={img.id}>
                    <figure className="border-hairline relative aspect-[4/3] overflow-hidden rounded-md border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`תמונה ${img.position + 1} של ${v.make} ${v.model}`}
                        loading="lazy"
                        className={`h-full w-full object-cover ${img.hidden ? "opacity-40" : ""}`}
                      />
                      {img.hidden ? (
                        <figcaption className="bg-ink/85 text-paper px-xs py-xxs absolute inset-x-0 bottom-0 text-center text-xs font-medium">
                          מוסתר מהציבור
                        </figcaption>
                      ) : null}
                    </figure>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── PRICING + SPEC + DEALER ──────────────────────────────── */}
          <div className="gap-2xl mt-3xl grid grid-cols-1 lg:grid-cols-2">
            <DetailSection title="מחיר">
              <DList>
                <DRow
                  label="מחיר מבוקש"
                  value={formatPrice(v.price).visual}
                  sr={formatPrice(v.price).sr}
                />
                <DRow
                  label="מחיר B2B"
                  value={v.b2b_price != null ? formatPrice(v.b2b_price).visual : "—"}
                  sr={v.b2b_price != null ? formatPrice(v.b2b_price).sr : undefined}
                />
                <DRow
                  label="מחיר B2C"
                  value={v.b2c_price != null ? formatPrice(v.b2c_price).visual : "—"}
                  sr={v.b2c_price != null ? formatPrice(v.b2c_price).sr : undefined}
                />
                <DRow
                  label="עלות קנייה"
                  value={v.purchase_cost != null ? formatPrice(v.purchase_cost).visual : "—"}
                />
              </DList>
            </DetailSection>

            <DetailSection title="מפרט">
              <DList>
                <DRow
                  label="קילומטראז׳"
                  value={formatMileage(v.mileage).visual}
                  sr={formatMileage(v.mileage).sr}
                />
                <DRow label="צבע" value={v.color ?? "—"} />
                <DRow
                  label="תיבת הילוכים"
                  value={
                    v.transmission === "automatic"
                      ? "אוטומט"
                      : v.transmission === "manual"
                        ? "ידני"
                        : "—"
                  }
                />
                <DRow
                  label="סוג דלק"
                  value={
                    v.fuel_type === "petrol"
                      ? "בנזין"
                      : v.fuel_type === "diesel"
                        ? "דיזל"
                        : v.fuel_type === "electric"
                          ? "חשמלי"
                          : v.fuel_type === "hybrid"
                            ? "היברידי"
                            : "—"
                  }
                />
                <DRow label="נפח מנוע" value={v.engine_volume ? `${v.engine_volume} סמ״ק` : "—"} />
                <DRow label="לוחית רישוי" value={v.plate_number ?? "—"} />
              </DList>
            </DetailSection>

            <DetailSection title="הסוחר הבעלים">
              <DList>
                <DRow
                  label="עסק"
                  value={
                    <Link
                      href={`/admin/dealers/${v.dealer.id}`}
                      className="text-ink duration-fast hover:text-accent focus-visible:outline-accent underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {v.dealer.business_name}
                    </Link>
                  }
                />
                <DRow label="עיר" value={v.dealer.city || "—"} />
                <DRow label="אימייל" value={<span dir="ltr">{v.dealer.email}</span>} />
                <DRow label="טלפון" value={<span dir="ltr">{v.dealer.phone || "—"}</span>} />
                <DRow
                  label="דרגה / אמון"
                  value={
                    <>
                      <span>{v.dealer.tier}</span>
                      <span aria-hidden="true" className="text-subtle mx-xxs">
                        ·
                      </span>
                      <span className="font-tabular">{v.dealer.trust_score}</span>
                    </>
                  }
                />
                <DRow
                  label="סטטוס סוחר"
                  value={
                    v.dealer.suspended_at
                      ? `מושעה מ-${fmtDate(v.dealer.suspended_at)}`
                      : v.dealer.verified
                        ? "מאומת"
                        : "ממתין לאישור"
                  }
                />
              </DList>
            </DetailSection>

            {v.status === "sold" ? (
              <DetailSection title="פרטי מכירה">
                <DList>
                  <DRow
                    label="מחיר מכירה"
                    value={v.sale_price != null ? formatPrice(v.sale_price).visual : "—"}
                    sr={v.sale_price != null ? formatPrice(v.sale_price).sr : undefined}
                  />
                  <DRow label="תאריך מכירה" value={fmtDate(v.sold_at)} />
                  <DRow label="ערוץ" value={v.sold_to ? SOLD_TO_LABEL[v.sold_to] : "—"} />
                  {v.sale_price != null && v.purchase_cost != null ? (
                    <DRow
                      label="רווח מחושב"
                      value={
                        <span
                          className={
                            v.sale_price - v.purchase_cost >= 0
                              ? "text-ok-fg font-tabular font-semibold"
                              : "text-danger-fg font-tabular font-semibold"
                          }
                        >
                          {formatPrice(v.sale_price - v.purchase_cost).visual}
                        </span>
                      }
                    />
                  ) : null}
                  <DRow label="קונה" value={v.buyer_name ?? "—"} />
                  <DRow label="ת״ז קונה" value={v.buyer_id_number ?? "—"} />
                  <DRow label="טלפון קונה" value={<span dir="ltr">{v.buyer_phone ?? "—"}</span>} />
                </DList>

                {v.was_trade_in ? (
                  <div className="mt-xl">
                    <p className="text-muted text-xs font-medium uppercase tracking-widest">
                      טרייד-אין שהתקבל בעסקה
                    </p>
                    <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
                    <DList className="mt-md">
                      <DRow
                        label="רכב"
                        value={`${v.trade_in_make ?? "—"} ${v.trade_in_model ?? ""}`.trim() || "—"}
                      />
                      <DRow
                        label="שנה"
                        value={v.trade_in_year != null ? String(v.trade_in_year) : "—"}
                      />
                      <DRow
                        label="שווי מוסכם"
                        value={
                          v.trade_in_value != null ? formatPrice(v.trade_in_value).visual : "—"
                        }
                      />
                      <DRow label="לוחית" value={v.trade_in_plate ?? "—"} />
                    </DList>
                  </div>
                ) : null}
              </DetailSection>
            ) : null}

            {/* Wave 2 — notes split. Admins see both halves and the
                pending-deletion record (if any). The paused mechanism
                is retired so its rows are gone. */}
            {v.public_notes ||
            v.private_notes ||
            v.pending_deletion_requested_at ||
            v.pending_deletion_reason ? (
              <DetailSection title="הערות + בקשת מחיקה">
                {v.pending_deletion_requested_at || v.pending_deletion_reason ? (
                  <DList>
                    {v.pending_deletion_requested_at ? (
                      <DRow
                        label="בקשת מחיקה הוגשה"
                        value={fmtDate(v.pending_deletion_requested_at)}
                      />
                    ) : null}
                    {v.previous_status ? (
                      <DRow
                        label="סטטוס לפני הבקשה"
                        value={
                          STATUS_LABEL[v.previous_status as AdminVehicle["status"]] ??
                          v.previous_status
                        }
                      />
                    ) : null}
                    {v.pending_deletion_reason ? (
                      <DRow label="סיבת הבקשה" value={v.pending_deletion_reason} />
                    ) : null}
                  </DList>
                ) : null}
                {v.public_notes ? (
                  <div className="mt-md">
                    <p className="text-muted text-xs font-medium">הערות פומביות</p>
                    <p className="text-ink mt-xs whitespace-pre-line text-sm">{v.public_notes}</p>
                  </div>
                ) : null}
                {v.private_notes ? (
                  <div className="mt-md">
                    <p className="text-muted text-xs font-medium">הערות פנימיות</p>
                    <p className="text-ink mt-xs whitespace-pre-line text-sm">{v.private_notes}</p>
                  </div>
                ) : null}
              </DetailSection>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local presentational helpers. Replace the bordered <Card> boxes with the
// editorial eyebrow + hairline + content rhythm used across the dashboard.
// ---------------------------------------------------------------------------

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-muted text-xs font-medium uppercase tracking-widest">{title}</p>
      <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />
      <div className="mt-md">{children}</div>
    </section>
  );
}

function DList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <dl className={["text-sm", className].join(" ")}>{children}</dl>;
}

function DRow({ label, value, sr }: { label: string; value: React.ReactNode; sr?: string }) {
  return (
    <div className="border-hairline gap-md py-sm flex flex-wrap items-baseline justify-between border-b last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink font-medium">
        {sr ? (
          <>
            <span aria-hidden="true">{value}</span>
            <span className="sr-only">{sr}</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-3xl" role="status" aria-live="polite">
      <span className="sr-only">טוען רכב…</span>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-sm h-px w-full" />
      <div className="gap-sm mt-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-md" />
        ))}
      </div>
      <div className="gap-2xl mt-3xl grid grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-sm h-px w-full" />
            <div className="mt-md space-y-3">
              {Array.from({ length: 4 }).map((__, j) => (
                <div
                  key={j}
                  aria-hidden="true"
                  className="border-hairline gap-md py-sm flex items-baseline justify-between border-b last:border-b-0"
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
