import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function statusTone(status?: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("declined")) {
    return "danger";
  }
  if (normalized.includes("discussion") || normalized.includes("follow")) {
    return "warning";
  }
  if (normalized.includes("not sent")) {
    return "muted";
  }
  if (normalized.includes("confirmed") || normalized === "sent" || normalized.includes("✉️")) {
    return "success";
  }
  return "muted";
}

export function generationTone(status?: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "failed") {
    return "danger";
  }
  if (normalized === "completed") {
    return "success";
  }
  if (normalized === "running") {
    return "warning";
  }
  if (normalized === "queued") {
    return "muted";
  }
  return "muted";
}

export function jobStatusLabel(status?: string | null, currentStep?: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "running" && currentStep) {
    return currentStep;
  }
  if (normalized === "queued") {
    return "Queued";
  }
  if (normalized === "completed") {
    return "Completed";
  }
  if (normalized === "failed") {
    return "Failed";
  }
  return currentStep ?? "Idle";
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function markdownToHtml(markdown: string) {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const html = escapeHtml(paragraph)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br />");
      return `<p>${html}</p>`;
    });

  return paragraphs.join("");
}

export function formatMaybeUrl(url?: string | null) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
