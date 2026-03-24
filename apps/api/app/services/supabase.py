from __future__ import annotations

import threading
import time
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any, Callable, TypeVar

import httpx
from pydantic import BaseModel
from supabase import Client, create_client

from app.core.config import Settings
from app.models.schemas import (
    CampaignContextRecord,
    CompanyContactImport,
    CompanyContactRecord,
    CompanyImportRow,
    CompanyRecord,
    CompanyUpdateRequest,
    ContactDraftUpdateRequest,
    ContactOutreachDraftRecord,
    DashboardSummary,
    EmailTemplateRecord,
    GeneratedEmail,
    GenerationJobRecord,
    GenerationStepRecord,
    GmailStatusResponse,
    NotificationRecord,
    QueueStateRecord,
    TemplateUpdateRequest,
    WorkspaceResetResponse,
)


_UNSET = object()
ResponseT = TypeVar("ResponseT")
INDIVIDUAL_TEAM_TOKENS = {
    "team",
    "desk",
    "office",
    "foundation",
    "support",
    "partnerships",
    "partnership",
    "communications",
    "marketing",
    "careers",
    "hr",
    "admin",
    "contact",
}
VALID_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(slots=True)
class ContactCoverage:
    has_official_company_contact: bool
    has_individual_contact: bool
    total_contacts: int

    @property
    def needs_discovery(self) -> bool:
        return not (self.has_official_company_contact and self.has_individual_contact)


class _RetryingQueryBuilder:
    def __init__(
        self,
        builder: Any,
        retry: Callable[[Callable[[], ResponseT]], ResponseT],
    ) -> None:
        self._builder = builder
        self._retry = retry

    def __getattr__(self, name: str) -> Any:
        attribute = getattr(self._builder, name)
        if not callable(attribute):
            return attribute

        def wrapped(*args: Any, **kwargs: Any) -> Any:
            if name == "execute":
                return self._retry(lambda: attribute(*args, **kwargs))

            result = attribute(*args, **kwargs)
            if hasattr(result, "execute"):
                return _RetryingQueryBuilder(result, self._retry)
            return result

        return wrapped


class _RetryingSupabaseClient:
    def __init__(
        self,
        client_factory: Callable[[], Client],
        retry: Callable[[Callable[[], ResponseT]], ResponseT],
    ) -> None:
        self._client_factory = client_factory
        self._retry = retry

    def table(self, table_name: str) -> _RetryingQueryBuilder:
        return _RetryingQueryBuilder(
            self._client_factory().table(table_name),
            self._retry,
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client_factory(), name)


class SupabaseRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._thread_local = threading.local()

    @property
    def client(self) -> _RetryingSupabaseClient:
        if not self.settings.has_supabase:
            raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return _RetryingSupabaseClient(self._raw_client, self._with_retry)

    def _raw_client(self) -> Client:
        client = getattr(self._thread_local, "client", None)
        if client is None:
            client = create_client(
                self.settings.supabase_url,
                self.settings.supabase_service_role_key,
            )
            self._thread_local.client = client
        return client

    def _reset_thread_client(self) -> None:
        if hasattr(self._thread_local, "client"):
            delattr(self._thread_local, "client")

    def _with_retry(self, operation: Callable[[], ResponseT]) -> ResponseT:
        delay_seconds = 0.2
        for attempt in range(3):
            try:
                return operation()
            except httpx.TransportError:
                self._reset_thread_client()
                if attempt == 2:
                    raise
                time.sleep(delay_seconds)
                delay_seconds *= 2
        raise RuntimeError("Supabase operation failed unexpectedly.")

    def list_companies(self, owner_key: str) -> list[CompanyRecord]:
        response = (
            self.client.table("companies")
            .select("*")
            .eq("owner_key", owner_key)
            .order("created_at", desc=False)
            .execute()
        )
        companies = [CompanyRecord.model_validate(item) for item in response.data]
        return self._hydrate_companies(owner_key, companies)

    def list_companies_by_ids(self, owner_key: str, company_ids: Iterable[str]) -> list[CompanyRecord]:
        ids = list(company_ids)
        if not ids:
            return []
        response = (
            self.client.table("companies")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("id", ids)
            .order("created_at", desc=False)
            .execute()
        )
        companies = [CompanyRecord.model_validate(item) for item in response.data]
        return self._hydrate_companies(owner_key, companies)

    def get_company(self, owner_key: str, company_id: str) -> CompanyRecord | None:
        response = (
            self.client.table("companies")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("id", company_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        company = CompanyRecord.model_validate(response.data[0])
        template = self.get_template_by_company(owner_key, company_id)
        job = self.get_latest_generation_job(owner_key, company_id)
        contact_counts = self._contact_count_map(owner_key, [company_id])
        draft_counts = self._draft_count_map(owner_key, [company_id])
        return self._hydrate_company(
            company,
            template,
            job,
            contact_count=contact_counts.get(company_id, 0),
            draft_count=draft_counts.get(company_id, 0),
        )

    def update_company(
        self,
        owner_key: str,
        company_id: str,
        update: CompanyUpdateRequest,
    ) -> CompanyRecord | None:
        payload = update.model_dump(exclude_unset=True)
        if not payload:
            return self.get_company(owner_key, company_id)
        if "campaign_context_override" in payload:
            payload["campaign_context_override"] = self._normalize_text(
                payload["campaign_context_override"]
            )
        payload["updated_at"] = self._now()
        response = (
            self.client.table("companies")
            .update(payload)
            .eq("owner_key", owner_key)
            .eq("id", company_id)
            .execute()
        )
        if not response.data:
            return None
        company = CompanyRecord.model_validate(response.data[0])
        template = self.get_template_by_company(owner_key, company_id)
        job = self.get_latest_generation_job(owner_key, company_id)
        contact_counts = self._contact_count_map(owner_key, [company_id])
        draft_counts = self._draft_count_map(owner_key, [company_id])
        return self._hydrate_company(
            company,
            template,
            job,
            contact_count=contact_counts.get(company_id, 0),
            draft_count=draft_counts.get(company_id, 0),
        )

    def upsert_companies(self, owner_key: str, companies: Iterable[CompanyImportRow]) -> list[CompanyRecord]:
        company_rows = self._dedupe_company_rows_for_upsert(list(companies))
        payload = []
        for company in company_rows:
            payload.append(
                {
                    "owner_key": owner_key,
                    "name": company.name,
                    "website": company.website,
                    "industry": company.industry,
                    "tier": company.tier,
                    "contact_email": company.contact_email,
                    "contact_details": company.contact_details,
                    "phone_or_address": company.phone_or_address,
                    "reach_channel": company.reach_channel,
                    "notes": company.notes,
                    "status": company.status,
                    "source_row": company.source_row,
                    "metadata": company.metadata,
                    "updated_at": self._now(),
                }
            )
        response = (
            self.client.table("companies")
            .upsert(payload, on_conflict="owner_key,name")
            .execute()
        )
        saved = [CompanyRecord.model_validate(item) for item in response.data]
        saved_by_name = {company.name.strip().lower(): company for company in saved}

        contact_payloads: list[dict[str, Any]] = []
        for company in company_rows:
            saved_company = saved_by_name.get(company.name.strip().lower())
            if saved_company is None:
                continue
            imported_contacts = company.contacts or self._fallback_contacts_from_company(company)
            for contact in imported_contacts:
                contact_payloads.append(
                    {
                        "owner_key": owner_key,
                        "company_id": saved_company.id,
                        "external_key": contact.external_key,
                        "full_name": contact.full_name,
                        "role_title": contact.role_title,
                        "email": contact.email,
                        "linkedin_url": contact.linkedin_url,
                        "raw_contact": contact.raw_contact,
                        "phone_or_address": contact.phone_or_address,
                        "reach_channel": contact.reach_channel,
                        "notes": contact.notes,
                        "source_row": contact.source_row,
                        "metadata": contact.metadata,
                        "is_primary": contact.is_primary,
                        "updated_at": self._now(),
                    }
                )

        if contact_payloads:
            contact_payloads = self._dedupe_contact_payloads(contact_payloads)
            (
                self.client.table("company_contacts")
                .upsert(contact_payloads, on_conflict="owner_key,company_id,external_key")
                .execute()
            )

        return self._hydrate_companies(owner_key, saved)

    def enqueue_contact_discovery_jobs(
        self,
        owner_key: str,
        company_ids: Iterable[str],
        *,
        campaign_context: str | None = None,
    ) -> list[GenerationJobRecord]:
        ids = list(company_ids)
        if not ids:
            return []

        companies = self.list_companies_by_ids(owner_key, ids)
        if not companies:
            return []

        active_jobs = self.get_active_generation_jobs_map(owner_key, [company.id for company in companies])
        contacts_by_company = self._company_contacts_map(owner_key, [company.id for company in companies])
        shared_campaign_context = (
            self._normalize_text(campaign_context)
            if campaign_context is not None
            else self.get_campaign_context(owner_key).brief
        )

        queued_payloads: list[dict[str, Any]] = []
        for company in companies:
            if company.id in active_jobs:
                continue
            coverage = self._contact_coverage(contacts_by_company.get(company.id, []))
            if not coverage.needs_discovery:
                continue
            queued_payloads.append(
                {
                    "company_id": company.id,
                    "trigger": "contact-discovery",
                    "campaign_context": company.campaign_context_override or shared_campaign_context,
                }
            )

        return self.enqueue_generation_jobs(owner_key, queued_payloads)

    def save_discovered_contacts(
        self,
        owner_key: str,
        company: CompanyRecord,
        contacts: Iterable[CompanyContactImport],
    ) -> list[CompanyContactRecord]:
        discovered_contacts = list(contacts)
        if not discovered_contacts:
            return self.list_company_contacts(owner_key, company.id)

        existing_contacts = self.list_company_contacts(owner_key, company.id)
        payloads: list[dict[str, Any]] = []
        discovered_official_email: str | None = None
        discovered_reach_channel: str | None = None

        for contact in discovered_contacts:
            matched = self._match_existing_contact(existing_contacts, contact)
            merged_metadata = self._merge_contact_metadata(
                matched.metadata if matched else {},
                contact.metadata,
            )
            payloads.append(
                {
                    "owner_key": owner_key,
                    "company_id": company.id,
                    "external_key": matched.external_key if matched else contact.external_key,
                    "full_name": self._prefer_text(contact.full_name, matched.full_name if matched else None),
                    "role_title": self._prefer_text(contact.role_title, matched.role_title if matched else None),
                    "email": self._prefer_text(contact.email, matched.email if matched else None),
                    "linkedin_url": self._prefer_text(
                        contact.linkedin_url,
                        matched.linkedin_url if matched else None,
                    ),
                    "raw_contact": self._prefer_text(contact.raw_contact, matched.raw_contact if matched else None),
                    "phone_or_address": self._prefer_text(
                        contact.phone_or_address,
                        matched.phone_or_address if matched else None,
                    ),
                    "reach_channel": self._prefer_text(
                        contact.reach_channel,
                        matched.reach_channel if matched else None,
                    ),
                    "notes": self._prefer_text(contact.notes, matched.notes if matched else None),
                    "source_row": contact.source_row if contact.source_row is not None else matched.source_row if matched else None,
                    "metadata": merged_metadata,
                    "is_primary": contact.is_primary or (matched.is_primary if matched else False),
                    "updated_at": self._now(),
                }
            )
            if contact.is_primary and self._is_valid_email(contact.email):
                discovered_official_email = contact.email
            if contact.is_primary and contact.reach_channel:
                discovered_reach_channel = contact.reach_channel

        payloads = self._dedupe_contact_payloads(payloads)
        (
            self.client.table("company_contacts")
            .upsert(payloads, on_conflict="owner_key,company_id,external_key")
            .execute()
        )

        company_update: dict[str, Any] = {"updated_at": self._now()}
        if discovered_official_email and not self._normalize_text(company.contact_email):
            company_update["contact_email"] = discovered_official_email
        if discovered_reach_channel and not self._normalize_text(company.reach_channel):
            company_update["reach_channel"] = discovered_reach_channel
        if len(company_update) > 1:
            (
                self.client.table("companies")
                .update(company_update)
                .eq("owner_key", owner_key)
                .eq("id", company.id)
                .execute()
            )

        return self.list_company_contacts(owner_key, company.id)

    def get_campaign_context(self, owner_key: str) -> CampaignContextRecord:
        response = (
            self.client.table("campaign_profiles")
            .select("*")
            .eq("owner_key", owner_key)
            .limit(1)
            .execute()
        )
        if not response.data:
            return CampaignContextRecord(owner_key=owner_key, brief=None, queue_paused=False)
        return CampaignContextRecord.model_validate(response.data[0])

    def save_campaign_context(self, owner_key: str, brief: str | None) -> CampaignContextRecord:
        current = self.get_campaign_context(owner_key)
        payload = {
            "owner_key": owner_key,
            "brief": self._normalize_text(brief),
            "queue_paused": current.queue_paused,
            "updated_at": self._now(),
        }
        response = (
            self.client.table("campaign_profiles")
            .upsert(payload, on_conflict="owner_key")
            .execute()
        )
        return CampaignContextRecord.model_validate(response.data[0])

    def queue_state(self, owner_key: str) -> QueueStateRecord:
        profile = self.get_campaign_context(owner_key)
        jobs = (
            self.client.table("generation_jobs")
            .select("status")
            .eq("owner_key", owner_key)
            .in_("status", ["queued", "running", "cancelling"])
            .execute()
        )
        queued_jobs = 0
        running_jobs = 0
        cancelling_jobs = 0
        for item in jobs.data:
            status = (item.get("status") or "").lower()
            if status == "queued":
                queued_jobs += 1
            elif status == "running":
                running_jobs += 1
            elif status == "cancelling":
                cancelling_jobs += 1
        return QueueStateRecord(
            owner_key=owner_key,
            queue_paused=profile.queue_paused,
            queued_jobs=queued_jobs,
            running_jobs=running_jobs,
            cancelling_jobs=cancelling_jobs,
        )

    def set_queue_paused(self, owner_key: str, paused: bool) -> QueueStateRecord:
        current = self.get_campaign_context(owner_key)
        payload = {
            "owner_key": owner_key,
            "brief": current.brief,
            "queue_paused": paused,
            "updated_at": self._now(),
        }
        self.client.table("campaign_profiles").upsert(payload, on_conflict="owner_key").execute()
        return self.queue_state(owner_key)

    def is_queue_paused(self, owner_key: str) -> bool:
        return self.get_campaign_context(owner_key).queue_paused

    def resolve_campaign_context(
        self,
        owner_key: str,
        company: CompanyRecord,
        explicit_campaign_context: str | None = None,
    ) -> str | None:
        explicit = self._normalize_text(explicit_campaign_context)
        if explicit:
            return explicit
        if company.campaign_context_override:
            return company.campaign_context_override
        return self.get_campaign_context(owner_key).brief

    def list_company_contacts(self, owner_key: str, company_id: str) -> list[CompanyContactRecord]:
        response = (
            self.client.table("company_contacts")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .execute()
        )
        contacts = [CompanyContactRecord.model_validate(item) for item in response.data]
        if not contacts:
            return []

        draft_map = self._contact_draft_map(owner_key, [contact.id for contact in contacts])
        hydrated = [
            contact.model_copy(update={"drafts": draft_map.get(contact.id, [])})
            for contact in contacts
        ]
        return sorted(
            hydrated,
            key=lambda contact: (
                0 if contact.is_primary else 1,
                contact.source_row if contact.source_row is not None else 10**6,
                (contact.full_name or contact.raw_contact or contact.email or "").lower(),
            ),
        )

    def company_has_valid_email_contact(self, owner_key: str, company_id: str) -> bool:
        contacts = self.list_company_contacts(owner_key, company_id)
        return any(self._is_valid_email(contact.email) for contact in contacts)

    def get_contact_draft(
        self,
        owner_key: str,
        contact_id: str,
        channel: str,
    ) -> ContactOutreachDraftRecord | None:
        response = (
            self.client.table("contact_outreach_drafts")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("contact_id", contact_id)
            .eq("channel", channel)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return ContactOutreachDraftRecord.model_validate(response.data[0])

    def update_contact_draft(
        self,
        owner_key: str,
        contact_id: str,
        channel: str,
        update: ContactDraftUpdateRequest,
    ) -> ContactOutreachDraftRecord | None:
        payload = update.model_dump(exclude_none=True)
        if not payload:
            return self.get_contact_draft(owner_key, contact_id, channel)
        payload["updated_at"] = self._now()
        response = (
            self.client.table("contact_outreach_drafts")
            .update(payload)
            .eq("owner_key", owner_key)
            .eq("contact_id", contact_id)
            .eq("channel", channel)
            .execute()
        )
        if not response.data:
            return None
        return ContactOutreachDraftRecord.model_validate(response.data[0])

    def save_contact_drafts(
        self,
        owner_key: str,
        drafts: Iterable[dict[str, Any]],
    ) -> list[ContactOutreachDraftRecord]:
        payloads = []
        for draft in drafts:
            payloads.append(
                {
                    "owner_key": owner_key,
                    "company_id": draft["company_id"],
                    "contact_id": draft["contact_id"],
                    "channel": draft["channel"],
                    "subject": draft.get("subject"),
                    "preview_line": draft.get("preview_line"),
                    "content_markdown": draft["content_markdown"],
                    "content_html": draft.get("content_html"),
                    "generated_context": draft.get("generated_context") or {},
                    "updated_at": self._now(),
                }
            )
        if not payloads:
            return []
        payloads = self._dedupe_draft_payloads(payloads)
        response = (
            self.client.table("contact_outreach_drafts")
            .upsert(payloads, on_conflict="owner_key,contact_id,channel")
            .execute()
        )
        return [ContactOutreachDraftRecord.model_validate(item) for item in response.data]

    def get_template_by_company(self, owner_key: str, company_id: str) -> EmailTemplateRecord | None:
        response = (
            self.client.table("email_templates")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return EmailTemplateRecord.model_validate(response.data[0])

    def save_generated_template(
        self,
        owner_key: str,
        company_id: str,
        generated_email: GeneratedEmail,
        generated_context: dict[str, Any],
    ) -> EmailTemplateRecord:
        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "subject": generated_email.subject,
            "preview_line": generated_email.preview_line,
            "content_markdown": generated_email.body_markdown,
            "content_html": generated_email.body_html,
            "generated_context": generated_context,
            "updated_at": self._now(),
        }
        response = (
            self.client.table("email_templates")
            .upsert(payload, on_conflict="owner_key,company_id")
            .execute()
        )
        return EmailTemplateRecord.model_validate(response.data[0])

    def update_template(
        self, owner_key: str, company_id: str, update: TemplateUpdateRequest
    ) -> EmailTemplateRecord | None:
        payload = update.model_dump(exclude_none=True)
        if not payload:
            return self.get_template_by_company(owner_key, company_id)
        payload["updated_at"] = self._now()
        response = (
            self.client.table("email_templates")
            .update(payload)
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .execute()
        )
        if not response.data:
            return None
        return EmailTemplateRecord.model_validate(response.data[0])

    def enqueue_generation_job(
        self,
        owner_key: str,
        *,
        company_id: str,
        trigger: str,
        campaign_context: str | None,
    ) -> GenerationJobRecord:
        existing = self.get_active_generation_job(owner_key, company_id)
        if existing:
            return existing
        current_step = "Queue paused" if self.is_queue_paused(owner_key) else "Queued"

        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "trigger": trigger,
            "status": "queued",
            "progress_percent": 0,
            "current_step": current_step,
            "campaign_context": self._normalize_text(campaign_context),
            "steps": self._serialize_steps(self._steps_for_trigger(trigger)),
            "updated_at": self._now(),
        }
        response = self.client.table("generation_jobs").insert(payload).execute()
        return GenerationJobRecord.model_validate(response.data[0])

    def enqueue_generation_jobs(
        self,
        owner_key: str,
        queued_jobs: Iterable[dict[str, Any]],
    ) -> list[GenerationJobRecord]:
        current_step = "Queue paused" if self.is_queue_paused(owner_key) else "Queued"
        payloads: list[dict[str, Any]] = []
        for queued_job in queued_jobs:
            payloads.append(
                {
                    "owner_key": owner_key,
                    "company_id": queued_job["company_id"],
                    "trigger": queued_job["trigger"],
                    "status": "queued",
                    "progress_percent": 0,
                    "current_step": current_step,
                    "campaign_context": self._normalize_text(
                        queued_job.get("campaign_context")
                    ),
                    "steps": self._serialize_steps(
                        self._steps_for_trigger(str(queued_job.get("trigger") or ""))
                    ),
                    "updated_at": self._now(),
                }
            )
        if not payloads:
            return []
        payloads = self._dedupe_generation_job_payloads(payloads)
        response = self.client.table("generation_jobs").insert(payloads).execute()
        return [GenerationJobRecord.model_validate(item) for item in response.data]

    def get_active_generation_job(self, owner_key: str, company_id: str) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .in_("status", ["queued", "running", "cancelling"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return GenerationJobRecord.model_validate(response.data[0])

    def get_active_generation_jobs_map(
        self,
        owner_key: str,
        company_ids: Iterable[str],
    ) -> dict[str, GenerationJobRecord]:
        ids = list(company_ids)
        if not ids:
            return {}
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("company_id", ids)
            .in_("status", ["queued", "running", "cancelling"])
            .order("created_at", desc=True)
            .execute()
        )
        active: dict[str, GenerationJobRecord] = {}
        for item in response.data:
            company_id = item.get("company_id")
            if company_id in active:
                continue
            active[company_id] = GenerationJobRecord.model_validate(item)
        return active

    def get_latest_generation_job(self, owner_key: str, company_id: str) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return GenerationJobRecord.model_validate(response.data[0])

    def get_generation_job(self, owner_key: str, job_id: str) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return GenerationJobRecord.model_validate(response.data[0])

    def claim_next_generation_job(self) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("status", "queued")
            .order("created_at", desc=False)
            .limit(100)
            .execute()
        )
        if not response.data:
            return None

        for item in response.data:
            job = GenerationJobRecord.model_validate(item)
            if self.is_queue_paused(job.owner_key):
                continue
            started_at = job.started_at.isoformat() if job.started_at else self._now()
            claimed = self.update_generation_job(
                job.id,
                status="running",
                progress_percent=max(job.progress_percent, 5),
                current_step="Preparing",
                started_at=started_at,
                error_message=None,
            )
            if claimed is not None:
                return claimed
        return None

    def cancel_generation_job(
        self,
        owner_key: str,
        job_id: str,
    ) -> GenerationJobRecord | None:
        job = self.get_generation_job(owner_key, job_id)
        if job is None:
            return None
        normalized_status = job.status.lower()
        if normalized_status in {"completed", "failed", "cancelled"}:
            return job
        if normalized_status == "queued":
            return self.update_generation_job(
                job.id,
                status="cancelled",
                current_step="Cancelled",
                error_message="Cancelled by user.",
                completed_at=self._now(),
            )
        if normalized_status in {"running", "cancelling"}:
            return self.update_generation_job(
                job.id,
                status="cancelling",
                current_step="Cancellation requested",
                error_message="Cancellation requested by user.",
            )
        return job

    def cancel_pending_generation_jobs(self, owner_key: str) -> QueueStateRecord:
        self.set_queue_paused(owner_key, True)
        self.client.table("generation_jobs").update(
            {
                "status": "cancelled",
                "current_step": "Cancelled",
                "error_message": "Stopped by user.",
                "completed_at": self._now(),
                "updated_at": self._now(),
            }
        ).eq("owner_key", owner_key).eq("status", "queued").execute()
        return self.queue_state(owner_key)

    def update_generation_job(
        self,
        job_id: str,
        *,
        status: str | None = None,
        progress_percent: int | None = None,
        current_step: str | None = None,
        steps: list[GenerationStepRecord] | list[dict[str, Any]] | None = None,
        template_id: str | None | object = _UNSET,
        error_message: str | None | object = _UNSET,
        started_at: str | None | object = _UNSET,
        completed_at: str | None | object = _UNSET,
    ) -> GenerationJobRecord | None:
        payload: dict[str, Any] = {"updated_at": self._now()}
        if status is not None:
            payload["status"] = status
        if progress_percent is not None:
            payload["progress_percent"] = max(0, min(progress_percent, 100))
        if current_step is not None:
            payload["current_step"] = current_step
        if steps is not None:
            payload["steps"] = self._serialize_steps(steps)
        if template_id is not _UNSET:
            payload["template_id"] = template_id
        if error_message is not _UNSET:
            payload["error_message"] = error_message
        if started_at is not _UNSET:
            payload["started_at"] = started_at
        if completed_at is not _UNSET:
            payload["completed_at"] = completed_at

        response = (
            self.client.table("generation_jobs")
            .update(payload)
            .eq("id", job_id)
            .execute()
        )
        if not response.data:
            return None
        return GenerationJobRecord.model_validate(response.data[0])

    def requeue_incomplete_jobs(self) -> None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("status", "running")
            .execute()
        )
        for item in response.data:
            job = GenerationJobRecord.model_validate(item)
            repaired_steps: list[GenerationStepRecord] = []
            for step in job.steps:
                if step.status == "running":
                    repaired_steps.append(
                        step.model_copy(
                            update={
                                "status": "pending",
                                "started_at": None,
                                "summary": None,
                                "details": [],
                                "sources": [],
                            }
                        )
                    )
                    continue
                repaired_steps.append(step)

            self.update_generation_job(
                job.id,
                status="queued",
                progress_percent=min(job.progress_percent, 5),
                current_step="Queued",
                steps=repaired_steps,
                error_message=None,
            )

    def create_notification(
        self,
        owner_key: str,
        *,
        title: str,
        message: str,
        level: str = "info",
        company_id: str | None = None,
        generation_job_id: str | None = None,
    ) -> NotificationRecord:
        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "generation_job_id": generation_job_id,
            "title": title,
            "message": message,
            "level": level,
        }
        response = self.client.table("notifications").insert(payload).execute()
        return NotificationRecord.model_validate(response.data[0])

    def list_notifications(self, owner_key: str, *, limit: int = 12) -> list[NotificationRecord]:
        response = (
            self.client.table("notifications")
            .select("*")
            .eq("owner_key", owner_key)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [NotificationRecord.model_validate(item) for item in response.data]

    def mark_all_notifications_read(self, owner_key: str) -> list[NotificationRecord]:
        response = (
            self.client.table("notifications")
            .update({"read_at": self._now()})
            .eq("owner_key", owner_key)
            .execute()
        )
        return [NotificationRecord.model_validate(item) for item in response.data]

    def owner_has_active_jobs(self, owner_key: str) -> bool:
        response = (
            self.client.table("generation_jobs")
            .select("id", count="exact")
            .eq("owner_key", owner_key)
            .in_("status", ["queued", "running", "cancelling"])
            .limit(1)
            .execute()
        )
        return bool((response.count or 0) > 0)

    def reset_workspace(self, owner_key: str) -> WorkspaceResetResponse:
        counts = {
            "deleted_companies": self._count_rows("companies", owner_key),
            "deleted_contacts": self._count_rows("company_contacts", owner_key),
            "deleted_drafts": self._count_rows("contact_outreach_drafts", owner_key),
            "deleted_jobs": self._count_rows("generation_jobs", owner_key),
            "deleted_notifications": self._count_rows("notifications", owner_key),
        }

        for table_name in (
            "notifications",
            "email_logs",
            "contact_outreach_drafts",
            "company_contacts",
            "email_templates",
            "generation_jobs",
            "companies",
            "campaign_profiles",
            "gmail_accounts",
        ):
            self.client.table(table_name).delete().eq("owner_key", owner_key).execute()

        return WorkspaceResetResponse(status="reset", **counts)

    def dashboard_summary(self, owner_key: str) -> DashboardSummary:
        companies = (
            self.client.table("companies")
            .select("id", count="exact")
            .eq("owner_key", owner_key)
            .execute()
        )
        drafts = (
            self.client.table("contact_outreach_drafts")
            .select("company_id", "channel")
            .eq("owner_key", owner_key)
            .execute()
        )
        sent = (
            self.client.table("email_logs")
            .select("id", count="exact")
            .eq("owner_key", owner_key)
            .eq("status", "sent")
            .execute()
        )
        jobs = (
            self.client.table("generation_jobs")
            .select("status")
            .eq("owner_key", owner_key)
            .execute()
        )
        job_counts = {"queued": 0, "running": 0, "completed": 0, "failed": 0}
        for item in jobs.data:
            status = (item.get("status") or "").lower()
            if status == "cancelling":
                job_counts["running"] += 1
            elif status in job_counts:
                job_counts[status] += 1
        notifications = (
            self.client.table("notifications")
            .select("read_at")
            .eq("owner_key", owner_key)
            .execute()
        )

        return DashboardSummary(
            total_companies=companies.count or 0,
            generated_templates=len(
                {
                    item.get("company_id")
                    for item in drafts.data
                    if item.get("channel") == "email" and item.get("company_id")
                }
            ),
            sent_emails=sent.count or 0,
            queued_jobs=job_counts["queued"],
            in_progress_jobs=job_counts["running"],
            completed_jobs=job_counts["completed"],
            failed_jobs=job_counts["failed"],
            unread_notifications=sum(
                1 for item in notifications.data if item.get("read_at") is None
            ),
        )

    def _count_rows(self, table_name: str, owner_key: str) -> int:
        response = (
            self.client.table(table_name)
            .select("id", count="exact")
            .eq("owner_key", owner_key)
            .limit(1)
            .execute()
        )
        return response.count or 0

    def save_gmail_account(
        self,
        owner_key: str,
        *,
        email: str,
        encrypted_access_token: str,
        encrypted_refresh_token: str | None,
        token_expiry: str | None,
        scope: str,
    ) -> None:
        payload = {
            "owner_key": owner_key,
            "email": email,
            "encrypted_access_token": encrypted_access_token,
            "encrypted_refresh_token": encrypted_refresh_token,
            "token_expiry": token_expiry,
            "scope": scope,
            "updated_at": self._now(),
        }
        self.client.table("gmail_accounts").upsert(payload, on_conflict="owner_key").execute()

    def get_gmail_account(self, owner_key: str) -> dict[str, Any] | None:
        response = (
            self.client.table("gmail_accounts")
            .select("*")
            .eq("owner_key", owner_key)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return response.data[0]

    def gmail_status(self, owner_key: str, configured: bool) -> GmailStatusResponse:
        account = self.get_gmail_account(owner_key)
        if not account:
            return GmailStatusResponse(configured=configured, connected=False)
        return GmailStatusResponse(
            configured=configured,
            connected=True,
            email=account.get("email"),
            connected_at=account.get("updated_at"),
        )

    def log_email(
        self,
        owner_key: str,
        *,
        company_id: str,
        contact_id: str | None,
        template_id: str | None,
        draft_id: str | None,
        recipient_email: str,
        status: str,
        gmail_message_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "contact_id": contact_id,
            "template_id": template_id,
            "draft_id": draft_id,
            "recipient_email": recipient_email,
            "status": status,
            "gmail_message_id": gmail_message_id,
            "error_message": error_message,
            "sent_at": self._now(),
        }
        self.client.table("email_logs").insert(payload).execute()

    def _hydrate_companies(self, owner_key: str, companies: list[CompanyRecord]) -> list[CompanyRecord]:
        company_ids = [company.id for company in companies]
        template_map = self._template_map(owner_key, company_ids)
        job_map = self._latest_job_map(owner_key, company_ids)
        contact_counts = self._contact_count_map(owner_key, company_ids)
        draft_counts = self._draft_count_map(owner_key, company_ids)
        return [
            self._hydrate_company(
                company,
                template_map.get(company.id),
                job_map.get(company.id),
                contact_count=contact_counts.get(company.id, 0),
                draft_count=draft_counts.get(company.id, 0),
            )
            for company in companies
        ]

    def _hydrate_company(
        self,
        company: CompanyRecord,
        template: EmailTemplateRecord | None,
        job: GenerationJobRecord | None,
        *,
        contact_count: int = 0,
        draft_count: int = 0,
    ) -> CompanyRecord:
        updates: dict[str, Any] = {
            "has_template": template is not None or draft_count > 0,
            "contact_count": contact_count,
            "draft_count": draft_count,
        }
        if job:
            updates.update(
                {
                    "generation_status": job.status,
                    "generation_progress_percent": job.progress_percent,
                    "generation_current_step": job.current_step,
                    "generation_error_message": job.error_message,
                    "latest_generation_job_id": job.id,
                    "latest_generation_trigger": job.trigger,
                    "latest_generation_updated_at": job.updated_at,
                }
            )
        return company.model_copy(update=updates)

    def _template_map(self, owner_key: str, company_ids: list[str]) -> dict[str, EmailTemplateRecord]:
        if not company_ids:
            return {}
        response = (
            self.client.table("email_templates")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("company_id", company_ids)
            .execute()
        )
        return {
            item["company_id"]: EmailTemplateRecord.model_validate(item)
            for item in response.data
        }

    def _contact_count_map(self, owner_key: str, company_ids: list[str]) -> dict[str, int]:
        if not company_ids:
            return {}
        response = (
            self.client.table("company_contacts")
            .select("company_id")
            .eq("owner_key", owner_key)
            .in_("company_id", company_ids)
            .execute()
        )
        counts = {company_id: 0 for company_id in company_ids}
        for item in response.data:
            company_id = item.get("company_id")
            if company_id in counts:
                counts[company_id] += 1
        return counts

    def _company_contacts_map(
        self,
        owner_key: str,
        company_ids: list[str],
    ) -> dict[str, list[CompanyContactRecord]]:
        if not company_ids:
            return {}
        response = (
            self.client.table("company_contacts")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("company_id", company_ids)
            .execute()
        )
        contacts_by_company = {company_id: [] for company_id in company_ids}
        for item in response.data:
            contact = CompanyContactRecord.model_validate(item)
            contacts_by_company.setdefault(contact.company_id, []).append(contact)
        return contacts_by_company

    def _draft_count_map(self, owner_key: str, company_ids: list[str]) -> dict[str, int]:
        if not company_ids:
            return {}
        response = (
            self.client.table("contact_outreach_drafts")
            .select("company_id", "channel")
            .eq("owner_key", owner_key)
            .in_("company_id", company_ids)
            .execute()
        )
        counts = {company_id: 0 for company_id in company_ids}
        for item in response.data:
            if item.get("channel") != "email":
                continue
            company_id = item.get("company_id")
            if company_id in counts:
                counts[company_id] += 1
        return counts

    def _contact_draft_map(
        self,
        owner_key: str,
        contact_ids: list[str],
    ) -> dict[str, list[ContactOutreachDraftRecord]]:
        if not contact_ids:
            return {}
        response = (
            self.client.table("contact_outreach_drafts")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("contact_id", contact_ids)
            .execute()
        )
        drafts_by_contact = {contact_id: [] for contact_id in contact_ids}
        for item in response.data:
            draft = ContactOutreachDraftRecord.model_validate(item)
            drafts_by_contact.setdefault(draft.contact_id, []).append(draft)
        for drafts in drafts_by_contact.values():
            drafts.sort(key=lambda draft: 0 if draft.channel == "email" else 1)
        return drafts_by_contact

    def _latest_job_map(self, owner_key: str, company_ids: list[str]) -> dict[str, GenerationJobRecord]:
        if not company_ids:
            return {}
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .in_("company_id", company_ids)
            .order("created_at", desc=True)
            .execute()
        )
        latest: dict[str, GenerationJobRecord] = {}
        for item in response.data:
            company_id = item.get("company_id")
            if company_id in latest:
                continue
            latest[company_id] = GenerationJobRecord.model_validate(item)
        return latest

    def _steps_for_trigger(self, trigger: str | None) -> list[GenerationStepRecord]:
        if trigger == "contact-discovery":
            return self._contact_discovery_steps()
        return self._outreach_generation_steps()

    def _contact_discovery_steps(self) -> list[GenerationStepRecord]:
        return [
            GenerationStepRecord(
                key="queue",
                title="Queued",
                status="completed",
                description="The job is waiting for the background worker to pick it up.",
            ),
            GenerationStepRecord(
                key="contact_gap_review",
                title="Contact Gap Review",
                description="Reviewing the imported roster to confirm whether an official inbox and a relevant person contact are still missing.",
            ),
            GenerationStepRecord(
                key="official_contact_search",
                title="Official Contact Search",
                description="Looking for a public company email or official contact route on trusted sources.",
            ),
            GenerationStepRecord(
                key="decision_maker_search",
                title="Decision-Maker Search",
                description="Finding a person whose role best matches sponsorship, partnerships, CSR, innovation, talent, or university engagement.",
            ),
            GenerationStepRecord(
                key="contact_save",
                title="Contact Save",
                description="Writing any newly verified contact records back into the workspace.",
            ),
        ]

    def _outreach_generation_steps(self) -> list[GenerationStepRecord]:
        return [
            GenerationStepRecord(
                key="queue",
                title="Queued",
                status="completed",
                description="The job is waiting for the background worker to pick it up.",
            ),
            GenerationStepRecord(
                key="company_research",
                title="Company Research",
                description="Scanning the website, positioning, products, values, and recent public moves.",
            ),
            GenerationStepRecord(
                key="leadership_research",
                title="Leadership Research",
                description="Looking for public leaders, partnership teams, and messaging themes tied to sponsorship fit.",
            ),
            GenerationStepRecord(
                key="context_synthesis",
                title="Context Synthesis",
                description="Mapping company priorities to your campaign brief and deciding the strongest alignment angle.",
            ),
            GenerationStepRecord(
                key="email_generation",
                title="Contact Drafting",
                description="Writing email and LinkedIn outreach for each contact using company and recipient-specific hooks.",
            ),
            GenerationStepRecord(
                key="email_humanization",
                title="Humanizer",
                description="Refining each contact draft so it sounds more natural, direct, and less model-written before saving.",
            ),
        ]

    def _serialize_steps(
        self,
        steps: list[GenerationStepRecord] | list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        serialized: list[dict[str, Any]] = []
        for step in steps:
            if isinstance(step, BaseModel):
                serialized.append(step.model_dump(mode="json"))
            else:
                serialized.append(step)
        return serialized

    def _dedupe_company_rows_for_upsert(
        self,
        companies: list[CompanyImportRow],
    ) -> list[CompanyImportRow]:
        deduped: dict[str, CompanyImportRow] = {}
        order: list[str] = []
        for company in companies:
            key = self._normalize_company_name(company.name)
            if key not in deduped:
                deduped[key] = company.model_copy(deep=True)
                order.append(key)
                continue
            deduped[key] = self._merge_company_import_rows(deduped[key], company)
        return [deduped[key] for key in order]

    def _merge_company_import_rows(
        self,
        existing: CompanyImportRow,
        incoming: CompanyImportRow,
    ) -> CompanyImportRow:
        source_rows = [
            source_row
            for source_row in [existing.source_row, incoming.source_row]
            if source_row is not None
        ]
        return existing.model_copy(
            update={
                "website": self._prefer_text(existing.website, incoming.website),
                "industry": self._prefer_text(existing.industry, incoming.industry),
                "tier": self._prefer_text(existing.tier, incoming.tier),
                "contact_email": self._prefer_text(existing.contact_email, incoming.contact_email),
                "contact_details": self._prefer_text(existing.contact_details, incoming.contact_details),
                "phone_or_address": self._prefer_text(existing.phone_or_address, incoming.phone_or_address),
                "reach_channel": self._prefer_text(existing.reach_channel, incoming.reach_channel),
                "notes": self._combine_text(existing.notes, incoming.notes),
                "status": self._prefer_text(existing.status, incoming.status),
                "source_row": min(source_rows) if source_rows else None,
                "metadata": self._merge_contact_metadata(existing.metadata, incoming.metadata),
                "contacts": [*existing.contacts, *incoming.contacts],
            }
        )

    def _dedupe_contact_payloads(
        self,
        payloads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
        order: list[tuple[str, str, str]] = []
        for payload in payloads:
            key = (
                str(payload["owner_key"]),
                str(payload["company_id"]),
                str(payload["external_key"]),
            )
            if key not in deduped:
                deduped[key] = dict(payload)
                order.append(key)
                continue
            deduped[key] = self._merge_contact_payload_row(deduped[key], payload)
        return [deduped[key] for key in order]

    def _merge_contact_payload_row(
        self,
        existing: dict[str, Any],
        incoming: dict[str, Any],
    ) -> dict[str, Any]:
        source_rows = [
            source_row
            for source_row in [existing.get("source_row"), incoming.get("source_row")]
            if source_row is not None
        ]
        return {
            **existing,
            "full_name": self._prefer_text(existing.get("full_name"), incoming.get("full_name")),
            "role_title": self._prefer_text(existing.get("role_title"), incoming.get("role_title")),
            "email": self._prefer_text(existing.get("email"), incoming.get("email")),
            "linkedin_url": self._prefer_text(existing.get("linkedin_url"), incoming.get("linkedin_url")),
            "raw_contact": self._prefer_text(existing.get("raw_contact"), incoming.get("raw_contact")),
            "phone_or_address": self._prefer_text(
                existing.get("phone_or_address"),
                incoming.get("phone_or_address"),
            ),
            "reach_channel": self._prefer_text(existing.get("reach_channel"), incoming.get("reach_channel")),
            "notes": self._combine_text(existing.get("notes"), incoming.get("notes")),
            "source_row": min(source_rows) if source_rows else None,
            "metadata": self._merge_contact_metadata(
                existing.get("metadata") or {},
                incoming.get("metadata") or {},
            ),
            "is_primary": bool(existing.get("is_primary")) or bool(incoming.get("is_primary")),
            "updated_at": incoming.get("updated_at") or existing.get("updated_at"),
        }

    def _dedupe_draft_payloads(
        self,
        payloads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
        order: list[tuple[str, str, str]] = []
        for payload in payloads:
            key = (
                str(payload["owner_key"]),
                str(payload["contact_id"]),
                str(payload["channel"]),
            )
            if key not in deduped:
                deduped[key] = dict(payload)
                order.append(key)
                continue
            deduped[key] = {
                **deduped[key],
                **payload,
                "subject": payload.get("subject") or deduped[key].get("subject"),
                "preview_line": payload.get("preview_line") or deduped[key].get("preview_line"),
                "content_markdown": payload.get("content_markdown") or deduped[key].get("content_markdown"),
                "content_html": payload.get("content_html") or deduped[key].get("content_html"),
                "generated_context": {
                    **(deduped[key].get("generated_context") or {}),
                    **(payload.get("generated_context") or {}),
                },
            }
        return [deduped[key] for key in order]

    def _dedupe_generation_job_payloads(
        self,
        payloads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        deduped: dict[tuple[str, str], dict[str, Any]] = {}
        order: list[tuple[str, str]] = []
        for payload in payloads:
            key = (str(payload["owner_key"]), str(payload["company_id"]))
            if key not in deduped:
                deduped[key] = dict(payload)
                order.append(key)
                continue
            deduped[key] = {**deduped[key], **payload}
        return [deduped[key] for key in order]

    def _fallback_contacts_from_company(
        self,
        company: CompanyImportRow,
    ) -> list[CompanyContactImport]:
        if not any(
            [
                company.contact_details,
                company.contact_email,
                company.phone_or_address,
                company.reach_channel,
            ]
        ):
            return []
        external_key = "|".join(
            part
            for part in (
                company.name.strip().lower(),
                str(company.source_row or ""),
                (company.contact_email or "").strip().lower(),
                (company.contact_details or "").strip().lower(),
            )
            if part
        )
        return [
            CompanyContactImport(
                external_key=external_key or company.name.strip().lower(),
                raw_contact=company.contact_details,
                email=company.contact_email,
                phone_or_address=company.phone_or_address,
                reach_channel=company.reach_channel,
                notes=company.notes,
                source_row=company.source_row,
                metadata={},
                is_primary=True,
            )
        ]

    def _contact_coverage(self, contacts: list[CompanyContactRecord]) -> ContactCoverage:
        has_official_company_contact = any(
            self._is_valid_email(contact.email) and not self._is_individual_contact(contact)
            for contact in contacts
        )
        has_individual_contact = any(
            self._is_individual_contact(contact)
            and bool(self._is_valid_email(contact.email) or self._normalize_text(contact.linkedin_url))
            for contact in contacts
        )
        return ContactCoverage(
            has_official_company_contact=has_official_company_contact,
            has_individual_contact=has_individual_contact,
            total_contacts=len(contacts),
        )

    def _is_individual_contact(self, contact: CompanyContactRecord) -> bool:
        if contact.full_name:
            lowered = contact.full_name.lower()
            if any(token in lowered for token in INDIVIDUAL_TEAM_TOKENS):
                return False
            return True
        raw_contact = (contact.raw_contact or "").lower()
        if not raw_contact:
            return False
        if any(token in raw_contact for token in ("mr ", "mrs ", "ms ", "dr ", "prof ")):
            return True
        return False

    def _match_existing_contact(
        self,
        existing_contacts: list[CompanyContactRecord],
        candidate: CompanyContactImport,
    ) -> CompanyContactRecord | None:
        candidate_email = self._normalize_text(candidate.email)
        candidate_linkedin = self._normalize_text(candidate.linkedin_url)
        candidate_name = self._normalize_text(candidate.full_name)
        candidate_raw = self._normalize_text(candidate.raw_contact)

        for contact in existing_contacts:
            if candidate_email and candidate_email == self._normalize_text(contact.email):
                return contact
            if candidate_linkedin and candidate_linkedin == self._normalize_text(contact.linkedin_url):
                return contact
            if candidate_name and candidate_name == self._normalize_text(contact.full_name):
                return contact
            if candidate_raw and candidate_raw == self._normalize_text(contact.raw_contact):
                return contact
        return None

    def _merge_contact_metadata(
        self,
        existing_metadata: dict[str, Any],
        new_metadata: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(existing_metadata)
        for key, value in new_metadata.items():
            if value in (None, "", [], {}):
                continue
            if (
                key in merged
                and isinstance(merged[key], list)
                and isinstance(value, list)
            ):
                combined = merged[key] + value
                deduped: list[Any] = []
                for item in combined:
                    if item in deduped:
                        continue
                    deduped.append(item)
                merged[key] = deduped
                continue
            merged[key] = value
        return merged

    def _prefer_text(self, primary: str | None, fallback: str | None) -> str | None:
        return self._normalize_text(primary) or self._normalize_text(fallback)

    def _combine_text(self, primary: str | None, secondary: str | None) -> str | None:
        first = self._normalize_text(primary)
        second = self._normalize_text(secondary)
        if not first:
            return second
        if not second or first == second:
            return first
        return f"{first}\n{second}"

    def _is_valid_email(self, value: str | None) -> bool:
        normalized = self._normalize_text(value)
        if not normalized:
            return False
        return bool(VALID_EMAIL_PATTERN.match(normalized))

    def _normalize_company_name(self, value: str) -> str:
        normalized = self._normalize_text(value) or value
        return re.sub(r"\s+", " ", normalized).strip().lower()

    def _normalize_text(self, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
