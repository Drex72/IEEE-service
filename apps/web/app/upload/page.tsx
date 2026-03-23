import { UploadPageClient } from "@/components/upload-page-client";
import { UploadPageClient as UploadPageClientLegacy } from "@/components/legacy/upload-page-client-legacy";
import { isLegacyLayout } from "@/lib/layout-variant";

export default function UploadPage() {
  return isLegacyLayout() ? <UploadPageClientLegacy /> : <UploadPageClient />;
}
