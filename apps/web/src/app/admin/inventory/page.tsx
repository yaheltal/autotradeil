"use client";

import { useQuery } from "@tanstack/react-query";
import { Car, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { AdminStatusPill } from "@/components/admin/AdminStatusPill";
import { TablePagination } from "@/components/admin/TablePagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/inventory — editorial cross-dealer inventory roster.
 *
 *   כל הרכבים במערכת
 *   ──────────
 *   מלאי מכלל הסוחרים · {total} רכבים
 *
 *   ✦ חיפוש חכם (free text → make/model)
 *   [חשיפה] [סטטוס] [יצרן] [דגם]                  ← 4-col filter grid
 *
 *   Desktop: shadcn Table with hairline rows
 *   Mobile : hairline-separated card stack with thumbnail
 *
 *   הקודם · עמוד N מתוך M · הבא
 *
 * Twin of /admin/dealers; differs only in row shape and filter set.
 */

type Row = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  b2b_price: number | null;
  b2c_price: number | null;
  visibility: "private" | "b2b" | "b2c" | "both";
  status: "active" | "sold" | "hidden";
  paused_until: string | null;
  dealer_id: string;
  dealer_business_name: string;
  dealer_city: string | null;
  primary_image_url: string | null;
};

type Resp = {
  items: Row[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

const VISIBILITY_LABEL: Record<Row["visibility"], string> = {
  private: "פרטי",
  b2b: "B2B",
  b2c: "B2C",
  both: "שניהם",
};

const STATUS_LABEL: Record<Row["status"], string> = {
  active: "פעיל",
  sold: "נמכר",
  hidden: "מוסתר",
};

function statusVariant(s: Row["status"]): "ink" | "neutral" | "danger" | "accent" {
  if (s === "active") return "ink";
  if (s === "hidden") return "danger";
  return "neutral";
}

export default function AdminInventoryPage() {
  const { token, loading } = useAdminAuth();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ visibility: "", status: "", make: "", model: "" });
  const [smartQuery, setSmartQuery] = useState("");
  const [pageAnnounce, setPageAnnounce] = useState("");

  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const headingRef = useRef<HTMLHeadingElement>(null);

  const inventoryQuery = useQuery({
    queryKey: queryKeys.admin.inventory({ ...f, page }),
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), per_page: "20" });
      if (f.visibility) qs.set("visibility", f.visibility);
      if (f.status) qs.set("status", f.status);
      if (f.make) qs.set("make", f.make);
      if (f.model) qs.set("model", f.model);
      return apiFetch<Resp>(`/api/v1/admin/inventory?${qs}`, { token: token! });
    },
    enabled: !!token,
  });
  const data = inventoryQuery.data ?? null;
  const error =
    inventoryQuery.error instanceof Error
      ? inventoryQuery.error.message
      : inventoryQuery.error
        ? "שגיאה בטעינה"
        : null;

  useEffect(() => {
    if (data) {
      setPageAnnounce(`מציג ${data.items.length} מתוך ${data.total} רכבים`);
      headingRef.current?.focus();
    }
  }, [data]);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const q = smartQuery.trim();
    if (q) {
      const parsed = await parseSmart(q);
      if (parsed) {
        setF((prev) => ({
          ...prev,
          make: prev.make || parsed.filters.make || "",
          model: prev.model || parsed.filters.model || "",
        }));
      }
    }
    void inventoryQuery.refetch();
  };

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-7xl">
      <AdminMasthead
        title="כל הרכבים במערכת"
        dek={<span>מלאי מכלל הסוחרים</span>}
        loading={loading || !data}
        count={data ? `${data.total.toLocaleString("he-IL")} רכבים` : undefined}
        headingRef={headingRef}
      />

      <p role="status" aria-live="polite" className="sr-only" key={pageAnnounce}>
        {pageAnnounce}
      </p>

      {/* ── FILTER FORM ─────────────────────────────────────────────── */}
      <form role="search" aria-label="סינון רכבים" onSubmit={onSearch} className="mt-2xl">
        <div>
          <div className="gap-xxs flex items-center">
            <Sparkles aria-hidden="true" className="text-accent h-3.5 w-3.5" />
            <Label htmlFor="adminInv-smart" className="text-ink text-sm font-medium">
              חיפוש חכם
            </Label>
          </div>
          <p id="adminInv-smart-hint" className="text-muted mt-xxs text-xs">
            למשל: ״BMW X3״ או ״טויוטה היברידית״ — המערכת תזהה יצרן + דגם.
          </p>
          <Input
            id="adminInv-smart"
            type="search"
            autoComplete="off"
            value={smartQuery}
            onChange={(e) => setSmartQuery(e.target.value)}
            aria-describedby="adminInv-smart-hint"
            className="mt-sm max-w-xl"
          />
        </div>

        <div className="gap-md mt-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="f-visibility" className="text-muted text-xs font-medium">
              חשיפה
            </Label>
            <Select
              value={f.visibility || "all"}
              onValueChange={(v) => setF({ ...f, visibility: v === "all" ? "" : v })}
            >
              <SelectTrigger id="f-visibility" className="mt-xxs">
                <SelectValue placeholder="הכל" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="private">פרטי</SelectItem>
                <SelectItem value="b2b">B2B</SelectItem>
                <SelectItem value="b2c">B2C</SelectItem>
                <SelectItem value="both">שניהם</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-status" className="text-muted text-xs font-medium">
              סטטוס
            </Label>
            <Select
              value={f.status || "all"}
              onValueChange={(v) => setF({ ...f, status: v === "all" ? "" : v })}
            >
              <SelectTrigger id="f-status" className="mt-xxs">
                <SelectValue placeholder="הכל" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="sold">נמכר</SelectItem>
                <SelectItem value="hidden">מוסתר</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-make" className="text-muted text-xs font-medium">
              יצרן
            </Label>
            <Input
              id="f-make"
              type="text"
              value={f.make}
              onChange={(e) => setF({ ...f, make: e.target.value })}
              className="mt-xxs"
            />
          </div>
          <div>
            <Label htmlFor="f-model" className="text-muted text-xs font-medium">
              דגם
            </Label>
            <Input
              id="f-model"
              type="text"
              value={f.model}
              onChange={(e) => setF({ ...f, model: e.target.value })}
              className="mt-xxs"
            />
          </div>
        </div>
        <div className="mt-lg flex justify-end">
          <Button type="submit" disabled={parsingSmart} aria-busy={parsingSmart || undefined}>
            {parsingSmart ? "מנתח…" : "חפש"}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="inv-list-heading" className="mt-2xl">
        <h2 id="inv-list-heading" className="sr-only">
          כל הרכבים במערכת
        </h2>

        {!data ? (
          <InventorySkeleton />
        ) : data.items.length === 0 ? (
          <p className="text-muted py-3xl text-center text-sm" role="status">
            לא נמצאו רכבים תואמים.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="md:hidden" aria-label="כל הרכבים במערכת">
              {data.items.map((r) => (
                <AdminInventoryCardRow key={r.id} row={r} />
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <caption className="sr-only">כל הרכבים במערכת</caption>
                <TableHeader>
                  <TableRow className="border-hairline">
                    <TableHead>רכב</TableHead>
                    <TableHead>סוחר</TableHead>
                    <TableHead>חשיפה</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead className="text-end">מחיר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((r) => {
                    const priceF = formatPrice(r.price);
                    return (
                      <TableRow
                        key={r.id}
                        className="border-hairline hover:bg-muted/5 duration-fast transition-colors"
                      >
                        <TableCell>
                          <Link
                            href={`/admin/inventory/${r.id}`}
                            className="text-ink duration-fast hover:text-accent focus-visible:outline-accent text-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            {r.make} {r.model}{" "}
                            <span className="text-muted font-tabular font-normal">· {r.year}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted text-sm">
                          {r.dealer_business_name}
                          {r.dealer_city ? (
                            <>
                              <span aria-hidden="true" className="text-subtle mx-xxs">
                                ·
                              </span>
                              {r.dealer_city}
                            </>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {VISIBILITY_LABEL[r.visibility]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <AdminStatusPill variant={statusVariant(r.status)}>
                            {STATUS_LABEL[r.status]}
                          </AdminStatusPill>
                          {r.paused_until ? (
                            <span className="text-warn-fg mt-xxs font-tabular block text-xs">
                              מושהה עד {new Date(r.paused_until).toLocaleDateString("he-IL")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end">
                          <span className="font-tabular text-ink text-sm">
                            <span aria-hidden="true">{priceF.visual}</span>
                            <span className="sr-only">{priceF.sr}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {data && data.pages > 1 ? (
        <TablePagination
          page={page}
          pages={data.pages}
          onGo={(p) => setPage(Math.max(1, Math.min(data.pages, p)))}
        />
      ) : null}
    </div>
  );
}

function AdminInventoryCardRow({ row }: { row: Row }) {
  const priceF = formatPrice(row.price);
  return (
    <li className="border-hairline gap-md py-md flex items-start border-b last:border-b-0">
      <Link
        href={`/admin/inventory/${row.id}`}
        className="gap-md duration-fast hover:text-accent focus-visible:outline-accent flex flex-1 items-start transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {row.primary_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.primary_image_url}
            alt=""
            loading="lazy"
            className="border-hairline h-20 w-24 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="border-hairline bg-paper text-subtle flex h-20 w-24 shrink-0 items-center justify-center rounded-md border"
          >
            <Car className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-medium">
            {row.make} {row.model}{" "}
            <span className="text-muted font-tabular font-normal">· {row.year}</span>
          </p>
          <p className="text-muted mt-xxs truncate text-xs">
            {row.dealer_business_name}
            {row.dealer_city ? ` · ${row.dealer_city}` : ""}
          </p>
          <div className="gap-xs mt-xs flex flex-wrap items-center">
            <AdminStatusPill variant={statusVariant(row.status)}>
              {STATUS_LABEL[row.status]}
            </AdminStatusPill>
            <Badge variant="outline" className="font-normal">
              {VISIBILITY_LABEL[row.visibility]}
            </Badge>
          </div>
        </div>
        <div className="text-end">
          <p className="text-ink font-tabular text-sm font-semibold">
            <span aria-hidden="true">{priceF.visual}</span>
            <span className="sr-only">{priceF.sr}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

function InventorySkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען רכבים…</span>
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="border-hairline py-md grid grid-cols-5 gap-4 border-b">
          {[0, 1, 2, 3, 4].map((c) => (
            <Skeleton key={c} className="h-4 w-2/3" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="border-hairline py-md grid grid-cols-5 gap-4 border-b last:border-b-0"
          >
            {[0, 1, 2, 3, 4].map((c) => (
              <Skeleton key={c} className="h-4 w-3/4" />
            ))}
          </div>
        ))}
      </div>
      {/* Mobile */}
      <ul className="md:hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="border-hairline gap-md py-md flex items-start border-b last:border-b-0"
          >
            <Skeleton className="h-20 w-24 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
