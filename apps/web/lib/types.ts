export type TrackerSummary = {
  banner?: string | null;
  context_line?: string | null;
  instructions: string[];
  tier_guide?: string | null;
  ieee_angle?: string | null;
};

export type CompanyRecord = {
  id: string;
  owner_key: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  tier?: string | null;
  contact_email?: string | null;
  contact_details?: string | null;
  phone_or_address?: string | null;
  reach_channel?: string | null;
  notes?: string | null;
  status?: string | null;
  source_row?: number | null;
  campaign_context_override?: string | null;
  metadata?: Record<string, unknown>;
  has_template: boolean;
  contact_count: number;
  draft_count: number;
  generation_status?: string | null;
  generation_progress_percent?: number | null;
  generation_current_step?: string | null;
  generation_error_message?: string | null;
  latest_generation_job_id?: string | null;
  latest_generation_trigger?: string | null;
  latest_generation_updated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ContactOutreachDraftRecord = {
  id: string;
  owner_key: string;
  company_id: string;
  contact_id: string;
  channel: "email" | "linkedin" | string;
  subject?: string | null;
  preview_line?: string | null;
  content_markdown: string;
  content_html?: string | null;
  generated_context: {
    unified_context?: UnifiedContext;
    user_campaign_brief?: string | null;
    program_context?: {
      default_program_context?: Record<string, unknown>;
      user_campaign_brief?: string | null;
    };
    [key: string]: unknown;
  };
  created_at?: string | null;
  updated_at?: string | null;
};

export type CompanyContactRecord = {
  id: string;
  owner_key: string;
  company_id: string;
  external_key: string;
  full_name?: string | null;
  role_title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  raw_contact?: string | null;
  phone_or_address?: string | null;
  reach_channel?: string | null;
  notes?: string | null;
  source_row?: number | null;
  metadata?: Record<string, unknown>;
  is_primary: boolean;
  drafts: ContactOutreachDraftRecord[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type CompanyContactsResponse = {
  contacts: CompanyContactRecord[];
};

export type CompanyListResponse = {
  companies: CompanyRecord[];
};

export type UploadResponse = {
  imported: number;
  companies: CompanyRecord[];
  tracker_summary?: TrackerSummary | null;
  queued_contact_jobs?: number;
};

export type DashboardSummary = {
  total_companies: number;
  generated_templates: number;
  sent_emails: number;
  queued_jobs: number;
  in_progress_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  unread_notifications: number;
};

export type WorkspaceResetResponse = {
  status: string;
  deleted_companies: number;
  deleted_contacts: number;
  deleted_drafts: number;
  deleted_jobs: number;
  deleted_notifications: number;
};

export type ResearchSource = {
  title?: string | null;
  url?: string | null;
  note?: string | null;
};

export type UnifiedContext = {
  company_name: string;
  executive_summary: string;
  alignment_points: string[];
  recommended_ask: string;
  suggested_recipient_titles: string[];
  personalization_angles: string[];
  risk_flags: string[];
  sources: ResearchSource[];
};

export type EmailTemplateRecord = {
  id: string;
  owner_key: string;
  company_id: string;
  subject: string;
  preview_line?: string | null;
  content_markdown: string;
  content_html?: string | null;
  generated_context: {
    unified_context?: UnifiedContext;
    user_campaign_brief?: string | null;
    program_context?: {
      default_program_context?: Record<string, unknown>;
      user_campaign_brief?: string | null;
    };
    [key: string]: unknown;
  };
  created_at?: string | null;
  updated_at?: string | null;
};

export type GmailStatusResponse = {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  connected_at?: string | null;
};

export type CampaignContextRecord = {
  owner_key: string;
  brief?: string | null;
  queue_paused?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GenerationStepRecord = {
  key: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  description?: string | null;
  summary?: string | null;
  details: string[];
  sources: ResearchSource[];
  started_at?: string | null;
  completed_at?: string | null;
};

export type GenerationJobRecord = {
  id: string;
  owner_key: string;
  company_id: string;
  template_id?: string | null;
  trigger?: string | null;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress_percent: number;
  current_step?: string | null;
  campaign_context?: string | null;
  error_message?: string | null;
  steps: GenerationStepRecord[];
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type BulkGenerationResponse = {
  queued_jobs: number;
  skipped_companies: number;
  blocked_companies?: number;
  jobs: GenerationJobRecord[];
};

export type QueueStateRecord = {
  owner_key: string;
  queue_paused: boolean;
  queued_jobs: number;
  running_jobs: number;
  cancelling_jobs: number;
};

export type NotificationRecord = {
  id: string;
  owner_key: string;
  company_id?: string | null;
  generation_job_id?: string | null;
  title: string;
  message: string;
  level: "info" | "success" | "warning" | "danger" | string;
  read_at?: string | null;
  created_at?: string | null;
};

export type NotificationListResponse = {
  notifications: NotificationRecord[];
};

export type SendEmailPayload = {
  company_id: string;
  contact_id?: string | null;
  draft_id?: string | null;
  recipient_email: string;
  subject: string;
  body_markdown: string;
  body_html?: string | null;
  attachments: {
    filename: string;
    content_type: string;
    content_base64: string;
  }[];
};
