import { DashboardClient } from "@/components/dashboard-client";
import { DashboardClient as DashboardClientLegacy } from "@/components/legacy/dashboard-client-legacy";
import { isLegacyLayout } from "@/lib/layout-variant";

export default function HomePage() {
  return isLegacyLayout() ? <DashboardClientLegacy /> : <DashboardClient />;
}
