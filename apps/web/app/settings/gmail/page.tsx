import { Suspense } from "react";

import { GmailSettingsClient } from "@/components/gmail-settings-client";
import { GmailSettingsClient as GmailSettingsClientLegacy } from "@/components/legacy/gmail-settings-client-legacy";
import { isLegacyLayout } from "@/lib/layout-variant";

export default function GmailSettingsPage() {
  const Client = isLegacyLayout() ? GmailSettingsClientLegacy : GmailSettingsClient;

  return (
    <Suspense fallback={null}>
      <Client />
    </Suspense>
  );
}
