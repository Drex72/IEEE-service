from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TrackerSummary(BaseModel):
    banner: str | None = None
    context_line: str | None = None
    instructions: list[str] = Field(default_factory=list)
    tier_guide: str | None = None
    ieee_angle: str | None = None


class CompanyContactImport(BaseModel):
    external_key: str
    raw_contact: str | None = None
    full_name: str | None = None
    role_title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    phone_or_address: str | None = None
    reach_channel: str | None = None
    notes: str | None = None
    source_row: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_primary: bool = False


class CompanyImportRow(BaseModel):
    name: str
    website: str | None = None
    industry: str | None = None
    tier: str | None = None
    contact_email: str | None = None
    contact_details: str | None = None
    phone_or_address: str | None = None
    reach_channel: str | None = None
    notes: str | None = None
    status: str | None = None
    source_row: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    contacts: list[CompanyContactImport] = Field(default_factory=list)


class UploadResponse(BaseModel):
    imported: int
    companies: list["CompanyRecord"]
    tracker_summary: TrackerSummary | None = None
    queued_contact_jobs: int = 0


class TemplateGenerationRequest(BaseModel):
    campaign_context: str | None = None


class CampaignContextRecord(BaseModel):
    owner_key: str
    brief: str | None = None
    queue_paused: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CampaignContextUpdateRequest(BaseModel):
    brief: str | None = None


class CompanyUpdateRequest(BaseModel):
    campaign_context_override: str | None = None


class ContactDraftUpdateRequest(BaseModel):
    subject: str | None = None
    preview_line: str | None = None
    content_markdown: str | None = None
    content_html: str | None = None


class CompanyRecord(BaseModel):
    id: str
    owner_key: str
    name: str
    website: str | None = None
    industry: str | None = None
    tier: str | None = None
    contact_email: str | None = None
    contact_details: str | None = None
    phone_or_address: str | None = None
    reach_channel: str | None = None
    notes: str | None = None
    status: str | None = None
    source_row: int | None = None
    campaign_context_override: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    has_template: bool = False
    contact_count: int = 0
    draft_count: int = 0
    generation_status: str | None = None
    generation_progress_percent: int | None = None
    generation_current_step: str | None = None
    generation_error_message: str | None = None
    latest_generation_job_id: str | None = None
    latest_generation_trigger: str | None = None
    latest_generation_updated_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CompanyListResponse(BaseModel):
    companies: list[CompanyRecord]


class ResearchSource(BaseModel):
    title: str | None = None
    url: str | None = None
    note: str | None = None


class DiscoveredContact(BaseModel):
    full_name: str | None = None
    role_title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    reach_channel: str | None = None
    rationale: str | None = None
    sources: list[ResearchSource] = Field(default_factory=list)


class ContactDiscoveryResult(BaseModel):
    company_name: str
    search_summary: str | None = None
    official_company_contact: DiscoveredContact | None = None
    recommended_person_contact: DiscoveredContact | None = None
    missing_information: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)


class CompanyResearch(BaseModel):
    company_name: str
    website: str | None = None
    mission: str | None = None
    vision: str | None = None
    values: list[str] = Field(default_factory=list)
    products_or_services: list[str] = Field(default_factory=list)
    recent_news: list[str] = Field(default_factory=list)
    partnerships: list[str] = Field(default_factory=list)
    industry_positioning: str | None = None
    sponsorship_fit: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)


class LeadershipInsight(BaseModel):
    name: str
    role: str | None = None
    quote: str | None = None
    themes: list[str] = Field(default_factory=list)
    tone: str | None = None
    source: ResearchSource | None = None


class LeadershipResearch(BaseModel):
    company_name: str
    decision_makers: list[LeadershipInsight] = Field(default_factory=list)
    overall_tone: str | None = None
    messaging_themes: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)


class UnifiedContext(BaseModel):
    company_name: str
    executive_summary: str
    alignment_points: list[str] = Field(default_factory=list)
    recommended_ask: str
    suggested_recipient_titles: list[str] = Field(default_factory=list)
    personalization_angles: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)


class GeneratedEmail(BaseModel):
    subject: str
    preview_line: str
    body_markdown: str
    body_html: str
    personalization_highlights: list[str] = Field(default_factory=list)


class GeneratedLinkedInMessage(BaseModel):
    body_markdown: str
    body_html: str | None = None
    personalization_highlights: list[str] = Field(default_factory=list)


class ContactOutreachDraftRecord(BaseModel):
    id: str
    owner_key: str
    company_id: str
    contact_id: str
    channel: str
    subject: str | None = None
    preview_line: str | None = None
    content_markdown: str
    content_html: str | None = None
    generated_context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CompanyContactRecord(BaseModel):
    id: str
    owner_key: str
    company_id: str
    external_key: str
    full_name: str | None = None
    role_title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    raw_contact: str | None = None
    phone_or_address: str | None = None
    reach_channel: str | None = None
    notes: str | None = None
    source_row: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_primary: bool = False
    drafts: list[ContactOutreachDraftRecord] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CompanyContactsResponse(BaseModel):
    contacts: list[CompanyContactRecord] = Field(default_factory=list)


class GenerationStepRecord(BaseModel):
    key: str
    title: str
    status: str = "pending"
    description: str | None = None
    summary: str | None = None
    details: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class GenerationJobRecord(BaseModel):
    id: str
    owner_key: str
    company_id: str
    template_id: str | None = None
    trigger: str | None = None
    status: str
    progress_percent: int = 0
    current_step: str | None = None
    campaign_context: str | None = None
    error_message: str | None = None
    steps: list[GenerationStepRecord] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class EmailTemplateRecord(BaseModel):
    id: str
    owner_key: str
    company_id: str
    subject: str
    preview_line: str | None = None
    content_markdown: str
    content_html: str | None = None
    generated_context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TemplateUpdateRequest(BaseModel):
    subject: str | None = None
    preview_line: str | None = None
    content_markdown: str | None = None
    content_html: str | None = None


class EmailAttachment(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"
    content_base64: str


class SendEmailRequest(BaseModel):
    company_id: str
    contact_id: str | None = None
    draft_id: str | None = None
    recipient_email: str
    subject: str
    body_markdown: str
    body_html: str | None = None
    attachments: list[EmailAttachment] = Field(default_factory=list)


class SendEmailResponse(BaseModel):
    status: str
    message_id: str


class GmailStatusResponse(BaseModel):
    configured: bool
    connected: bool
    email: str | None = None
    connected_at: datetime | None = None


class DashboardSummary(BaseModel):
    total_companies: int
    generated_templates: int
    sent_emails: int
    queued_jobs: int = 0
    in_progress_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    unread_notifications: int = 0


class WorkspaceResetResponse(BaseModel):
    status: str
    deleted_companies: int = 0
    deleted_contacts: int = 0
    deleted_drafts: int = 0
    deleted_jobs: int = 0
    deleted_notifications: int = 0


class BulkGenerationRequest(BaseModel):
    company_ids: list[str] = Field(default_factory=list)
    regenerate_existing: bool = False
    campaign_context: str | None = None


class BulkGenerationResponse(BaseModel):
    queued_jobs: int
    skipped_companies: int = 0
    blocked_companies: int = 0
    jobs: list[GenerationJobRecord] = Field(default_factory=list)


class QueueStateRecord(BaseModel):
    owner_key: str
    queue_paused: bool = False
    queued_jobs: int = 0
    running_jobs: int = 0
    cancelling_jobs: int = 0


class NotificationRecord(BaseModel):
    id: str
    owner_key: str
    company_id: str | None = None
    generation_job_id: str | None = None
    title: str
    message: str
    level: str = "info"
    read_at: datetime | None = None
    created_at: datetime | None = None


class NotificationListResponse(BaseModel):
    notifications: list[NotificationRecord] = Field(default_factory=list)
