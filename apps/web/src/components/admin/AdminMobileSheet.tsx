"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ADMIN_NAV_ITEMS } from "@/components/admin/AdminSidebar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * AdminMobileSheet — slide-out drawer giving phone users the full
 * admin nav. Replaces the hand-rolled
 * [transform:translateX(...)] + body-scroll-lock + Escape-handler
 * implementation in the old admin layout — shadcn's Sheet primitive
 * gives focus trap, Escape close, and scroll lock for free.
 *
 * Mirrors apps/web/src/components/dashboard/MobileSidebarSheet.tsx —
 * same shape, admin nav items + Admin eyebrow.
 */

function isActive(pathname: string, item: (typeof ADMIN_NAV_ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminMobileSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auto-close on route change so a nav tap doesn't leave the drawer
  // covering the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="פתיחת תפריט הניווט"
          className="text-ink duration-fast hover:bg-muted/10 focus-visible:outline-accent inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-paper p-0 sm:max-w-xs">
        <SheetHeader className="px-lg py-lg border-hairline border-b text-start">
          <SheetTitle className="text-ink tracking-editorial gap-xs inline-flex items-center font-serif text-xl font-medium">
            AutoTradeIL
            <span aria-hidden="true" className="bg-accent inline-block h-1.5 w-1.5 rounded-full" />
          </SheetTitle>
          <SheetDescription className="text-muted mt-xxs text-[10px] font-medium uppercase tracking-widest">
            Admin
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="ניווט מנהל" className="px-md py-md">
          <ul className="space-y-xxs flex flex-col">
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "gap-md px-md py-md duration-fast group relative flex items-center rounded-md text-sm font-medium transition-colors",
                      "focus-visible:outline-accent focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                      active ? "bg-ink text-paper" : "text-muted hover:text-ink hover:bg-muted/10",
                    ].join(" ")}
                  >
                    <Icon
                      className={["h-5 w-5 shrink-0", active ? "" : "group-hover:text-ink"].join(
                        " ",
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
