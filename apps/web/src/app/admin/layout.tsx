import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

/**
 * AdminLayout — editorial operator shell. Two-column on desktop
 * (sidebar at the right edge in RTL via `border-s` on the sidebar
 * itself + flex order); single column on mobile (sticky top bar +
 * content + Sheet drawer for nav).
 *
 * Visual rhythm matches the dealer DashboardShell (paper surface,
 * hairline borders, ink/paper sidebar with accent on active) so the
 * brand reads as one product across both audiences. The single tell
 * that this is the operator surface is the "Admin" eyebrow tucked
 * under the brand mark in the sidebar — no color noise, no second
 * palette.
 *
 * WatermarkOverlay deliberately NOT mounted on /admin — admins are
 * operators, not the watermarked audience. Only dealers see the
 * anti-leak tile.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper text-ink flex min-h-[100dvh]">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
