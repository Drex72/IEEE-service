const CAMPAIGN_CONTEXT_STORAGE_KEY = "ieee-campaign-context";

export function readCampaignContext() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(CAMPAIGN_CONTEXT_STORAGE_KEY) ?? "";
}

export function writeCampaignContext(value: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(CAMPAIGN_CONTEXT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CAMPAIGN_CONTEXT_STORAGE_KEY, value);
}

