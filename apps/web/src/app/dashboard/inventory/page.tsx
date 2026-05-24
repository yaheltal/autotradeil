"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Car,
  ImageIcon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { DeleteInventoryDialog } from "@/components/DeleteInventoryDialog";
import type { InventoryInitial, InventoryPayload } from "@/components/InventoryFormDialog";
import { MobileFAB } from "@/components/MobileFAB";
import { PauseDialog } from "@/components/PauseDialog";
import { type InventoryStatus } from "@/components/StatusBadge";
import { VehicleFullDetailsDialog } from "@/components/VehicleFullDetailsDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { apiFetch } from "@/lib/api";
import { formatMileage, formatPrice } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";

/*
 * Lazy-loaded heavy dialogs — these are click-triggered and bring in
 * ~2,200 lines of form/image/upload code. Splitting them out keeps the
 * initial inventory bundle small.
 */
const InventoryFormDialog = dynamic(
  () => import("@/components/InventoryFormDialog").then((m) => m.InventoryFormDialog),
  { ssr: false },
);
const SellVehicleDialog = dynamic(
  () => import("@/components/SellVehicleDialog").then((m) => m.SellVehicleDialog),
  { ssr: false },
);
const VehicleImagesDialog = dynamic(
  () => import("@/components/VehicleImagesDialog").then((m) => m.VehicleImagesDialog),
  { ssr: false },
);

/*
 * /dashboard/inventory — editorial ledger.
 *
 *   מלאי                                        [+ הוסף רכב]
 *   ──────────
 *   12 פעילים · 5 נמכרו · 2 מוסתרים            ← dek (font-tabular)
 *
 *   [🔍 חיפוש…           ]   פעיל · 12  נמכר · 5  מוסתר · 2  הכל · 19
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ thumb · רכב · חשיפה · סטטוס · מחיר · ק"מ ·   ⋯           │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Desktop: shadcn <Table>. Mobile: thumbnail-left card stack.
 * Per-row actions: visible Edit + kebab DropdownMenu for the rest.
 * The dek + tabular ledger styling reads like a wholesale-auction
 * catalogue — quiet, dense, easy to scan.
 *
 * Auth + TanStack mutations + dialog wiring preserved verbatim from
 * the Phase 4 conversion; only the surface is rebuilt.
 */

type Item = {
  id: string;
  dealer_id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  color: string | null;
  transmission: "automatic" | "manual" | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | null;
  engine_volume: number | string | null;
  notes: string | null;
  status: InventoryStatus;
  is_b2b: boolean;
  b2b_price: number | null;
  visibility: "private" | "b2b" | "b2c" | "both";
  b2c_price: number | null;
  paused_until: string | null;
  pause_reason: string | null;
  purchase_cost: number | null;
  sale_price: number | null;
  sold_at: string | null;
  sold_to: "b2b" | "b2c" | "external" | null;
  warranty_type: "manufacturer" | "dealer" | "extended" | "none" | null;
  warranty_until: string | null;
  created_at: string;
  updated_at: string;
  primary_image_url: string | null;
};

type ListResponse = {
  items: Item[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

// Tabs render in source order; with the page in dir="rtl" the FIRST tab
// sits visually on the RIGHT. "פעיל" leads, "הכל" closes the row.
const STATUS_TABS = [
  { key: "active", label: "פעיל" },
  { key: "sold", label: "נמכר" },
  { key: "hidden", label: "מוסתר" },
  { key: "", label: "הכל" },
] as const;

const VISIBILITY_LABELS: Record<Item["visibility"], string> = {
  private: "פרטי",
  b2b: "B2B",
  b2c: "B2C",
  both: "B2B + B2C",
};

const STATUS_LABELS: Record<InventoryStatus, string> = {
  active: "פעיל",
  sold: "נמכר",
  hidden: "מוסתר",
};

const FUEL_LABELS: Record<NonNullable<Item["fuel_type"]>, string> = {
  petrol: "בנזין",
  diesel: "דיזל",
  electric: "חשמלי",
  hybrid: "היברידי",
};

const TRANSMISSION_LABELS: Record<NonNullable<Item["transmission"]>, string> = {
  automatic: "אוטומט",
  manual: "ידני",
};

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryPageInner />
    </Suspense>
  );
}

function InventoryPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Default to the "active" tab — dealers care about live listings 95% of
  // the time, so landing on "הכל" was hiding the answer to "what's
  // selling right now".
  const statusParam = params.get("status") ?? "active";

  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const qc = useQueryClient();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const editBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInitial, setEditingInitial] = useState<InventoryInitial | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);

  const [imagesOpen, setImagesOpen] = useState(false);
  const [imagesVehicle, setImagesVehicle] = useState<Item | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsVehicleId, setDetailsVehicleId] = useState<string | null>(null);

  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseVehicle, setPauseVehicle] = useState<Item | null>(null);

  const [sellOpen, setSellOpen] = useState(false);
  const [sellVehicle, setSellVehicle] = useState<Item | null>(null);

  // Auth bootstrap (Supabase isn't a TanStack resource — its own listener
  // owns the session).
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?next=/dashboard/inventory");
        return;
      }
      setToken(session.access_token);
    })();
  }, [router]);

  // Smart filters — Hebrew NL query parsed by Claude → make/model/year/
  // price filters that the backend accepts. The status tab and smart
  // filters compose.
  const [smartQuery, setSmartQuery] = useState("");
  const [smartMake, setSmartMake] = useState("");
  const [smartModel, setSmartModel] = useState("");
  const [smartYearMin, setSmartYearMin] = useState<number | null>(null);
  const [smartYearMax, setSmartYearMax] = useState<number | null>(null);
  const [smartPriceMin, setSmartPriceMin] = useState<number | null>(null);
  const [smartPriceMax, setSmartPriceMax] = useState<number | null>(null);
  const [smartFallbackQ, setSmartFallbackQ] = useState("");
  const { parse: parseSmart, busy: parsingSmart } = useSmartFilters(token);

  const filters = useMemo(
    () => ({
      status: statusParam || undefined,
      make: smartMake || undefined,
      model: smartModel || undefined,
      year_min: smartYearMin ?? undefined,
      year_max: smartYearMax ?? undefined,
      price_min: smartPriceMin ?? undefined,
      price_max: smartPriceMax ?? undefined,
      q: smartFallbackQ || undefined,
      per_page: 50,
    }),
    [
      statusParam,
      smartMake,
      smartModel,
      smartYearMin,
      smartYearMax,
      smartPriceMin,
      smartPriceMax,
      smartFallbackQ,
    ],
  );

  const inventoryQuery = useQuery({
    queryKey: queryKeys.inventory.list(filters),
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      return apiFetch<ListResponse>(
        `/api/v1/inventory${qs.toString() ? `?${qs.toString()}` : ""}`,
        { token: token! },
      );
    },
    enabled: !!token,
  });

  // For the dek + tab tallies we need the unfiltered counts across all
  // statuses. per_page is capped at 100 by the backend (Pydantic
  // Query(le=100) on apps/api/app/routers/inventory.py) — a previous
  // value of 1000 was rejected with 422 and silently zeroed the dek.
  // Dealers with >100 items will undercount; we'll move to a dedicated
  // /inventory/stats-like aggregation endpoint when that case becomes
  // real.
  const tallyQuery = useQuery({
    queryKey: ["inventory", "tallies"] as const,
    queryFn: () => apiFetch<ListResponse>("/api/v1/inventory?per_page=100", { token: token! }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const data = inventoryQuery.data ?? null;
  const tallies = useMemo(() => {
    const items = tallyQuery.data?.items ?? [];
    return {
      active: items.filter((i) => i.status === "active").length,
      sold: items.filter((i) => i.status === "sold").length,
      hidden: items.filter((i) => i.status === "hidden").length,
      total: items.length,
    };
  }, [tallyQuery.data]);

  // Dealer-facing — generic Hebrew, no raw fetch detail to the sales floor.
  useEffect(() => {
    if (inventoryQuery.error) setError("אירעה שגיאה, אנא נסה שוב מאוחר יותר");
  }, [inventoryQuery.error]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.inventory.root() });
    await qc.invalidateQueries({ queryKey: ["inventory", "tallies"] });
  };

  const onSmartSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = smartQuery.trim();
    if (!q) {
      clearSmartSearch();
      return;
    }
    const parsed = await parseSmart(q);
    if (parsed) {
      setSmartMake(parsed.filters.make ?? "");
      setSmartModel(parsed.filters.model ?? "");
      setSmartYearMin(parsed.filters.year_min);
      setSmartYearMax(parsed.filters.year_max);
      setSmartPriceMin(parsed.filters.price_min);
      setSmartPriceMax(parsed.filters.price_max);
      setSmartFallbackQ(parsed.fallback_q ?? "");
    }
  };

  const clearSmartSearch = () => {
    setSmartQuery("");
    setSmartMake("");
    setSmartModel("");
    setSmartYearMin(null);
    setSmartYearMax(null);
    setSmartPriceMin(null);
    setSmartPriceMax(null);
    setSmartFallbackQ("");
  };

  const hasActiveSmartFilter = !!(
    smartMake ||
    smartModel ||
    smartYearMin ||
    smartYearMax ||
    smartPriceMin ||
    smartPriceMax ||
    smartFallbackQ
  );

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setEditingInitial(null);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setFormMode("edit");
    setEditingId(item.id);
    setEditingInitial({
      id: item.id,
      make: item.make,
      model: item.model,
      year: item.year,
      mileage: item.mileage,
      price: item.price,
      color: item.color,
      transmission: item.transmission,
      fuel_type: item.fuel_type,
      engine_volume: item.engine_volume == null ? null : Number(item.engine_volume),
      notes: item.notes,
      visibility: item.visibility,
      b2b_price: item.b2b_price,
      b2c_price: item.b2c_price,
    });
    setFormOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: InventoryPayload) =>
      apiFetch<{ id: string }>("/api/v1/inventory", {
        method: "POST",
        token: token!,
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setToast("הרכב נוסף למלאי");
      void refresh();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InventoryPayload }) =>
      apiFetch(`/api/v1/inventory/${id}`, {
        method: "PUT",
        token: token!,
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, vars) => {
      setToast("הרכב עודכן");
      void refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.inventory.detail(vars.id) });
    },
  });

  const submitItem = async (payload: InventoryPayload) => {
    if (!token) return;
    if (formMode === "create") {
      return await createMutation.mutateAsync(payload);
    }
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, payload });
    }
  };

  const openDelete = (item: Item) => {
    setDeletingItem(item);
    setDeleteOpen(true);
  };

  const unpauseMutation = useMutation({
    mutationFn: (item: Item) =>
      apiFetch(`/api/v1/inventory/${item.id}/unpause`, { method: "POST", token: token! }),
    onSuccess: () => {
      setToast("הרכב חודש");
      void refresh();
    },
    onError: () => setError("אירעה שגיאה בחידוש הרכב, אנא נסה שוב"),
  });

  const unpauseVehicle = (item: Item) => unpauseMutation.mutate(item);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/inventory/${id}?mode=soft`, { method: "DELETE", token: token! }),
    onSuccess: async () => {
      setToast("הרכב נמחק");
      await refresh();
    },
  });

  const confirmDelete = async () => {
    if (!token || !deletingItem) return;
    // Compute focus target BEFORE the list refreshes.
    const items = data?.items ?? [];
    const idx = items.findIndex((i) => i.id === deletingItem.id);
    const targetId = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
    await deleteMutation.mutateAsync(deletingItem.id);
    queueMicrotask(() => {
      if (targetId && editBtnRefs.current.get(targetId)) {
        editBtnRefs.current.get(targetId)?.focus();
      } else {
        addBtnRef.current?.focus();
      }
    });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="px-lg sm:px-2xl py-2xl mx-auto max-w-6xl focus:outline-none"
    >
      {/* ── MASTHEAD ──────────────────────────────────────────────────── */}
      <header>
        <div className="gap-md flex items-end justify-between">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none"
          >
            מלאי
          </h1>
          <Button ref={addBtnRef} type="button" onClick={openCreate} className="shrink-0">
            <Plus aria-hidden="true" />
            <span>הוסף רכב</span>
          </Button>
        </div>
        <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
        <p className="text-muted mt-lg font-tabular text-sm" role="status" aria-live="polite">
          {tallyQuery.isLoading ? (
            <Skeleton className="inline-block h-4 w-48" />
          ) : (
            <>
              {tallies.active} פעילים <span className="text-subtle mx-xxs">·</span> {tallies.sold}{" "}
              נמכרו <span className="text-subtle mx-xxs">·</span> {tallies.hidden} מוסתרים
            </>
          )}
        </p>
      </header>

      {/* Toast — transient live region for create/edit/delete announcements */}
      {toast ? (
        <p role="status" aria-live="polite" className="sr-only" key={toast}>
          {toast}
        </p>
      ) : null}

      {/* ── TOOLBAR (search + status tabs) ────────────────────────────── */}
      <div className="mt-3xl gap-lg md:gap-2xl flex flex-col md:flex-row md:items-center md:justify-between">
        <form
          role="search"
          aria-label="חיפוש חכם במלאי"
          onSubmit={onSmartSearch}
          className="md:max-w-md md:flex-1"
        >
          <label htmlFor="inv-smart" className="sr-only">
            חיפוש חכם במלאי
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2"
            />
            <Input
              id="inv-smart"
              type="search"
              autoComplete="off"
              value={smartQuery}
              onChange={(e) => setSmartQuery(e.target.value)}
              placeholder="חפש יצרן, דגם, שנה, או טווח מחירים"
              className="pe-10"
              aria-busy={parsingSmart || undefined}
            />
          </div>
        </form>
        <StatusTabs current={statusParam} tallies={tallies} />
      </div>

      {/* ── ACTIVE FILTER CHIPS ───────────────────────────────────────── */}
      {hasActiveSmartFilter ? (
        <div role="status" aria-live="polite" className="gap-xs mt-lg flex flex-wrap items-center">
          <span className="text-muted text-xs">מסונן:</span>
          {smartMake ? <FilterChip onClear={() => setSmartMake("")}>{smartMake}</FilterChip> : null}
          {smartModel ? (
            <FilterChip onClear={() => setSmartModel("")}>{smartModel}</FilterChip>
          ) : null}
          {(smartYearMin || smartYearMax) && smartYearMin === smartYearMax ? (
            <FilterChip
              onClear={() => {
                setSmartYearMin(null);
                setSmartYearMax(null);
              }}
            >
              שנה {smartYearMin}
            </FilterChip>
          ) : smartYearMin || smartYearMax ? (
            <FilterChip
              onClear={() => {
                setSmartYearMin(null);
                setSmartYearMax(null);
              }}
            >
              {smartYearMin ?? "?"}–{smartYearMax ?? "?"}
            </FilterChip>
          ) : null}
          {smartPriceMin || smartPriceMax ? (
            <FilterChip
              onClear={() => {
                setSmartPriceMin(null);
                setSmartPriceMax(null);
              }}
            >
              ₪{(smartPriceMin ?? 0).toLocaleString("he-IL")}
              {smartPriceMax ? `–${smartPriceMax.toLocaleString("he-IL")}` : "+"}
            </FilterChip>
          ) : null}
          {smartFallbackQ ? (
            <FilterChip onClear={() => setSmartFallbackQ("")}>״{smartFallbackQ}״</FilterChip>
          ) : null}
          <Button type="button" variant="link" size="sm" onClick={clearSmartSearch}>
            נקה הכל
          </Button>
        </div>
      ) : null}

      {/* ── ERROR ─────────────────────────────────────────────────────── */}
      {error ? (
        <Alert variant="destructive" className="mt-xl">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── LIST ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="list-heading" className="mt-2xl">
        <h2 id="list-heading" className="sr-only">
          רשימת רכבים
        </h2>

        {!data ? (
          <ListSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-hairline">
                    <TableHead className="w-20">תמונה</TableHead>
                    <TableHead>רכב</TableHead>
                    <TableHead>חשיפה</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead className="text-end">מחיר</TableHead>
                    <TableHead className="text-end">ק״מ</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <InventoryRow
                      key={item.id}
                      item={item}
                      editBtnRefs={editBtnRefs}
                      onEdit={openEdit}
                      onDelete={openDelete}
                      onManageImages={() => {
                        setImagesVehicle(item);
                        setImagesOpen(true);
                      }}
                      onShowDetails={() => {
                        setDetailsVehicleId(item.id);
                        setDetailsOpen(true);
                      }}
                      onMarkSold={() => {
                        setSellVehicle(item);
                        setSellOpen(true);
                      }}
                      onPause={() => {
                        setPauseVehicle(item);
                        setPauseOpen(true);
                      }}
                      onUnpause={() => unpauseVehicle(item)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card stack */}
            <ul className="md:hidden">
              {data.items.map((item) => (
                <InventoryCardRow
                  key={item.id}
                  item={item}
                  editBtnRefs={editBtnRefs}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onManageImages={() => {
                    setImagesVehicle(item);
                    setImagesOpen(true);
                  }}
                  onShowDetails={() => {
                    setDetailsVehicleId(item.id);
                    setDetailsOpen(true);
                  }}
                  onMarkSold={() => {
                    setSellVehicle(item);
                    setSellOpen(true);
                  }}
                  onPause={() => {
                    setPauseVehicle(item);
                    setPauseOpen(true);
                  }}
                  onUnpause={() => unpauseVehicle(item)}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── DIALOGS ───────────────────────────────────────────────────── */}
      {formOpen ? (
        <InventoryFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          onSubmit={submitItem}
          initial={editingInitial}
          mode={formMode}
          token={token!}
          onManageImages={(vehicleId) => {
            const vehicle = data?.items.find((v) => v.id === vehicleId);
            if (!vehicle) return;
            setFormOpen(false);
            setImagesVehicle(vehicle);
            setImagesOpen(true);
          }}
        />
      ) : null}

      <DeleteInventoryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        label={
          deletingItem ? `${deletingItem.make} ${deletingItem.model} שנת ${deletingItem.year}` : ""
        }
      />

      {pauseVehicle && token ? (
        <PauseDialog
          open={pauseOpen}
          onOpenChange={(v) => {
            setPauseOpen(v);
            if (!v) setPauseVehicle(null);
          }}
          token={token}
          inventoryId={pauseVehicle.id}
          vehicleLabel={`${pauseVehicle.make} ${pauseVehicle.model} ${pauseVehicle.year}`}
          onDone={() => {
            setToast("הרכב הושהה");
            void refresh();
          }}
        />
      ) : null}

      {sellVehicle && token ? (
        <SellVehicleDialog
          open={sellOpen}
          onOpenChange={(v) => {
            setSellOpen(v);
            if (!v) setSellVehicle(null);
          }}
          token={token}
          vehicle={{
            id: sellVehicle.id,
            make: sellVehicle.make,
            model: sellVehicle.model,
            year: sellVehicle.year,
            price: sellVehicle.price,
            b2b_price: sellVehicle.b2b_price,
            b2c_price: sellVehicle.b2c_price,
            purchase_cost: sellVehicle.purchase_cost ?? null,
          }}
          onSold={() => {
            setToast("הרכב סומן כנמכר");
            void refresh();
            // Move focus to the heading to avoid stranding it on the
            // unmounted "סמן כנמכר" trigger button.
            queueMicrotask(() => headingRef.current?.focus());
          }}
        />
      ) : null}

      {imagesVehicle && token ? (
        <VehicleImagesDialog
          open={imagesOpen}
          onOpenChange={(open) => {
            setImagesOpen(open);
            if (!open) setImagesVehicle(null);
          }}
          vehicle={{
            id: imagesVehicle.id,
            make: imagesVehicle.make,
            model: imagesVehicle.model,
            year: imagesVehicle.year,
          }}
          token={token}
        />
      ) : null}

      {/* Read-only "registration card". Endpoint=own ⇒ /api/v1/inventory/{id}
          which is dealer-scoped — never leaks across tenants. */}
      {detailsOpen && detailsVehicleId && token ? (
        <VehicleFullDetailsDialog
          open={detailsOpen}
          onOpenChange={(v) => {
            setDetailsOpen(v);
            if (!v) setDetailsVehicleId(null);
          }}
          token={token}
          vehicleId={detailsVehicleId}
          endpoint="own"
        />
      ) : null}

      {/* Mobile FAB — duplicates the masthead "הוסף רכב" so phone users
          have a thumb-reachable add action. Hidden on md+. */}
      <MobileFAB label="הוסף רכב" onClick={openCreate} />
    </main>
  );
}

// ============================================================================
// StatusTabs — pill-row tabs that drive the ?status= URL param.
// Inactive tabs are text-muted; active is text-ink with a 2px ink underline.
// ============================================================================

function StatusTabs({
  current,
  tallies,
}: {
  current: string;
  tallies: { active: number; sold: number; hidden: number; total: number };
}) {
  const counts: Record<string, number> = {
    active: tallies.active,
    sold: tallies.sold,
    hidden: tallies.hidden,
    "": tallies.total,
  };
  return (
    <nav aria-label="סינון מלאי לפי סטטוס">
      <ul className="gap-md flex items-center overflow-x-auto">
        {STATUS_TABS.map((t) => {
          const isCurrent = t.key === current;
          const href = t.key ? `/dashboard/inventory?status=${t.key}` : "/dashboard/inventory";
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
                <span className="text-subtle mx-xxs">·</span>
                <span className="font-tabular">{counts[t.key] ?? 0}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ============================================================================
// FilterChip — small dismissible chip for active smart-filter values.
// ============================================================================

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <Badge variant="outline" className="gap-xxs h-7 pe-1 ps-2 text-xs font-normal">
      <span>{children}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="הסר סינון"
        className="text-muted duration-fast hover:text-ink inline-flex h-5 w-5 items-center justify-center rounded-sm transition-colors"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

// ============================================================================
// InventoryRow — desktop <Table> row. One visible Edit icon-button + kebab.
// ============================================================================

type RowActions = {
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onManageImages: () => void;
  onShowDetails: () => void;
  onMarkSold: () => void;
  onPause: () => void;
  onUnpause: () => void;
};

function InventoryRow({
  item,
  editBtnRefs,
  ...actions
}: {
  item: Item;
  editBtnRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
} & RowActions) {
  const priceF = formatPrice(item.price);
  const mileageF = formatMileage(item.mileage);
  const fullLabel = `${item.make} ${item.model} שנת ${item.year}`;
  const isPaused = !!(item.paused_until || item.pause_reason);
  const subMeta = [
    item.transmission ? TRANSMISSION_LABELS[item.transmission] : null,
    item.fuel_type ? FUEL_LABELS[item.fuel_type] : null,
    item.color,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableRow className="border-hairline hover:bg-muted/5 duration-fast transition-colors">
      <TableCell>
        {item.primary_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.primary_image_url}
            alt=""
            loading="lazy"
            className="border-hairline h-12 w-16 rounded-md border object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="border-hairline bg-paper text-subtle flex h-12 w-16 items-center justify-center rounded-md border"
          >
            <Car className="h-4 w-4" />
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="text-ink text-sm font-medium">
          {item.make} {item.model}{" "}
          <span className="text-muted font-tabular font-normal">· {item.year}</span>
        </div>
        {subMeta ? <div className="text-muted text-xs">{subMeta}</div> : null}
        {isPaused ? (
          <div className="text-warn-fg gap-xxs mt-xxs inline-flex items-center text-xs">
            <Pause className="h-3 w-3" aria-hidden="true" />
            מושהה
            {item.paused_until
              ? ` · עד ${new Date(item.paused_until).toLocaleDateString("he-IL")}`
              : ""}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal">
          {VISIBILITY_LABELS[item.visibility]}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusPill status={item.status} />
      </TableCell>
      <TableCell className="text-end">
        {item.status === "sold" && item.sale_price != null ? (
          <SoldPriceCell sale={item.sale_price} cost={item.purchase_cost} />
        ) : (
          <span className="font-tabular text-sm">
            <span aria-hidden="true">{priceF.visual}</span>
            <span className="sr-only">{priceF.sr}</span>
          </span>
        )}
      </TableCell>
      <TableCell className="text-end">
        <span className="font-tabular text-sm">
          <span aria-hidden="true">{mileageF.visual}</span>
          <span className="sr-only">{mileageF.sr}</span>
        </span>
      </TableCell>
      <TableCell>
        <div className="gap-xs flex items-center justify-end">
          <Button
            ref={(el) => {
              if (el) editBtnRefs.current.set(item.id, el);
              else editBtnRefs.current.delete(item.id);
            }}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => actions.onEdit(item)}
            aria-label={`עריכת ${fullLabel}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <RowKebab item={item} isPaused={isPaused} fullLabel={fullLabel} {...actions} />
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// InventoryCardRow — mobile stacked card.
// ============================================================================

function InventoryCardRow({
  item,
  editBtnRefs,
  ...actions
}: {
  item: Item;
  editBtnRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
} & RowActions) {
  const priceF = formatPrice(item.price);
  const mileageF = formatMileage(item.mileage);
  const fullLabel = `${item.make} ${item.model} שנת ${item.year}`;
  const isPaused = !!(item.paused_until || item.pause_reason);

  return (
    <li className="border-hairline gap-md py-md flex items-start border-b last:border-b-0">
      {item.primary_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.primary_image_url}
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
        <div className="gap-sm flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-medium">
              {item.make} {item.model}{" "}
              <span className="text-muted font-tabular font-normal">· {item.year}</span>
            </p>
            <p className="text-muted font-tabular mt-xxs text-xs">
              <span aria-hidden="true">
                {priceF.visual} · {mileageF.visual}
              </span>
              <span className="sr-only">
                {priceF.sr}, {mileageF.sr}
              </span>
            </p>
            <div className="gap-xs mt-xs flex flex-wrap items-center">
              <StatusPill status={item.status} />
              <Badge variant="outline" className="font-normal">
                {VISIBILITY_LABELS[item.visibility]}
              </Badge>
              {isPaused ? (
                <span className="text-warn-fg gap-xxs inline-flex items-center text-xs">
                  <Pause className="h-3 w-3" aria-hidden="true" />
                  מושהה
                </span>
              ) : null}
            </div>
          </div>
          <div className="gap-xxs flex shrink-0 items-center">
            <Button
              ref={(el) => {
                if (el) editBtnRefs.current.set(item.id, el);
                else editBtnRefs.current.delete(item.id);
              }}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => actions.onEdit(item)}
              aria-label={`עריכת ${fullLabel}`}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <RowKebab item={item} isPaused={isPaused} fullLabel={fullLabel} {...actions} />
          </div>
        </div>
      </div>
    </li>
  );
}

// ============================================================================
// RowKebab — DropdownMenu of secondary actions, shared by desktop + mobile.
// ============================================================================

function RowKebab({
  item,
  isPaused,
  fullLabel,
  onDelete,
  onManageImages,
  onShowDetails,
  onMarkSold,
  onPause,
  onUnpause,
}: {
  item: Item;
  isPaused: boolean;
  fullLabel: string;
} & RowActions) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`פעולות נוספות ל-${fullLabel}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem onSelect={onShowDetails}>פרטים מלאים</DropdownMenuItem>
        <DropdownMenuItem onSelect={onManageImages}>
          <ImageIcon aria-hidden="true" />
          <span>ניהול תמונות</span>
        </DropdownMenuItem>
        {item.status === "active" ? (
          <DropdownMenuItem onSelect={onMarkSold}>
            <Tag aria-hidden="true" />
            <span>סמן כנמכר</span>
          </DropdownMenuItem>
        ) : null}
        {item.status === "active" && !isPaused ? (
          <DropdownMenuItem onSelect={onPause}>
            <Pause aria-hidden="true" />
            <span>השהה זמנית</span>
          </DropdownMenuItem>
        ) : null}
        {isPaused ? (
          <DropdownMenuItem onSelect={onUnpause}>
            <Play aria-hidden="true" />
            <span>חדש כעת</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(item)}
          className="text-danger-fg focus:text-danger-fg focus:bg-danger-bg"
        >
          <Trash2 aria-hidden="true" />
          <span>מחק</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// StatusPill — local status badge using ink/paper/accent.
// Independent of <StatusBadge> (which still serves offers + dealers pages).
// ============================================================================

function StatusPill({ status }: { status: InventoryStatus }) {
  const variant: { className: string } = (() => {
    switch (status) {
      case "active":
        return { className: "bg-ok-bg text-ok-fg border-ok/20" };
      case "sold":
        return { className: "bg-muted/10 text-muted border-hairline" };
      case "hidden":
        return { className: "bg-warn-bg text-warn-fg border-warn/20" };
      default:
        return { className: "bg-paper text-muted border-hairline" };
    }
  })();
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variant.className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ============================================================================
// SoldPriceCell — for sold rows, show sale price + small profit/loss tag.
// ============================================================================

function SoldPriceCell({ sale, cost }: { sale: number; cost: number | null }) {
  const saleF = formatPrice(sale);
  if (cost == null) {
    return (
      <span className="font-tabular text-sm">
        <span aria-hidden="true">{saleF.visual}</span>
        <span className="sr-only">{saleF.sr}</span>
      </span>
    );
  }
  const profit = sale - cost;
  const pct = sale > 0 ? ((profit / sale) * 100).toFixed(1) : "0.0";
  const good = profit >= 0;
  const profitF = formatPrice(Math.abs(profit));
  return (
    <div>
      <span className="font-tabular text-ink text-sm">
        <span aria-hidden="true">{saleF.visual}</span>
        <span className="sr-only">{saleF.sr}</span>
      </span>
      <div className={`font-tabular mt-xxs text-xs ${good ? "text-ok-fg" : "text-danger-fg"}`}>
        {good ? "+" : "−"}
        {profitF.visual} · {pct}%
      </div>
    </div>
  );
}

// ============================================================================
// ListSkeleton — placeholder that mirrors table-on-md / cards-under-md.
// ============================================================================

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען רכבים…</span>
      {/* Desktop skeleton */}
      <div className="hidden md:block">
        <div className="border-hairline border-b">
          <div className="py-md flex items-center gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-hairline gap-md py-md flex items-center border-b">
            <Skeleton className="h-12 w-16 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      {/* Mobile skeleton */}
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

// ============================================================================
// EmptyState — centered editorial copy + primary CTA.
// ============================================================================

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-3xl flex flex-col items-center text-center">
      <div
        aria-hidden="true"
        className="border-hairline bg-paper text-subtle flex h-16 w-16 items-center justify-center rounded-md border"
      >
        <Car className="h-7 w-7" />
      </div>
      <p className="text-ink mt-lg font-serif text-lg font-medium">אין עדיין רכבים במלאי</p>
      <p className="text-muted mt-xs max-w-sm text-sm">
        הוסף את הרכב הראשון שלך כדי להתחיל לנהל מלאי, להעלות תמונות ולפרסם בשוק.
      </p>
      <Button type="button" onClick={onAdd} className="mt-xl">
        <Plus aria-hidden="true" />
        <span>הוסף רכב ראשון</span>
      </Button>
    </div>
  );
}
