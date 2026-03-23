const OWNER_STORAGE_KEY = "ieee-owner-key";

export function getOwnerKey() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_OWNER_KEY ?? "local-demo";
  }

  const envOwnerKey = process.env.NEXT_PUBLIC_OWNER_KEY;
  if (envOwnerKey) {
    return envOwnerKey;
  }

  const existing = window.localStorage.getItem(OWNER_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `local-${window.crypto.randomUUID()}`;
  window.localStorage.setItem(OWNER_STORAGE_KEY, generated);
  return generated;
}

