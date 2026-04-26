import { WatermarkOverlay } from "@/components/WatermarkOverlay";

/*
 * Dashboard shell — server component pass-through that mounts the
 * WatermarkOverlay across every authenticated dealer page (inventory,
 * marketplace, offers, deals, analytics, security).
 *
 * Per-page layout/header chrome is intentionally NOT moved here
 * because each dashboard page already renders its own header with
 * page-specific actions. This layout is a thin wrapper.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WatermarkOverlay />
    </>
  );
}
