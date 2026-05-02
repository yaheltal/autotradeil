import { DashboardShell } from "@/components/dashboard/DashboardShell";

/*
 * Dashboard shell — wraps every authenticated dealer page with the
 * global chrome (sidebar/topbar on desktop, bottom-nav on mobile,
 * dark-mode toggle in the header).
 *
 * Per-page chrome (page-specific headers, DashboardSubNav) currently
 * still renders inside `children`. As we redesign each page in the
 * page-by-page sequence, those redundant headers will be stripped.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
