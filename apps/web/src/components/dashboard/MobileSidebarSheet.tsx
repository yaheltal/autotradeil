"use client";

import {
  BarChart3,
  Car,
  Handshake,
  LayoutDashboard,
  Menu,
  Shield,
  ShoppingBag,
  Tag,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/dashboard/LogoutButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/*
 * MobileSidebarSheet — the slide-out drawer that gives mobile users
 * access to the full navigation (including analytics + security,
 * which the 5-tab BottomNav doesn't surface).
 *
 * The trigger is a Menu icon button that replaces the duplicated
 * "AutoTradeIL" branding in the mobile sticky header (the brand
 * already appears inside the drawer's own header + on desktop's
 * Sidebar — three copies on a small screen was noisy chrome).
 *
 * Renders nothing on `md+` — the desktop Sidebar covers that
 * breakpoint and is always visible.
 *
 * Nav items kept in sync with apps/web/src/components/dashboard/Sidebar.tsx —
 * the mobile drawer is the same nav surface, just opened via a
 * Sheet on small viewports.
 */

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "פרופיל", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/inventory", label: "מלאי", icon: Car },
  { href: "/dashboard/marketplace", label: "שוק B2B", icon: ShoppingBag },
  { href: "/dashboard/offers", label: "הצעות", icon: Tag },
  { href: "/dashboard/deals", label: "עסקאות", icon: Handshake },
  { href: "/dashboard/analytics", label: "סטטיסטיקות", icon: BarChart3 },
  { href: "/dashboard/security", label: "אבטחה", icon: Shield },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileSidebarSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on route change. Without this, a tap on a nav item
  // navigates but leaves the drawer covering the new page.
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
      <SheetContent side="right" className="bg-paper flex h-full flex-col p-0 sm:max-w-xs">
        <SheetHeader className="px-lg py-lg border-hairline shrink-0 border-b text-start">
          <SheetTitle className="text-ink tracking-editorial font-serif text-xl font-medium">
            AutoTradeIL
          </SheetTitle>
          <SheetDescription className="sr-only">תפריט ניווט ראשי של לוח הבקרה</SheetDescription>
        </SheetHeader>
        <nav aria-label="ניווט ראשי" className="px-md py-md flex-1 overflow-y-auto">
          <ul className="space-y-xxs flex flex-col">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "gap-md duration-fast px-md py-md group relative flex items-center rounded-md text-sm font-medium transition-colors",
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
        {/* Footer — pinned to the bottom of the drawer. shrink-0 so the
            nav above scrolls when content overflows; the logout button
            stays anchored where the thumb expects it on phones. */}
        <div className="border-hairline px-md py-md shrink-0 border-t">
          <LogoutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
