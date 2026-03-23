import { CompanyDetailClient } from "@/components/company-detail-client";
import { CompanyDetailClient as CompanyDetailClientLegacy } from "@/components/legacy/company-detail-client-legacy";
import { isLegacyLayout } from "@/lib/layout-variant";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return isLegacyLayout() ? (
    <CompanyDetailClientLegacy companyId={companyId} />
  ) : (
    <CompanyDetailClient companyId={companyId} />
  );
}
