import { CompanyDetailClient } from "@/components/company-detail-client";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return <CompanyDetailClient companyId={companyId} />;
}
