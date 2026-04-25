"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatusBadge, deriveStatus } from "@/components/StatusBadge";
import { TrustBadge, type Tier } from "@/components/TrustBadge";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiFetch } from "@/lib/api";

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
  // Phase 4.4
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

export default function DealersListPage() {
  const { token, loading } = useAdminAuth();
  const router = useRouter();
  const params = useSearchParams();

  const statusParam = params.get("status") ?? "";
  const searchParam = params.get("search") ?? "";
  const tierParam = params.get("tier") ?? "";
  const kycParam = params.get("kyc_status") ?? "";
  const pageParam = parseInt(params.get("page") ?? "1", 10) || 1;

  const [searchInput, setSearchInput] = useState(searchParam);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync when URL changes (back/forward).
  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  // Debounced URL update on typing.
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

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingData(true);
    setError(null);
    const qs = new URLSearchParams();
    if (statusParam) qs.set("status", statusParam);
    if (searchParam) qs.set("search", searchParam);
    if (tierParam) qs.set("tier", tierParam);
    if (kycParam) qs.set("kyc_status", kycParam);
    qs.set("page", String(pageParam));
    qs.set("per_page", "20");
    (async () => {
      try {
        const res = await apiFetch<ListResponse>(`/api/v1/admin/dealers?${qs.toString()}`, {
          token,
        });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינת הרשימה");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, statusParam, searchParam, tierParam, kycParam, pageParam]);

  const setQuery = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/admin/dealers?${next.toString()}`);
  };

  if (loading) {
    return (
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <p role="status" className="text-brand-ink/70 p-10">
          טוען…
        </p>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-brand-navy text-3xl font-bold tracking-tight">סוחרים</h1>
        <p className="text-brand-ink/70 mt-2">נהל את כל בקשות ההרשמה והפרופילים.</p>

        <nav aria-label="סינון לפי סטטוס" className="border-brand-navy/10 mt-8 border-b">
          <ul className="flex gap-1">
            {STATUS_TABS.map((t) => {
              const isCurrent = t.key === statusParam;
              const href = t.key ? `/admin/dealers?status=${t.key}` : "/admin/dealers";
              return (
                <li key={t.key || "all"}>
                  <Link
                    href={href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={[
                      "inline-flex min-h-11 items-center rounded-t-md px-4 py-2 text-sm font-semibold",
                      "focus-visible:outline-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2",
                      isCurrent
                        ? "bg-brand-navy text-brand-cream"
                        : "text-brand-ink/70 hover:bg-brand-navy/5 hover:text-brand-navy",
                    ].join(" ")}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6">
          <label htmlFor="dealer-search" className="text-brand-navy block text-sm font-medium">
            חיפוש
          </label>
          <p id="dealer-search-hint" className="text-brand-navy/70 mt-1 text-xs">
            חיפוש לפי שם עסק, שם איש קשר, או אימייל.
          </p>
          <input
            id="dealer-search"
            type="search"
            autoComplete="off"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-describedby="dealer-search-hint"
            className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full max-w-md rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:max-w-2xl sm:grid-cols-2">
          <div>
            <label htmlFor="dealer-tier" className="text-brand-navy block text-xs font-semibold">
              דרגת אמון
            </label>
            <select
              id="dealer-tier"
              dir="rtl"
              value={tierParam}
              onChange={(e) => setQuery("tier", e.target.value)}
              className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="">הכל</option>
              <option value="bronze">ברונזה</option>
              <option value="silver">כסף</option>
              <option value="gold">זהב</option>
              <option value="platinum">פלטינה</option>
            </select>
          </div>
          <div>
            <label htmlFor="dealer-kyc" className="text-brand-navy block text-xs font-semibold">
              סטטוס אימות זהות
            </label>
            <select
              id="dealer-kyc"
              dir="rtl"
              value={kycParam}
              onChange={(e) => setQuery("kyc_status", e.target.value)}
              className="border-brand-navy/20 focus-visible:outline-brand-navy mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="">הכל</option>
              <option value="pending">ממתין</option>
              <option value="submitted">הוגש</option>
              <option value="approved">אושר</option>
              <option value="rejected">נדחה</option>
            </select>
          </div>
        </div>

        {error ? (
          <p role="alert" className="bg-danger-bg text-danger-text mt-6 rounded-md px-4 py-3">
            {error}
          </p>
        ) : null}

        <div
          role="region"
          aria-label="רשימת סוחרים"
          tabIndex={0}
          className="border-brand-navy/10 focus-visible:outline-brand-navy mt-6 overflow-x-auto rounded-lg border bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-start text-sm">
            <caption className="sr-only">רשימת סוחרים</caption>
            <thead className="bg-brand-navy/5 text-brand-navy">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  שם עסק
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  עיר
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  סטטוס
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  דרגה
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  ציון אמון
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  עסקאות
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  KYC
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  חבר מאז
                </th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingData && !data ? (
                <tr>
                  <td colSpan={9} className="text-brand-ink/60 px-4 py-8 text-center">
                    <span role="status">טוען…</span>
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-brand-ink/60 px-4 py-10 text-center">
                    <span role="status">לא נמצאו סוחרים התואמים לסינון.</span>
                  </td>
                </tr>
              ) : (
                data?.items.map((d) => {
                  const status = deriveStatus(d);
                  const kycLabel = {
                    pending: "ממתין",
                    submitted: "הוגש",
                    approved: "אושר",
                    rejected: "נדחה",
                  }[d.kyc_status];
                  const memberSince = d.member_since ?? d.created_at;
                  return (
                    <tr key={d.id} className="border-brand-navy/10 hover:bg-brand-navy/5 border-t">
                      <td className="text-brand-navy px-4 py-3 font-medium">
                        <Link
                          href={`/admin/dealers/${d.id}`}
                          className="text-brand-navy focus-visible:outline-brand-navy rounded font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {d.business_name}
                        </Link>
                        {d.suspended_at ? (
                          <span className="ms-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-700/30">
                            מושעה
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{d.city}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <TrustBadge tier={d.tier} compact />
                      </td>
                      <td className="text-brand-ink px-4 py-3 font-mono">{d.trust_score}</td>
                      <td className="text-brand-ink px-4 py-3">{d.deals_completed}</td>
                      <td className="text-brand-ink/80 px-4 py-3 text-xs">{kycLabel}</td>
                      <td className="text-brand-ink/70 px-4 py-3 text-xs">
                        <time dateTime={memberSince}>
                          {new Date(memberSince).toLocaleDateString("he-IL", {
                            year: "numeric",
                            month: "short",
                          })}
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/dealers/${d.id}`}
                          className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          פרטים
                          <span className="sr-only"> של {d.business_name}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.pages > 1 ? (
          <Pagination
            page={data.page}
            pages={data.pages}
            onGo={(p) => {
              const next = new URLSearchParams(params.toString());
              next.set("page", String(p));
              router.push(`/admin/dealers?${next.toString()}`);
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function Pagination({
  page,
  pages,
  onGo,
}: {
  page: number;
  pages: number;
  onGo: (p: number) => void;
}) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pages;

  // Use a mounted-after-first-paint role="status" so SR announces only on
  // page changes, not on initial mount.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    setAnnounce(true);
  }, [page]);

  return (
    <nav aria-label="עימוד" className="mt-6 flex items-center justify-between">
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={prevDisabled}
        className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        הקודם
      </button>
      <p className="text-brand-ink/70 text-sm">
        עמוד <span className="text-brand-navy font-semibold">{page}</span> מתוך{" "}
        <span className="text-brand-navy font-semibold">{pages}</span>
      </p>
      {announce ? (
        <p role="status" className="sr-only">
          עמוד {page} מתוך {pages}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={nextDisabled}
        className="border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        הבא
      </button>
    </nav>
  );
}
