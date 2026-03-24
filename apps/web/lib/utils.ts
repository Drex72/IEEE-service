import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const VALID_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  if (normalized === "cancelled") {
    return "muted";
  }
  if (normalized === "cancelling") {
    return "warning";
  }
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
  if (normalized === "cancelling") {
    return currentStep ?? "Cancellation requested";
  }
  if (normalized === "queued") {
    return "Queued";
  }
  if (normalized === "cancelled") {
    return "Cancelled";
  }
  if (normalized === "completed") {
    return currentStep ?? "Completed";
  }
  if (normalized === "failed") {
    return currentStep ?? "Failed";
  }
  return currentStep ?? "Idle";
}

export function jobTriggerLabel(trigger?: string | null) {
  const normalized = (trigger ?? "").toLowerCase();
  if (normalized === "contact-discovery") {
    return "Contact discovery";
  }
  if (normalized.includes("regenerate")) {
    return "Draft regeneration";
  }
  if (normalized.includes("generate")) {
    return "Draft generation";
  }
  return "Background run";
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
  const normalized = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  const htmlBlocks: string[] = [];
  let paragraphLines: string[] = [];
  let bulletLines: string[] = [];

  function inlineFormat(value: string) {
    return escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  }

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }
    htmlBlocks.push(`<p>${paragraphLines.map(inlineFormat).join("<br />")}</p>`);
    paragraphLines = [];
  }

  function flushBullets() {
    if (!bulletLines.length) {
      return;
    }
    htmlBlocks.push(
      `<ul>${bulletLines
        .map((line) => line.replace(/^[-*]\s+/, "").trim())
        .map((line) => `<li>${inlineFormat(line)}</li>`)
        .join("")}</ul>`,
    );
    bulletLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      bulletLines.push(trimmed);
      continue;
    }
    flushBullets();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushBullets();
  return htmlBlocks.join("");
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

export function isValidEmail(value?: string | null) {
  return Boolean(value && VALID_EMAIL_PATTERN.test(value.trim()));
}
