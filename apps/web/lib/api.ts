import { getOwnerKey } from "@/lib/owner-key";
import type {
  BulkGenerationResponse,
  CampaignContextRecord,
  CompanyListResponse,
  CompanyRecord,
  DashboardSummary,
  EmailTemplateRecord,
  GenerationJobRecord,
  GmailStatusResponse,
  NotificationListResponse,
  SendEmailPayload,
  UploadResponse,
} from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("x-owner-key", getOwnerKey());
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = "Request failed.";
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail ?? detail;
    } catch {
      detail = await response.text();
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export async function getCompanies() {
  const payload = await request<CompanyListResponse>("/api/companies");
  return payload.companies;
}

export async function getCompany(companyId: string) {
  return request<CompanyRecord>(`/api/companies/${companyId}`);
}

export async function getDashboardSummary() {
  return request<DashboardSummary>("/api/dashboard");
}

export async function getCampaignContext() {
  return request<CampaignContextRecord>("/api/campaign-context");
}

export async function updateCampaignContext(brief: string) {
  return request<CampaignContextRecord>("/api/campaign-context", {
    method: "PUT",
    body: JSON.stringify({ brief }),
  });
}

export async function uploadCompanies(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<UploadResponse>("/api/upload-companies", {
    method: "POST",
    body: formData,
  });
}

export async function getTemplate(companyId: string) {
  return request<EmailTemplateRecord>(`/api/template/${companyId}`);
}

export async function updateCompany(
  companyId: string,
  payload: {
    campaign_context_override?: string | null;
  },
) {
  return request<CompanyRecord>(`/api/companies/${companyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getLatestGenerationJob(companyId: string) {
  return request<GenerationJobRecord>(`/api/generation-jobs/${companyId}`);
}

export async function generateTemplate(companyId: string, campaignContext?: string) {
  return request<GenerationJobRecord>(`/api/generate/${companyId}`, {
    method: "POST",
    body: JSON.stringify({ campaign_context: campaignContext ?? null }),
  });
}

export async function regenerateTemplate(companyId: string, campaignContext?: string) {
  return request<GenerationJobRecord>(`/api/regenerate/${companyId}`, {
    method: "POST",
    body: JSON.stringify({ campaign_context: campaignContext ?? null }),
  });
}

export async function generateAllTemplates(payload?: {
  company_ids?: string[];
  regenerate_existing?: boolean;
  campaign_context?: string;
}) {
  return request<BulkGenerationResponse>("/api/generate-all", {
    method: "POST",
    body: JSON.stringify({
      company_ids: payload?.company_ids ?? [],
      regenerate_existing: payload?.regenerate_existing ?? false,
      campaign_context: payload?.campaign_context ?? null,
    }),
  });
}

export async function updateTemplate(
  companyId: string,
  payload: {
    subject?: string;
    preview_line?: string;
    content_markdown?: string;
    content_html?: string;
  },
) {
  return request<EmailTemplateRecord>(`/api/template/${companyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getGmailStatus() {
  return request<GmailStatusResponse>("/api/gmail/status");
}

export async function getNotifications() {
  const payload = await request<NotificationListResponse>("/api/notifications");
  return payload.notifications;
}

export async function markAllNotificationsRead() {
  const payload = await request<NotificationListResponse>("/api/notifications/read-all", {
    method: "POST",
  });
  return payload.notifications;
}

export async function getGmailAuthUrl(returnTo?: string) {
  const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
  return request<{ url: string }>(`/api/gmail/auth-url${query}`);
}

export async function sendEmail(payload: SendEmailPayload) {
  return request<{ status: string; message_id: string }>("/api/gmail/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
