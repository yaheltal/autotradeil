"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * TablePagination — shared "הקודם · עמוד N מתוך M · הבא" pagination
 * row for every admin list page. Replaces the ~3 hand-rolled
 * Pagination components scattered across /admin/dealers,
 * /admin/inventory, /admin/audit-log.
 *
 * Page-change is announced via a single role=status region that
 * mounts AFTER first paint, so the SR doesn't announce "עמוד 1 מתוך
 * N" on page load — only on user-driven changes.
 *
 * Icons are lucide ChevronLeft/Right (page is in RTL, so visually
 * the "previous" arrow points to the right — the icon order below
 * is chosen so each button's arrow points away from the user's
 * direction of travel).
 */
export function TablePagination({
  page,
  pages,
  onGo,
  className,
}: {
  page: number;
  pages: number;
  onGo: (next: number) => void;
  className?: string;
}) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pages;

  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    setAnnounce(true);
  }, [page]);

  return (
    <nav
      aria-label="עימוד"
      className={["mt-xl gap-md flex items-center justify-between", className ?? ""].join(" ")}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => onGo(page - 1)}
        disabled={prevDisabled}
      >
        <ChevronRight aria-hidden="true" />
        <span>הקודם</span>
      </Button>
      <p className="text-muted text-sm">
        עמוד <span className="text-ink font-tabular font-medium">{page}</span> מתוך{" "}
        <span className="text-ink font-tabular font-medium">{pages}</span>
      </p>
      {announce ? (
        <p role="status" className="sr-only">
          עמוד {page} מתוך {pages}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => onGo(page + 1)}
        disabled={nextDisabled}
      >
        <span>הבא</span>
        <ChevronLeft aria-hidden="true" />
      </Button>
    </nav>
  );
}
