export type LayoutVariant = "refined" | "legacy";

export const layoutVariant: LayoutVariant =
  process.env.NEXT_PUBLIC_LAYOUT_VARIANT === "legacy" ? "legacy" : "refined";

export function isLegacyLayout() {
  return layoutVariant === "legacy";
}
