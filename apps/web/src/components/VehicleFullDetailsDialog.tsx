"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { DialogCloseButton } from "@/components/DialogCloseButton";
import { useDialogScrollReset } from "@/hooks/useDialogScrollReset";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * VehicleFullDetailsDialog — read-only "registration card" view.
 *
 * Shows EVERY field we have on a vehicle: identity, spec, pricing,
 * lifecycle, sale closure (if sold), buyer info (if sold), trade-in
 * (if applicable), images, and ownership history (יד / סוג בעלות).
 *
 * Visibility rules enforced by the BACKEND endpoint, not this
 * component:
 *   · /api/v1/inventory/{id}        → dealer's own (filtered to me)
 *   · /api/v1/admin/inventory/{id}  → admin global (any vehicle)
 *
 * The dialog itself is endpoint-agnostic — pass `endpoint="own"` for
 * the dealer view or `endpoint="admin"` for the admin view. The
 * marketplace path NEVER mounts this dialog (other dealers don't
 * see this data unless a deal is closed).
 */

type Endpoint = "own" | "admin";

const HAND_LABEL = (hand: number | null, ownership: string | null): string => {
  if (!ownership) return "—";
  if (ownership === "leasing") return "ליסינג";
  if (ownership === "rental") return "השכרה";
  if (ownership === "government") return "ממשלתי / רשות";
  const ownLabel = ownership === "private" ? "פרטית" : "סוחר";
  if (hand == null) return ownLabel;
  const handLabel = hand >= 4 ? "יד 4+" : `יד ${hand}`;
  return `${handLabel} — ${ownLabel}`;
};

const FUEL_LABEL: Record<string, string> = {
  petrol: "בנזין",
  diesel: "דיזל",
  electric: "חשמלי",
  hybrid: "היברידי",
};
const TRANSMISSION_LABEL: Record<string, string> = {
  automatic: "אוטומט",
  manual: "ידני",
};
const STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  sold: "נמכר",
  hidden: "מוסתר",
};
const VISIBILITY_LABEL: Record<string, string> = {
  private: "פרטי",
  b2b: "B2B",
  b2c: "B2C",
  both: "שניהם",
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  color: string | null;
  transmission: string | null;
  fuel_type: string | null;
  engine_volume: number | string | null;
  notes: string | null;
  status: string;
  visibility: string;
  hand: number | null;
  ownership_type: string | null;
  purchase_cost: number | null;
  sale_price: number | null;
  sold_at: string | null;
  sold_to: string | null;
  warranty_type: string | null;
  warranty_until: string | null;
  buyer_name?: string | null;
  buyer_id_number?: string | null;
  buyer_phone?: string | null;
  was_trade_in?: boolean;
  trade_in_make?: string | null;
  trade_in_model?: string | null;
  trade_in_year?: number | null;
  trade_in_value?: number | null;
  trade_in_plate?: string | null;
  plate_number?: string | null;
  created_at: string;
  updated_at: string;
  primary_image_url?: string | null;
  images?: Array<{ id: string; url: string; position: number }>;
  dealer?: {
    id: string;
    business_name: string;
    city: string | null;
    phone: string | null;
    email: string;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  vehicleId: string;
  endpoint: Endpoint;
};

export function VehicleFullDetailsDialog({
  open,
  onOpenChange,
  token,
  vehicleId,
  endpoint,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogScrollReset(cardRef, open);

  const path =
    endpoint === "admin"
      ? `/api/v1/admin/inventory/${vehicleId}`
      : `/api/v1/inventory/${vehicleId}`;
  const detailQuery = useQuery({
    queryKey:
      endpoint === "admin"
        ? queryKeys.admin.inventoryDetail(vehicleId)
        : queryKeys.inventory.detail(vehicleId),
    queryFn: () => apiFetch<Vehicle>(path, { token }),
    enabled: open && !!vehicleId,
  });
  const data = detailQuery.data ?? null;
  const error =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : detailQuery.error
        ? "שגיאה בטעינה"
        : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          aria-hidden="true"
          className="bg-brand-navy/40 fixed inset-0 z-40 motion-reduce:transition-none"
        />
        <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center p-3 motion-reduce:transition-none sm:p-4">
          <div
            ref={cardRef}
            className="bg-brand-cream relative max-h-[95dvh] w-full max-w-2xl overflow-y-auto rounded-xl p-4 shadow-xl sm:max-h-[90vh] sm:p-6"
          >
            <DialogCloseButton />
            <Dialog.Title className="text-brand-navy pe-12 font-serif text-xl font-bold sm:text-2xl">
              {data ? `${data.make} ${data.model} · ${data.year}` : "פרטי רכב מלאים"}
            </Dialog.Title>
            <Dialog.Description className="text-brand-ink/65 mt-1 text-sm">
              כל הפרטים על הרכב — קריאה בלבד.
            </Dialog.Description>

            {error ? (
              <p
                role="alert"
                className="bg-danger-bg text-danger-text mt-4 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            ) : null}

            {!data && !error ? (
              <p role="status" className="text-brand-ink/60 mt-6 text-sm">
                טוען…
              </p>
            ) : null}

            {data ? (
              <div className="mt-5 space-y-6">
                {data.primary_image_url || (data.images && data.images.length > 0) ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.primary_image_url || data.images?.[0]?.url || ""}
                      alt=""
                      className="border-brand-navy/10 aspect-[16/9] w-full rounded-lg border bg-white object-cover"
                    />
                  </div>
                ) : null}

                <Card title="זיהוי + רישוי">
                  <Row label="מספר רכב" value={data.plate_number ?? "—"} />
                  <Row label="יצרן" value={data.make} />
                  <Row label="דגם" value={data.model} />
                  <Row label="שנה" value={String(data.year)} />
                  <Row label="צבע" value={data.color ?? "—"} />
                </Card>

                <Card title="מפרט">
                  <Row
                    label="קילומטראז׳"
                    value={formatMileage(data.mileage).visual}
                    sr={formatMileage(data.mileage).sr}
                  />
                  <Row
                    label="תיבת הילוכים"
                    value={data.transmission ? (TRANSMISSION_LABEL[data.transmission] ?? "—") : "—"}
                  />
                  <Row
                    label="סוג דלק"
                    value={data.fuel_type ? (FUEL_LABEL[data.fuel_type] ?? "—") : "—"}
                  />
                  <Row
                    label="נפח מנוע"
                    value={
                      data.engine_volume
                        ? `${data.engine_volume} ליטר`
                        : data.fuel_type === "electric"
                          ? "חשמלי (ללא מנוע)"
                          : "—"
                    }
                  />
                  <Row label="יד / סוג בעלות" value={HAND_LABEL(data.hand, data.ownership_type)} />
                </Card>

                <Card title="תמחור + סטטוס">
                  <Row
                    label="מחיר מבוקש"
                    value={formatPrice(data.price).visual}
                    sr={formatPrice(data.price).sr}
                  />
                  <Row
                    label="מחיר B2B"
                    value={data.b2b_price != null ? formatPrice(data.b2b_price).visual : "—"}
                  />
                  <Row
                    label="מחיר B2C"
                    value={data.b2c_price != null ? formatPrice(data.b2c_price).visual : "—"}
                  />
                  <Row
                    label="עלות קנייה"
                    value={
                      data.purchase_cost != null ? formatPrice(data.purchase_cost).visual : "—"
                    }
                  />
                  <Row label="סטטוס" value={STATUS_LABEL[data.status] ?? data.status} />
                  <Row
                    label="חשיפה בשוק"
                    value={VISIBILITY_LABEL[data.visibility] ?? data.visibility}
                  />
                </Card>

                {data.dealer ? (
                  <Card title="הסוחר הבעלים">
                    <Row label="עסק" value={data.dealer.business_name} />
                    <Row label="עיר" value={data.dealer.city ?? "—"} />
                    <Row label="אימייל" value={<span dir="ltr">{data.dealer.email}</span>} />
                    <Row label="טלפון" value={<span dir="ltr">{data.dealer.phone ?? "—"}</span>} />
                  </Card>
                ) : null}

                {data.status === "sold" && data.sold_at ? (
                  <Card title="פרטי מכירה">
                    <Row label="תאריך מכירה" value={fmtDate(data.sold_at)} />
                    <Row
                      label="מחיר מכירה"
                      value={data.sale_price != null ? formatPrice(data.sale_price).visual : "—"}
                    />
                    <Row label="ערוץ" value={data.sold_to ?? "—"} />
                    <Row label="שם הקונה" value={data.buyer_name ?? "—"} />
                    <Row label="ת״ז קונה" value={data.buyer_id_number ?? "—"} />
                    <Row
                      label="טלפון קונה"
                      value={<span dir="ltr">{data.buyer_phone ?? "—"}</span>}
                    />
                  </Card>
                ) : null}

                {data.was_trade_in ? (
                  <Card title="טרייד-אין">
                    <Row label="יצרן רכב טרייד" value={data.trade_in_make ?? "—"} />
                    <Row label="דגם" value={data.trade_in_model ?? "—"} />
                    <Row
                      label="שנה"
                      value={data.trade_in_year ? String(data.trade_in_year) : "—"}
                    />
                    <Row
                      label="ערך מוסכם"
                      value={
                        data.trade_in_value != null ? formatPrice(data.trade_in_value).visual : "—"
                      }
                    />
                    <Row label="לוחית רישוי" value={data.trade_in_plate ?? "—"} />
                  </Card>
                ) : null}

                {data.notes ? (
                  <Card title="הערות פנימיות">
                    <p className="text-brand-ink whitespace-pre-line text-sm leading-relaxed">
                      {data.notes}
                    </p>
                  </Card>
                ) : null}

                <Card title="היסטוריית רישום">
                  <Row label="נוצר" value={fmtDate(data.created_at)} />
                  <Row label="עודכן" value={fmtDate(data.updated_at)} />
                </Card>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-brand-navy/12 rounded-lg border bg-white p-4">
      <h3 className="text-brand-navy mb-3 text-sm font-bold">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Row({ label, value, sr }: { label: string; value: React.ReactNode; sr?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-brand-ink/65 shrink-0">{label}</dt>
      <dd className="text-brand-navy text-end font-medium">
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
