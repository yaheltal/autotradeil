"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive, Search, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AdminMasthead } from "@/components/admin/AdminMasthead";
import { AdminStatusPill } from "@/components/admin/AdminStatusPill";
import { TablePagination } from "@/components/admin/TablePagination";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useSmartDealerFilters } from "@/hooks/useSmartDealerFilters";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/*
 * /admin/dealers — editorial operator roster.
 *
 *   סוחרים                                       [ארכיון]
 *   ──────────
 *   {total} סוחרים · {pending} ממתינים            ← dek + count byline
 *
 *   [פעיל · מאושר · נדחה · הכל]                  ← pill tabs (status)
 *
 *   🔍 חיפוש חכם   ← Claude parses Hebrew NL into filters
 *   [tier]  [kyc]                                ← two shadcn Selects
 *
 *   ┌── שם · עיר · סטטוס · דרגה · ציון · עסקאות · KYC · חבר מאז · פעולות ──┐
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   הקודם · עמוד N מתוך M · הבא
 *
 * Workhorse of the admin section — the table contract every other
 * list page reuses. Status pill variants come from AdminStatusPill;
 * dealer status uses ink (verified) / muted (pending) / danger
 * (rejected). KYC follows the same scale.
 */

type DealerListItem = {
  id: string;
  email: string;
  business_name: string;
  contact_name: string;
  city: string;
  verified: boolean;
  rejected_at: string | null;
  rejection_reason: string | null;
  tier: Tier;
  trust_score: number | string;
  created_at: string;
  deals_completed: number;
  kyc_status: "pending" | "submitted" | "approved" | "rejected";
  member_since: string | null;
  suspended_at: string | null;
};

type ListResponse = {
  items: DealerListItem[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

const STATUS_TABS = [
  { key: "", label: "הכל" },
  { key: "pending", label: "ממתין" },
  { key: "verified", label: "מאושר" },
  { key: "rejected", label: "נדחה" },
] as const;

const KYC_LABEL: Record<DealerListItem["kyc_status"], string> = {
  pending: "ממתין",
  submitted: "הוגש",
  approved: "אושר",
  rejected: "נדחה",
};

function deriveDealerStatusVariant(d: DealerListItem): {
  variant: "ink" | "neutral" | "danger" | "accent";
  label: string;
} {
  if (d.suspended_at) return { variant: "danger", label: "מושעה" };
  if (d.rejected_at) return { variant: "danger", label: "נדחה" };
  if (d.verified) return { variant: "ink", label: "מאושר" };
  return { variant: "neutral", label: "ממתין" };
}

function deriveKycVariant(
  status: DealerListItem["kyc_status"],
): "ink" | "neutral" | "accent" | "danger" {
  if (status === "approved") return "accent";
  if (status === "rejected") return "danger";
  if (status === "submitted") return "ink";
  return "neutral";
}

export default function DealersListPage() {
  return (
    <Suspense fallback={null}>
      <DealersListPageInner />
    </Suspense>
  );
}

function DealersListPageInner() {
  const { token, loading } = useAdminAuth();
  const router = useRouter();
  const params = useSearchParams();

  const statusParam = params.get("status") ?? "";
  const searchParam = params.get("search") ?? "";
  const tierParam = params.get("tier") ?? "";
  const kycParam = params.get("kyc_status") ?? "";
  const pageParam = parseInt(params.get("page") ?? "1", 10) || 1;

  const [searchInput, setSearchInput] = useState(searchParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { parse: parseSmart, busy: parsingSmart } = useSmartDealerFilters(token);

  const handleSmartSearch = async () => {
    const q = searchInput.trim();
    if (!q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const parsed = await parseSmart(q);
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (parsed) {
      const f = parsed.filters;
      if (f.status && !statusParam) next.set("status", f.status);
      if (f.tier && !tierParam) next.set("tier", f.tier);
      if (f.kyc_status && !kycParam) next.set("kyc_status", f.kyc_status);
      const remainder = f.search ?? (f.city ? f.city : null);
      if (remainder) next.set("search", remainder);
      else next.delete("search");
    } else {
      next.set("search", q);
    }
    router.replace(`/admin/dealers?${next.toString()}`);
  };

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchInput === searchParam) return;
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (searchInput) next.set("search", searchInput);
      else next.delete("search");
      next.delete("page");
      router.replace(`/admin/dealers?${next.toString()}`);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, searchParam, params, router]);

  const dealersQuery = useQuery({
    queryKey: queryKeys.admin.dealers({
      status: statusParam,
      search: searchParam,
      tier: tierParam,
      kyc_status: kycParam,
      page: pageParam,
    }),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (statusParam) qs.set("status", statusParam);
      if (searchParam) qs.set("search", searchParam);
      if (tierParam) qs.set("tier", tierParam);
      if (kycParam) qs.set("kyc_status", kycParam);
      qs.set("page", String(pageParam));
      qs.set("per_page", "20");
      return apiFetch<ListResponse>(`/api/v1/admin/dealers?${qs.toString()}`, { token: token! });
    },
    enabled: !!token,
  });

  const data = dealersQuery.data ?? null;
  const error =
    dealersQuery.error instanceof Error
      ? dealersQuery.error.message
      : dealersQuery.error
        ? "שגיאה בטעינת הרשימה"
        : null;

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  const setQuery = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/admin/dealers?${next.toString()}`);
  };

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    router.push(`/admin/dealers?${next.toString()}`);
  };

  return (
    <div className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl">
      <AdminMasthead
        title="סוחרים"
        dek={<span>נהל את כל בקשות ההרשמה והפרופילים</span>}
        loading={loading || (!data && !error)}
        count={data ? `${data.total.toLocaleString("he-IL")} סוחרים` : undefined}
        headingRef={headingRef}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/dealers/archived">
              <Archive aria-hidden="true" />
              <span>ארכיון</span>
            </Link>
          </Button>
        }
      />

      {/* ── STATUS TABS ─────────────────────────────────────────────── */}
      <nav aria-label="סינון לפי סטטוס" className="mt-2xl">
        <ul className="gap-md flex items-center overflow-x-auto">
          {STATUS_TABS.map((t) => {
            const isCurrent = t.key === statusParam;
            const href = t.key ? `/admin/dealers?status=${t.key}` : "/admin/dealers";
            return (
              <li key={t.key || "all"}>
                <Link
                  href={href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={[
                    "duration-fast pb-xxs inline-flex items-center text-sm transition-colors",
                    "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4",
                    isCurrent
                      ? "text-ink border-ink border-b-2 font-medium"
                      : "text-muted hover:text-ink",
                  ].join(" ")}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── SMART SEARCH ────────────────────────────────────────────── */}
      <form
        role="search"
        aria-label="חיפוש סוחרים"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSmartSearch();
        }}
        className="mt-xl"
      >
        <div className="gap-xxs flex items-center">
          <Sparkles aria-hidden="true" className="text-accent h-3.5 w-3.5" />
          <Label htmlFor="dealer-search" className="text-ink text-sm font-medium">
            חיפוש חכם
          </Label>
        </div>
        <p id="dealer-search-hint" className="text-muted mt-xxs text-xs">
          דוגמאות: ״סוחרים שלא אומתו״, ״סוחרי גולד״, ״TalCars״, ״סוחרים עם KYC הוגש״ — או חיפוש רגיל
          לפי שם עסק / איש קשר / אימייל.
        </p>
        <div className="gap-sm mt-sm flex max-w-xl">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2"
            />
            <Input
              id="dealer-search"
              type="search"
              autoComplete="off"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-describedby="dealer-search-hint"
              aria-busy={parsingSmart || undefined}
              className="pe-10"
            />
          </div>
          <Button type="submit" disabled={parsingSmart || !searchInput.trim()}>
            {parsingSmart ? "מנתח…" : "חפש"}
          </Button>
        </div>
      </form>

      {/* ── FILTERS (tier + KYC) ────────────────────────────────────── */}
      <div className="gap-md mt-lg grid grid-cols-1 sm:max-w-xl sm:grid-cols-2">
        <div>
          <Label htmlFor="dealer-tier" className="text-muted text-xs font-medium">
            דרגת אמון
          </Label>
          <Select
            value={tierParam || "all"}
            onValueChange={(v) => setQuery("tier", v === "all" ? "" : v)}
          >
            <SelectTrigger id="dealer-tier" className="mt-xxs">
              <SelectValue placeholder="הכל" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="bronze">ברונזה</SelectItem>
              <SelectItem value="silver">כסף</SelectItem>
              <SelectItem value="gold">זהב</SelectItem>
              <SelectItem value="platinum">פלטינה</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="dealer-kyc" className="text-muted text-xs font-medium">
            סטטוס אימות זהות
          </Label>
          <Select
            value={kycParam || "all"}
            onValueChange={(v) => setQuery("kyc_status", v === "all" ? "" : v)}
          >
            <SelectTrigger id="dealer-kyc" className="mt-xxs">
              <SelectValue placeholder="הכל" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="submitted">הוגש</SelectItem>
              <SelectItem value="approved">אושר</SelectItem>
              <SelectItem value="rejected">נדחה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── TABLE ───────────────────────────────────────────────────── */}
      <section aria-labelledby="dealers-list-heading" className="mt-2xl">
        <h2 id="dealers-list-heading" className="sr-only">
          רשימת סוחרים
        </h2>

        {!data ? (
          <DealerTableSkeleton />
        ) : data.items.length === 0 ? (
          <p className="text-muted py-3xl text-center text-sm" role="status">
            לא נמצאו סוחרים התואמים לסינון.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">רשימת סוחרים</caption>
              <TableHeader>
                <TableRow className="border-hairline">
                  <TableHead>שם עסק</TableHead>
                  <TableHead>עיר</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>דרגה</TableHead>
                  <TableHead className="text-end">ציון</TableHead>
                  <TableHead className="text-end">עסקאות</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead>חבר מאז</TableHead>
                  <TableHead className="text-end">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((d) => {
                  const status = deriveDealerStatusVariant(d);
                  const memberSince = d.member_since ?? d.created_at;
                  return (
                    <TableRow
                      key={d.id}
                      className="border-hairline hover:bg-muted/5 duration-fast transition-colors"
                    >
                      <TableCell>
                        <Link
                          href={`/admin/dealers/${d.id}`}
                          className="text-ink duration-fast hover:text-accent focus-visible:outline-accent text-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {d.business_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted text-sm">{d.city}</TableCell>
                      <TableCell>
                        <AdminStatusPill variant={status.variant}>{status.label}</AdminStatusPill>
                      </TableCell>
                      <TableCell>
                        <TrustBadge tier={d.tier} compact />
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="font-tabular text-ink text-sm">{d.trust_score}</span>
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="font-tabular text-ink text-sm">{d.deals_completed}</span>
                      </TableCell>
                      <TableCell>
                        <AdminStatusPill variant={deriveKycVariant(d.kyc_status)}>
                          {KYC_LABEL[d.kyc_status]}
                        </AdminStatusPill>
                      </TableCell>
                      <TableCell className="text-muted text-xs">
                        <time dateTime={memberSince} className="font-tabular">
                          {new Date(memberSince).toLocaleDateString("he-IL", {
                            year: "numeric",
                            month: "short",
                          })}
                        </time>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/dealers/${d.id}`}>
                            פרטים
                            <span className="sr-only"> של {d.business_name}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {data && data.pages > 1 ? (
        <TablePagination page={data.page} pages={data.pages} onGo={goToPage} />
      ) : null}
    </div>
  );
}

function DealerTableSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען רשימת סוחרים…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-hairline gap-md py-md flex items-center border-b last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="ms-auto h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
