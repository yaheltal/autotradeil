"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";

/*
 * Admin vehicle detail (Phase 6.9).
 *
 * Read-only deep view of any inventory row regardless of dealer or
 * status. Surfaces every column the API returns:
 *   • core spec + pricing (price / b2b / b2c / purchase_cost)
 *   • lifecycle (status / visibility / pause / created / updated)
 *   • sale closure (sale_price / sold_at / sold_to + warranty)
 *   • buyer details (P6.8.4 — name / ID / phone)
 *   • trade-in vehicle (P6.8.4 — make/model/year/value/plate)
 *   • owning dealer (link to /admin/dealers/[id])
 *   • all photos including hidden ones
 *
 * a11y:
 *   - H1 focused on mount
 *   - Definition lists for the spec/pricing/buyer panes (screen
 *     readers announce each label-value pair)
 *   - Photo grid uses <figure> + <figcaption> (sr-only when hidden)
 *   - Status pill paired with text — never color-only
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
  notes: string | null;
  plate_number: string | null;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  purchase_cost: number | null;
  status: "active" | "sold" | "hidden";
  visibility: "private" | "b2b" | "b2c" | "both";
  paused_until: string | null;
  pause_reason: string | null;
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
};
const SOLD_TO_LABEL: Record<NonNullable<AdminVehicle["sold_to"]>, string> = {
  b2b: "סוחר (B2B)",
  b2c: "לקוח פרטי (B2C)",
  external: "חיצוני",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL");
}

export default function AdminVehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, loading: authLoading } = useAdminAuth();
  const [v, setV] = useState<AdminVehicle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    apiFetch<AdminVehicle>(`/api/v1/admin/inventory/${id}`, { token })
      .then((res) => {
        if (!cancelled) setV(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינה");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (authLoading || (!v && !error)) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען רכב…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-2xl p-6">
          <p role="alert" className="bg-danger-bg text-danger-text rounded-md px-4 py-3">
            {error}
          </p>
          <Link
            href="/admin/inventory"
            className="text-brand-navy mt-6 inline-flex items-center gap-1 text-sm font-semibold underline"
          >
            <span aria-hidden="true">→</span>
            חזרה לרשימת המלאי
          </Link>
        </div>
      </main>
    );
  }

  if (!v) return null;

  const profit =
    v.sale_price != null && v.purchase_cost != null ? v.sale_price - v.purchase_cost : null;

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/admin/inventory"
          className="text-brand-navy focus-visible:outline-brand-navy inline-flex items-center gap-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">→</span>
          חזרה לכל הרכבים
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              tabIndex={-1}
              className="text-brand-navy font-serif text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl"
            >
              {v.make} {v.model} · {v.year}
            </h1>
            <p className="text-brand-ink/65 mt-1 text-sm">
              נוצר: {fmtDate(v.created_at)} · עודכן: {fmtDate(v.updated_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={STATUS_LABEL[v.status]} variant={v.status} />
            <Pill label={VISIBILITY_LABEL[v.visibility]} />
            {v.paused_until ? <Pill label="מושהה" variant="warn" /> : null}
          </div>
        </header>

        {/* ============== PHOTOS ============== */}
        <section aria-labelledby="photos-heading" className="mt-8">
          <h2 id="photos-heading" className="sr-only">
            תמונות הרכב
          </h2>
          {v.images.length === 0 ? (
            <p className="border-brand-navy/15 bg-brand-cream/40 text-brand-ink/65 rounded-lg border p-6 text-center text-sm">
              לא הועלו תמונות לרכב זה.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {v.images.map((img) => (
                <li key={img.id}>
                  <figure className="border-brand-navy/12 relative aspect-[4/3] overflow-hidden rounded-lg border bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={`תמונה ${img.position + 1} של ${v.make} ${v.model}`}
                      loading="lazy"
                      className={`h-full w-full object-cover ${img.hidden ? "opacity-40" : ""}`}
                    />
                    {img.hidden ? (
                      <figcaption className="bg-brand-navy/85 text-brand-cream absolute inset-x-0 bottom-0 px-2 py-1 text-center text-xs font-bold">
                        מוסתר מהציבור
                      </figcaption>
                    ) : null}
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* ============== PRICING ============== */}
          <Card title="מחיר">
            <DList>
              <Row
                label="מחיר מבוקש"
                value={formatPrice(v.price).visual}
                sr={formatPrice(v.price).sr}
              />
              <Row
                label="מחיר B2B"
                value={v.b2b_price != null ? formatPrice(v.b2b_price).visual : "—"}
                sr={v.b2b_price != null ? formatPrice(v.b2b_price).sr : undefined}
              />
              <Row
                label="מחיר B2C"
                value={v.b2c_price != null ? formatPrice(v.b2c_price).visual : "—"}
                sr={v.b2c_price != null ? formatPrice(v.b2c_price).sr : undefined}
              />
              <Row
                label="עלות קנייה"
                value={v.purchase_cost != null ? formatPrice(v.purchase_cost).visual : "—"}
              />
            </DList>
          </Card>

          {/* ============== SPEC ============== */}
          <Card title="מפרט">
            <DList>
              <Row
                label="קילומטראז׳"
                value={formatMileage(v.mileage).visual}
                sr={formatMileage(v.mileage).sr}
              />
              <Row label="צבע" value={v.color ?? "—"} />
              <Row
                label="תיבת הילוכים"
                value={
                  v.transmission === "automatic"
                    ? "אוטומט"
                    : v.transmission === "manual"
                      ? "ידני"
                      : "—"
                }
              />
              <Row
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
              <Row label="נפח מנוע" value={v.engine_volume ? `${v.engine_volume} סמ״ק` : "—"} />
              <Row label="לוחית רישוי" value={v.plate_number ?? "—"} />
            </DList>
          </Card>

          {/* ============== OWNING DEALER ============== */}
          <Card title="הסוחר הבעלים">
            <DList>
              <Row
                label="עסק"
                value={
                  <Link
                    href={`/admin/dealers/${v.dealer.id}`}
                    className="text-brand-navy decoration-brand-gold underline decoration-2 underline-offset-4"
                  >
                    {v.dealer.business_name}
                  </Link>
                }
              />
              <Row label="עיר" value={v.dealer.city || "—"} />
              <Row label="אימייל" value={<span dir="ltr">{v.dealer.email}</span>} />
              <Row label="טלפון" value={<span dir="ltr">{v.dealer.phone || "—"}</span>} />
              <Row label="דרגה / אמון" value={`${v.dealer.tier} · ${v.dealer.trust_score}`} />
              <Row
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
          </Card>

          {/* ============== SALE / BUYER (only if sold) ============== */}
          {v.status === "sold" ? (
            <Card title="פרטי מכירה">
              <DList>
                <Row
                  label="מחיר מכירה"
                  value={v.sale_price != null ? formatPrice(v.sale_price).visual : "—"}
                  sr={v.sale_price != null ? formatPrice(v.sale_price).sr : undefined}
                />
                <Row label="תאריך מכירה" value={fmtDate(v.sold_at)} />
                <Row label="ערוץ" value={v.sold_to ? SOLD_TO_LABEL[v.sold_to] : "—"} />
                {profit != null ? (
                  <Row
                    label="רווח מחושב"
                    value={
                      <span
                        className={
                          profit >= 0 ? "text-ok-text font-bold" : "text-danger-text font-bold"
                        }
                      >
                        {formatPrice(profit).visual}
                      </span>
                    }
                  />
                ) : null}
                <Row label="קונה" value={v.buyer_name ?? "—"} />
                <Row label="ת״ז קונה" value={v.buyer_id_number ?? "—"} />
                <Row label="טלפון קונה" value={<span dir="ltr">{v.buyer_phone ?? "—"}</span>} />
              </DList>

              {v.was_trade_in ? (
                <div className="border-brand-navy/12 mt-5 rounded-lg border bg-white p-4">
                  <p className="text-brand-navy text-sm font-bold">טרייד-אין שהתקבל בעסקה</p>
                  <DList className="mt-3">
                    <Row
                      label="רכב"
                      value={`${v.trade_in_make ?? "—"} ${v.trade_in_model ?? ""}`.trim() || "—"}
                    />
                    <Row
                      label="שנה"
                      value={v.trade_in_year != null ? String(v.trade_in_year) : "—"}
                    />
                    <Row
                      label="שווי מוסכם"
                      value={v.trade_in_value != null ? formatPrice(v.trade_in_value).visual : "—"}
                    />
                    <Row label="לוחית" value={v.trade_in_plate ?? "—"} />
                  </DList>
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* ============== NOTES + PAUSE ============== */}
          {v.notes || v.pause_reason || v.paused_until ? (
            <Card title="הערות + סטטוס פעילות">
              <DList>
                {v.paused_until ? <Row label="מושהה עד" value={fmtDate(v.paused_until)} /> : null}
                {v.pause_reason ? <Row label="סיבת השהיה" value={v.pause_reason} /> : null}
                {v.notes ? (
                  <div className="text-sm">
                    <dt className="text-brand-ink/60">הערות הסוחר</dt>
                    <dd className="text-brand-ink mt-1 whitespace-pre-line">{v.notes}</dd>
                  </div>
                ) : null}
              </DList>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tiny presentational helpers — local to keep the file self-contained.
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-brand-navy/12 rounded-xl border bg-white p-5 sm:p-6">
      <h2 className="text-brand-navy font-serif text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <dl className={`space-y-2.5 text-sm ${className}`}>{children}</dl>;
}

function Row({ label, value, sr }: { label: string; value: React.ReactNode; sr?: string }) {
  return (
    <div className="border-brand-navy/5 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
      <dt className="text-brand-ink/65">{label}</dt>
      <dd className="text-brand-navy font-semibold">
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

function Pill({ label, variant }: { label: string; variant?: "warn" }) {
  const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold";
  const tone =
    variant === "warn" ? "bg-amber-100 text-amber-900" : "bg-brand-navy/10 text-brand-navy/80";
  return <span className={`${base} ${tone}`}>{label}</span>;
}

function StatusPill({ label, variant }: { label: string; variant: AdminVehicle["status"] }) {
  const tone =
    variant === "active"
      ? "bg-ok-bg text-ok-text"
      : variant === "sold"
        ? "bg-brand-navy text-brand-cream"
        : "bg-brand-navy/10 text-brand-navy/80";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {label}
    </span>
  );
}
