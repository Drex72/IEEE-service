from __future__ import annotations

import threading
import time
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

import httpx
from pydantic import BaseModel
from supabase import Client, create_client

from app.core.config import Settings
from app.models.schemas import (
    CampaignContextRecord,
    CompanyImportRow,
    CompanyRecord,
    CompanyUpdateRequest,
    DashboardSummary,
    EmailTemplateRecord,
    GeneratedEmail,
    GenerationJobRecord,
    GenerationStepRecord,
    GmailStatusResponse,
    NotificationRecord,
    TemplateUpdateRequest,
)


_UNSET = object()
ResponseT = TypeVar("ResponseT")


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
        return self._hydrate_company(company, template, job)

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
        return self._hydrate_company(company, template, job)

    def upsert_companies(self, owner_key: str, companies: Iterable[CompanyImportRow]) -> list[CompanyRecord]:
        payload = []
        for company in companies:
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
        return self._hydrate_companies(owner_key, saved)

    def get_campaign_context(self, owner_key: str) -> CampaignContextRecord:
        response = (
            self.client.table("campaign_profiles")
            .select("*")
            .eq("owner_key", owner_key)
            .limit(1)
            .execute()
        )
        if not response.data:
            return CampaignContextRecord(owner_key=owner_key, brief=None)
        return CampaignContextRecord.model_validate(response.data[0])

    def save_campaign_context(self, owner_key: str, brief: str | None) -> CampaignContextRecord:
        payload = {
            "owner_key": owner_key,
            "brief": self._normalize_text(brief),
            "updated_at": self._now(),
        }
        response = (
            self.client.table("campaign_profiles")
            .upsert(payload, on_conflict="owner_key")
            .execute()
        )
        return CampaignContextRecord.model_validate(response.data[0])

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

        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "trigger": trigger,
            "status": "queued",
            "progress_percent": 0,
            "current_step": "Queued",
            "campaign_context": self._normalize_text(campaign_context),
            "steps": self._serialize_steps(self._default_generation_steps()),
            "updated_at": self._now(),
        }
        response = self.client.table("generation_jobs").insert(payload).execute()
        return GenerationJobRecord.model_validate(response.data[0])

    def enqueue_generation_jobs(
        self,
        owner_key: str,
        queued_jobs: Iterable[dict[str, Any]],
    ) -> list[GenerationJobRecord]:
        payloads: list[dict[str, Any]] = []
        for queued_job in queued_jobs:
            payloads.append(
                {
                    "owner_key": owner_key,
                    "company_id": queued_job["company_id"],
                    "trigger": queued_job["trigger"],
                    "status": "queued",
                    "progress_percent": 0,
                    "current_step": "Queued",
                    "campaign_context": self._normalize_text(
                        queued_job.get("campaign_context")
                    ),
                    "steps": self._serialize_steps(self._default_generation_steps()),
                    "updated_at": self._now(),
                }
            )
        if not payloads:
            return []
        response = self.client.table("generation_jobs").insert(payloads).execute()
        return [GenerationJobRecord.model_validate(item) for item in response.data]

    def get_active_generation_job(self, owner_key: str, company_id: str) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("owner_key", owner_key)
            .eq("company_id", company_id)
            .in_("status", ["queued", "running"])
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
            .in_("status", ["queued", "running"])
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

    def claim_next_generation_job(self) -> GenerationJobRecord | None:
        response = (
            self.client.table("generation_jobs")
            .select("*")
            .eq("status", "queued")
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None

        job = GenerationJobRecord.model_validate(response.data[0])
        started_at = job.started_at.isoformat() if job.started_at else self._now()
        claimed = self.update_generation_job(
            job.id,
            status="running",
            progress_percent=max(job.progress_percent, 5),
            current_step="Preparing",
            started_at=started_at,
            error_message=None,
        )
        return claimed

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

    def dashboard_summary(self, owner_key: str) -> DashboardSummary:
        companies = (
            self.client.table("companies")
            .select("id", count="exact")
            .eq("owner_key", owner_key)
            .execute()
        )
        templates = (
            self.client.table("email_templates")
            .select("id", count="exact")
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
            status = item.get("status")
            if status in job_counts:
                job_counts[status] += 1
        notifications = (
            self.client.table("notifications")
            .select("read_at")
            .eq("owner_key", owner_key)
            .execute()
        )

        return DashboardSummary(
            total_companies=companies.count or 0,
            generated_templates=templates.count or 0,
            sent_emails=sent.count or 0,
            queued_jobs=job_counts["queued"],
            in_progress_jobs=job_counts["running"],
            completed_jobs=job_counts["completed"],
            failed_jobs=job_counts["failed"],
            unread_notifications=sum(
                1 for item in notifications.data if item.get("read_at") is None
            ),
        )

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
        template_id: str | None,
        recipient_email: str,
        status: str,
        gmail_message_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        payload = {
            "owner_key": owner_key,
            "company_id": company_id,
            "template_id": template_id,
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
        return [
            self._hydrate_company(
                company,
                template_map.get(company.id),
                job_map.get(company.id),
            )
            for company in companies
        ]

    def _hydrate_company(
        self,
        company: CompanyRecord,
        template: EmailTemplateRecord | None,
        job: GenerationJobRecord | None,
    ) -> CompanyRecord:
        updates: dict[str, Any] = {"has_template": template is not None}
        if job:
            updates.update(
                {
                    "generation_status": job.status,
                    "generation_progress_percent": job.progress_percent,
                    "generation_current_step": job.current_step,
                    "generation_error_message": job.error_message,
                    "latest_generation_job_id": job.id,
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

    def _default_generation_steps(self) -> list[GenerationStepRecord]:
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
                title="Email Draft",
                description="Writing the outreach email with a concrete ask, tone, and personalization hooks.",
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

    def _normalize_text(self, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
