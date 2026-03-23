import { Suspense } from "react";

import { GmailSettingsClient } from "@/components/gmail-settings-client";

export default function GmailSettingsPage() {
  return (
    <Suspense fallback={null}>
      <GmailSettingsClient />
    </Suspense>
  );
}
