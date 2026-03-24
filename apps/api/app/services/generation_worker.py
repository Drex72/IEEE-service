from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.models.schemas import (
    CompanyContactImport,
    CompanyResearch,
    ContactDiscoveryResult,
    GeneratedEmail,
    GenerationJobRecord,
    GenerationStepRecord,
    LeadershipResearch,
    ResearchSource,
    UnifiedContext,
)
from app.services.openai_pipeline import GeneratedOutreachBundle, OutreachPipeline
from app.services.supabase import SupabaseRepository


logger = logging.getLogger(__name__)


class JobCancelledError(RuntimeError):
    pass


class GenerationWorker:
    def __init__(
        self,
        repo: SupabaseRepository,
        pipeline: OutreachPipeline,
        *,
        poll_interval_seconds: float = 2.0,
        concurrency: int = 1,
    ) -> None:
        self.repo = repo
        self.pipeline = pipeline
        self.poll_interval_seconds = poll_interval_seconds
        self.concurrency = max(1, concurrency)
        self._loop_task: asyncio.Task[None] | None = None
        self._active_tasks: set[asyncio.Task[None]] = set()
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._loop_task is not None:
            return
        await asyncio.to_thread(self.repo.requeue_incomplete_jobs)
        self._stop_event.clear()
        self._loop_task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._loop_task is None:
            return
        self._stop_event.set()
        await self._loop_task
        self._loop_task = None

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            self._reap_finished_tasks()

            while len(self._active_tasks) < self.concurrency:
                job = await asyncio.to_thread(self.repo.claim_next_generation_job)
                if job is None:
                    break
                task = asyncio.create_task(self._process_job(job))
                self._active_tasks.add(task)
                task.add_done_callback(self._active_tasks.discard)

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.poll_interval_seconds,
                )
            except TimeoutError:
                continue

        if self._active_tasks:
            await asyncio.gather(*self._active_tasks, return_exceptions=True)

    async def _process_job(self, job: GenerationJobRecord) -> None:
        try:
            await asyncio.to_thread(self._process_job_sync, job)
        except Exception:
            logger.exception("Background generation job %s crashed.", job.id)

    def _process_job_sync(self, job: GenerationJobRecord) -> None:
        company = self.repo.get_company(job.owner_key, job.company_id)
        if company is None:
            self.repo.update_generation_job(
                job.id,
                status="failed",
                current_step="Failed",
                error_message="Company not found.",
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Generation failed",
                message="A queued job could not find its company record.",
                level="danger",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
            return

        if job.trigger == "contact-discovery":
            self._process_contact_discovery_job_sync(job, company)
            return

        contacts = self.repo.list_company_contacts(job.owner_key, job.company_id)
        if not contacts:
            self.repo.update_generation_job(
                job.id,
                status="failed",
                current_step="Failed",
                error_message="No company contacts are available for outreach generation.",
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Generation failed",
                message=f"{company.name} has no contact records yet, so no personalized drafts could be produced.",
                level="danger",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
            return

        steps = list(job.steps)
        try:
            self._set_step_running(
                job,
                steps,
                step_key="company_research",
                progress=15,
                current_step="Researching company",
            )
            program_context = self.pipeline.build_program_context(job.campaign_context)
            company_research = self.pipeline.research_company(company, program_context)
            self._set_step_completed(
                job,
                steps,
                step_key="company_research",
                progress=35,
                current_step="Researching leadership",
                summary=self._company_research_summary(company_research),
                details=self._company_research_details(company_research),
                sources=company_research.sources,
            )

            self._set_step_running(
                job,
                steps,
                step_key="leadership_research",
                progress=45,
                current_step="Researching leadership",
            )
            leadership_research = self.pipeline.research_leadership(company, program_context)
            self._set_step_completed(
                job,
                steps,
                step_key="leadership_research",
                progress=60,
                current_step="Synthesizing fit",
                summary=self._leadership_summary(leadership_research),
                details=self._leadership_details(leadership_research),
                sources=leadership_research.sources,
            )

            self._set_step_running(
                job,
                steps,
                step_key="context_synthesis",
                progress=70,
                current_step="Synthesizing fit",
            )
            unified_context = self.pipeline.synthesize_context(
                company,
                program_context,
                company_research,
                leadership_research,
            )
            self._set_step_completed(
                job,
                steps,
                step_key="context_synthesis",
                progress=82,
                current_step="Writing email draft",
                summary=unified_context.executive_summary,
                details=self._context_details(unified_context),
                sources=unified_context.sources,
            )

            self._set_step_running(
                job,
                steps,
                step_key="email_generation",
                progress=88,
                current_step="Drafting contact outreach",
            )
            drafted_bundles: list[tuple[Any, GeneratedOutreachBundle]] = []
            draft_details: list[str] = []
            for contact in contacts:
                bundle = self.pipeline.write_contact_outreach(
                    company,
                    contact,
                    program_context,
                    unified_context,
                    leadership_research,
                )
                drafted_bundles.append((contact, bundle))
                draft_details.extend(self._bundle_draft_details(contact, bundle))
            self._set_step_completed(
                job,
                steps,
                step_key="email_generation",
                progress=93,
                current_step="Humanizing contact drafts",
                summary=self._bundle_generation_summary(contacts),
                details=draft_details[:10],
                sources=[],
            )

            self._set_step_running(
                job,
                steps,
                step_key="email_humanization",
                progress=96,
                current_step="Humanizing contact drafts",
            )
            humanized_bundles: list[tuple[Any, GeneratedOutreachBundle]] = []
            final_draft_payloads: list[dict[str, object]] = []
            primary_email: GeneratedEmail | None = None
            primary_context: dict[str, object] | None = None
            humanized_details: list[str] = []

            for contact, draft_bundle in drafted_bundles:
                final_bundle = self.pipeline.humanize_contact_outreach(
                    company,
                    contact,
                    program_context,
                    unified_context,
                    leadership_research,
                    draft_bundle,
                )
                humanized_bundles.append((contact, final_bundle))
                humanized_details.extend(self._humanized_bundle_details(contact, final_bundle))

                contact_context_base: dict[str, object] = {
                    "program_context": program_context,
                    "user_campaign_brief": job.campaign_context,
                    "company_research": company_research.model_dump(mode="json"),
                    "leadership_research": leadership_research.model_dump(mode="json"),
                    "unified_context": unified_context.model_dump(mode="json"),
                    "contact": contact.model_dump(mode="json"),
                    "draft_bundle": draft_bundle.model_dump(mode="json"),
                    "final_bundle": final_bundle.model_dump(mode="json"),
                    "generation_job_id": job.id,
                }

                final_draft_payloads.append(
                    {
                        "company_id": job.company_id,
                        "contact_id": contact.id,
                        "channel": "email",
                        "subject": final_bundle.email.subject,
                        "preview_line": final_bundle.email.preview_line,
                        "content_markdown": final_bundle.email.body_markdown,
                        "content_html": final_bundle.email.body_html,
                        "generated_context": {
                            **contact_context_base,
                            "channel": "email",
                        },
                    }
                )
                final_draft_payloads.append(
                    {
                        "company_id": job.company_id,
                        "contact_id": contact.id,
                        "channel": "linkedin",
                        "subject": None,
                        "preview_line": None,
                        "content_markdown": final_bundle.linkedin_message.body_markdown,
                        "content_html": final_bundle.linkedin_message.body_html,
                        "generated_context": {
                            **contact_context_base,
                            "channel": "linkedin",
                        },
                    }
                )

                if primary_email is None or contact.is_primary:
                    primary_email = final_bundle.email
                    primary_context = {
                        **contact_context_base,
                        "channel": "email",
                    }
            self._set_step_completed(
                job,
                steps,
                step_key="email_humanization",
                progress=99,
                current_step="Saving completed drafts",
                summary=self._bundle_humanized_summary(contacts),
                details=humanized_details[:10],
                sources=[],
            )

            self._ensure_not_cancelled(job)
            self.repo.save_contact_drafts(job.owner_key, final_draft_payloads)
            template = None
            if primary_email and primary_context:
                template = self.repo.save_generated_template(
                    job.owner_key,
                    job.company_id,
                    primary_email,
                    primary_context,
                )
            self.repo.update_generation_job(
                job.id,
                status="completed",
                progress_percent=100,
                current_step="Completed",
                steps=steps,
                template_id=template.id if template else None,
                completed_at=self._now(),
                error_message=None,
            )
            self.repo.create_notification(
                job.owner_key,
                title="Draft package ready",
                message=(
                    f"{company.name} now has {len(contacts)} contact-specific outreach package"
                    f"{'' if len(contacts) == 1 else 's'} ready for review."
                ),
                level="success",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
        except JobCancelledError as exc:
            cancelled_steps = self._mark_active_step_cancelled(steps, str(exc))
            self.repo.update_generation_job(
                job.id,
                status="cancelled",
                current_step="Cancelled",
                steps=cancelled_steps,
                error_message=str(exc),
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Run cancelled",
                message=f"{company.name} was removed from the queue before the draft package finished.",
                level="warning",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
        except Exception as exc:
            failed_steps = self._mark_active_step_failed(steps, str(exc))
            self.repo.update_generation_job(
                job.id,
                status="failed",
                current_step="Failed",
                steps=failed_steps,
                error_message=str(exc),
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Generation failed",
                message=f"{company.name} could not be processed. Open the company detail page to inspect the failure.",
                level="danger",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
            raise

    def _process_contact_discovery_job_sync(
        self,
        job: GenerationJobRecord,
        company: Any,
    ) -> None:
        contacts = self.repo.list_company_contacts(job.owner_key, job.company_id)
        steps = list(job.steps)

        try:
            self._set_step_running(
                job,
                steps,
                step_key="contact_gap_review",
                progress=12,
                current_step="Reviewing current contacts",
            )
            self._set_step_completed(
                job,
                steps,
                step_key="contact_gap_review",
                progress=22,
                current_step="Searching official company contact",
                summary=self._contact_gap_summary(company.name, contacts),
                details=self._contact_gap_details(contacts),
                sources=[],
            )

            if self._has_required_contact_mix(contacts):
                self._set_step_completed(
                    job,
                    steps,
                    step_key="official_contact_search",
                    progress=45,
                    current_step="Searching decision-maker contact",
                    summary="A public company inbox is already available.",
                    details=["The imported roster already includes an official email route."],
                    sources=[],
                )
                self._set_step_completed(
                    job,
                    steps,
                    step_key="decision_maker_search",
                    progress=70,
                    current_step="Saving discovered contacts",
                    summary="A relevant person contact is already available.",
                    details=["The imported roster already includes an individual contact route."],
                    sources=[],
                )
                self._set_step_completed(
                    job,
                    steps,
                    step_key="contact_save",
                    progress=100,
                    current_step="Contacts ready",
                    summary="The contact roster already meets the target of one official inbox and one person contact.",
                    details=self._contact_gap_details(contacts),
                    sources=[],
                )
                self.repo.update_generation_job(
                    job.id,
                    status="completed",
                    progress_percent=100,
                    current_step="Contacts ready",
                    steps=steps,
                    completed_at=self._now(),
                    error_message=None,
                )
                return

            self._set_step_running(
                job,
                steps,
                step_key="official_contact_search",
                progress=35,
                current_step="Searching official company contact",
            )
            program_context = self.pipeline.build_program_context(job.campaign_context)
            discovery = self.pipeline.discover_missing_contacts(
                company,
                program_context,
                contacts,
            )
            self._set_step_completed(
                job,
                steps,
                step_key="official_contact_search",
                progress=58,
                current_step="Searching decision-maker contact",
                summary=self._official_contact_summary(discovery),
                details=self._official_contact_details(discovery),
                sources=self._official_contact_sources(discovery),
            )

            self._set_step_running(
                job,
                steps,
                step_key="decision_maker_search",
                progress=68,
                current_step="Searching decision-maker contact",
            )
            self._set_step_completed(
                job,
                steps,
                step_key="decision_maker_search",
                progress=84,
                current_step="Saving discovered contacts",
                summary=self._decision_maker_summary(discovery),
                details=self._decision_maker_details(discovery),
                sources=self._decision_maker_sources(discovery),
            )

            self._set_step_running(
                job,
                steps,
                step_key="contact_save",
                progress=92,
                current_step="Saving discovered contacts",
            )
            self._ensure_not_cancelled(job)
            discovered_contacts = self._build_discovered_contacts(company, discovery)
            saved_contacts = self.repo.save_discovered_contacts(
                job.owner_key,
                company,
                discovered_contacts,
            )
            self._set_step_completed(
                job,
                steps,
                step_key="contact_save",
                progress=100,
                current_step="Contacts ready",
                summary=self._contact_save_summary(saved_contacts),
                details=self._contact_save_details(discovered_contacts, saved_contacts, discovery),
                sources=discovery.sources[:6],
            )

            if self._has_required_contact_mix(saved_contacts):
                self.repo.update_generation_job(
                    job.id,
                    status="completed",
                    progress_percent=100,
                    current_step="Contacts ready",
                    steps=steps,
                    completed_at=self._now(),
                    error_message=None,
                )
                self.repo.create_notification(
                    job.owner_key,
                    title="Contact discovery completed",
                    message=(
                        f"{company.name} now has an official contact route and a person-level outreach contact ready for drafting."
                    ),
                    level="success",
                    company_id=job.company_id,
                    generation_job_id=job.id,
                )
                return

            error_message = self._contact_discovery_failure_message(saved_contacts, discovery)
            self.repo.update_generation_job(
                job.id,
                status="failed",
                progress_percent=100,
                current_step="Contact search incomplete",
                steps=steps,
                completed_at=self._now(),
                error_message=error_message,
            )
            self.repo.create_notification(
                job.owner_key,
                title="Contact discovery incomplete",
                message=f"{company.name}: {error_message}",
                level="warning",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
        except JobCancelledError as exc:
            cancelled_steps = self._mark_active_step_cancelled(steps, str(exc))
            self.repo.update_generation_job(
                job.id,
                status="cancelled",
                current_step="Cancelled",
                steps=cancelled_steps,
                error_message=str(exc),
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Contact discovery cancelled",
                message=f"{company.name} was removed from the queue before contact discovery finished.",
                level="warning",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
        except Exception as exc:
            failed_steps = self._mark_active_step_failed(steps, str(exc))
            self.repo.update_generation_job(
                job.id,
                status="failed",
                current_step="Contact search failed",
                steps=failed_steps,
                error_message=str(exc),
                completed_at=self._now(),
            )
            self.repo.create_notification(
                job.owner_key,
                title="Contact discovery failed",
                message=f"{company.name} could not be enriched automatically. Open the record to inspect the failure.",
                level="danger",
                company_id=job.company_id,
                generation_job_id=job.id,
            )
            raise

    def _set_step_running(
        self,
        job: GenerationJobRecord,
        steps: list[GenerationStepRecord],
        *,
        step_key: str,
        progress: int,
        current_step: str,
    ) -> None:
        self._ensure_not_cancelled(job)
        updated_steps: list[GenerationStepRecord] = []
        for step in steps:
            if step.key == step_key:
                updated_steps.append(
                    step.model_copy(
                        update={
                            "status": "running",
                            "started_at": datetime.now(timezone.utc),
                            "completed_at": None,
                            "summary": None,
                            "details": [],
                            "sources": [],
                        }
                    )
                )
            else:
                updated_steps.append(step)
        steps[:] = updated_steps
        self.repo.update_generation_job(
            job.id,
            status="running",
            progress_percent=progress,
            current_step=current_step,
            steps=steps,
        )

    def _set_step_completed(
        self,
        job: GenerationJobRecord,
        steps: list[GenerationStepRecord],
        *,
        step_key: str,
        progress: int,
        current_step: str,
        summary: str | None,
        details: list[str],
        sources: list[ResearchSource],
    ) -> None:
        self._ensure_not_cancelled(job)
        updated_steps: list[GenerationStepRecord] = []
        for step in steps:
            if step.key == step_key:
                updated_steps.append(
                    step.model_copy(
                        update={
                            "status": "completed",
                            "completed_at": datetime.now(timezone.utc),
                            "summary": summary,
                            "details": details,
                            "sources": sources[:6],
                        }
                    )
                )
            else:
                updated_steps.append(step)
        steps[:] = updated_steps
        self.repo.update_generation_job(
            job.id,
            status="running",
            progress_percent=progress,
            current_step=current_step,
            steps=steps,
        )

    def _mark_active_step_failed(
        self,
        steps: list[GenerationStepRecord],
        error_message: str,
    ) -> list[GenerationStepRecord]:
        repaired_steps: list[GenerationStepRecord] = []
        failed = False
        for step in steps:
            if step.status == "running" and not failed:
                repaired_steps.append(
                    step.model_copy(
                        update={
                            "status": "failed",
                            "completed_at": datetime.now(timezone.utc),
                            "summary": "This step stopped before it could finish.",
                            "details": [error_message],
                        }
                    )
                )
                failed = True
            else:
                repaired_steps.append(step)
        return repaired_steps

    def _mark_active_step_cancelled(
        self,
        steps: list[GenerationStepRecord],
        message: str,
    ) -> list[GenerationStepRecord]:
        repaired_steps: list[GenerationStepRecord] = []
        cancelled = False
        for step in steps:
            if step.status == "running" and not cancelled:
                repaired_steps.append(
                    step.model_copy(
                        update={
                            "status": "failed",
                            "completed_at": datetime.now(timezone.utc),
                            "summary": "This step was stopped before it could finish.",
                            "details": [message],
                        }
                    )
                )
                cancelled = True
            else:
                repaired_steps.append(step)
        return repaired_steps

    def _ensure_not_cancelled(self, job: GenerationJobRecord) -> None:
        latest_job = self.repo.get_generation_job(job.owner_key, job.id)
        if latest_job is None:
            raise JobCancelledError("Job no longer exists.")
        if latest_job.status.lower() not in {"cancelling", "cancelled"}:
            return
        raise JobCancelledError("Cancelled by user.")

    def _has_required_contact_mix(self, contacts: list[Any]) -> bool:
        return self._has_official_company_contact(contacts) and self._has_individual_contact(contacts)

    def _has_official_company_contact(self, contacts: list[Any]) -> bool:
        return any(contact.email and not self._is_individual_contact(contact) for contact in contacts)

    def _has_individual_contact(self, contacts: list[Any]) -> bool:
        return any(
            self._is_individual_contact(contact) and (contact.email or contact.linkedin_url)
            for contact in contacts
        )

    def _is_individual_contact(self, contact: Any) -> bool:
        if contact.full_name:
            lowered = contact.full_name.lower()
            if any(
                token in lowered
                for token in (
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
                )
            ):
                return False
            return True
        raw_contact = (contact.raw_contact or "").lower()
        return any(token in raw_contact for token in ("mr ", "mrs ", "ms ", "dr ", "prof "))

    def _contact_gap_summary(self, company_name: str, contacts: list[Any]) -> str:
        if not contacts:
            return f"No usable contacts are currently stored for {company_name}."

        coverage_bits: list[str] = []
        coverage_bits.append(
            "official inbox present" if self._has_official_company_contact(contacts) else "official inbox missing"
        )
        coverage_bits.append(
            "person contact present" if self._has_individual_contact(contacts) else "person contact missing"
        )
        return f"{len(contacts)} contact record(s) on file, {', '.join(coverage_bits)}."

    def _contact_gap_details(self, contacts: list[Any]) -> list[str]:
        details: list[str] = []
        official_contacts = [contact for contact in contacts if contact.email and not self._is_individual_contact(contact)]
        individual_contacts = [
            contact
            for contact in contacts
            if self._is_individual_contact(contact) and (contact.email or contact.linkedin_url)
        ]

        if official_contacts:
            details.append(
                "Official route already on file: "
                + ", ".join(
                    (contact.email or contact.raw_contact or "Official inbox")
                    for contact in official_contacts[:2]
                )
            )
        else:
            details.append("No official company email route is currently on file.")

        if individual_contacts:
            details.append(
                "Person contact already on file: "
                + ", ".join(
                    self._contact_label(contact) for contact in individual_contacts[:2]
                )
            )
        else:
            details.append("No person-level contact with a reachable route is currently on file.")

        return details

    def _official_contact_summary(self, discovery: ContactDiscoveryResult) -> str:
        official = discovery.official_company_contact
        if official is None:
            return "No verified official company inbox was found."
        if official.email:
            return f"Official route found: {official.email}."
        if official.reach_channel:
            return f"Official route found: {official.reach_channel}."
        return "An official company route was identified."

    def _official_contact_details(self, discovery: ContactDiscoveryResult) -> list[str]:
        official = discovery.official_company_contact
        if official is None:
            return ["No public official company email or route was returned by the search."]

        details: list[str] = []
        if official.email:
            details.append(f"Official email: {official.email}")
        if official.reach_channel:
            details.append(f"Reach channel: {official.reach_channel}")
        if official.rationale:
            details.append(f"Why this route: {official.rationale}")
        return details or ["An official contact route was identified."]

    def _official_contact_sources(
        self,
        discovery: ContactDiscoveryResult,
    ) -> list[ResearchSource]:
        official = discovery.official_company_contact
        if official and official.sources:
            return official.sources[:6]
        return discovery.sources[:6]

    def _decision_maker_summary(self, discovery: ContactDiscoveryResult) -> str:
        person = discovery.recommended_person_contact
        if person is None:
            return "No aligned individual decision maker was found."
        label = person.full_name or person.role_title or person.email or "A public decision maker"
        return f"Recommended person contact: {label}."

    def _decision_maker_details(self, discovery: ContactDiscoveryResult) -> list[str]:
        person = discovery.recommended_person_contact
        if person is None:
            return ["No public individual aligned to the campaign brief was returned by the search."]

        details: list[str] = []
        if person.role_title:
            details.append(f"Role: {person.role_title}")
        if person.email:
            details.append(f"Email: {person.email}")
        if person.linkedin_url:
            details.append(f"LinkedIn: {person.linkedin_url}")
        if person.rationale:
            details.append(f"Why this person: {person.rationale}")
        return details or ["A relevant person contact was identified."]

    def _decision_maker_sources(
        self,
        discovery: ContactDiscoveryResult,
    ) -> list[ResearchSource]:
        person = discovery.recommended_person_contact
        if person and person.sources:
            return person.sources[:6]
        return discovery.sources[:6]

    def _build_discovered_contacts(
        self,
        company: Any,
        discovery: ContactDiscoveryResult,
    ) -> list[CompanyContactImport]:
        contacts: list[CompanyContactImport] = []
        official = discovery.official_company_contact
        if official and (official.email or official.reach_channel or official.linkedin_url):
            contacts.append(
                CompanyContactImport(
                    external_key=self._discovered_contact_external_key(
                        company.name,
                        "official",
                        official.email or official.reach_channel or official.linkedin_url or "official",
                    ),
                    raw_contact=official.email or official.reach_channel or "Official company contact",
                    role_title=official.role_title,
                    email=official.email,
                    linkedin_url=official.linkedin_url,
                    reach_channel=official.reach_channel,
                    notes=official.rationale,
                    source_row=company.source_row,
                    metadata={
                        "discovery_origin": "background_contact_discovery",
                        "contact_kind": "official_company_contact",
                        "sources": [source.model_dump(mode="json") for source in official.sources],
                    },
                    is_primary=True,
                )
            )

        person = discovery.recommended_person_contact
        if person and (person.full_name or person.email or person.linkedin_url):
            contacts.append(
                CompanyContactImport(
                    external_key=self._discovered_contact_external_key(
                        company.name,
                        "person",
                        person.email or person.linkedin_url or person.full_name or "person",
                    ),
                    raw_contact=person.full_name or person.email or "Decision maker",
                    full_name=person.full_name,
                    role_title=person.role_title,
                    email=person.email,
                    linkedin_url=person.linkedin_url,
                    reach_channel=person.reach_channel,
                    notes=person.rationale,
                    source_row=company.source_row,
                    metadata={
                        "discovery_origin": "background_contact_discovery",
                        "contact_kind": "recommended_person_contact",
                        "sources": [source.model_dump(mode="json") for source in person.sources],
                    },
                    is_primary=False,
                )
            )
        return contacts

    def _discovered_contact_external_key(
        self,
        company_name: str,
        prefix: str,
        identity: str,
    ) -> str:
        normalized_company = company_name.strip().lower()
        normalized_identity = (
            identity.strip().lower().replace("https://", "").replace("http://", "")
        )
        normalized_identity = normalized_identity.replace("/", "|")
        return f"discovered|{normalized_company}|{prefix}|{normalized_identity}"

    def _contact_save_summary(self, contacts: list[Any]) -> str:
        return (
            f"{len(contacts)} contact record{'s' if len(contacts) != 1 else ''} are now stored for this company."
        )

    def _contact_save_details(
        self,
        discovered_contacts: list[CompanyContactImport],
        saved_contacts: list[Any],
        discovery: ContactDiscoveryResult,
    ) -> list[str]:
        details: list[str] = []
        if discovered_contacts:
            details.append(
                "Saved or refreshed: "
                + ", ".join(
                    contact.full_name or contact.email or contact.reach_channel or "contact"
                    for contact in discovered_contacts
                )
            )
        else:
            details.append("No new contacts were saved from this run.")
        details.extend(self._contact_gap_details(saved_contacts))
        details.extend(discovery.missing_information[:2])
        return details[:6]

    def _contact_discovery_failure_message(
        self,
        contacts: list[Any],
        discovery: ContactDiscoveryResult,
    ) -> str:
        missing: list[str] = []
        if not self._has_official_company_contact(contacts):
            missing.append("a public official company email route")
        if not self._has_individual_contact(contacts):
            missing.append("a relevant person contact")
        if discovery.missing_information:
            return f"Still missing {', '.join(missing)}. {discovery.missing_information[0]}"
        return f"Still missing {', '.join(missing)}."

    def _contact_label(self, contact: Any) -> str:
        label = contact.full_name or contact.raw_contact or contact.email or "Contact"
        if contact.role_title:
            return f"{label} ({contact.role_title})"
        return label

    def _company_research_summary(self, result: CompanyResearch) -> str:
        return (
            result.industry_positioning
            or result.mission
            or f"Public company research captured for {result.company_name}."
        )

    def _company_research_details(self, result: CompanyResearch) -> list[str]:
        details: list[str] = []
        if result.mission:
            details.append(f"Mission: {result.mission}")
        if result.values:
            details.append(f"Values/themes: {', '.join(result.values[:4])}")
        if result.products_or_services:
            details.append(
                f"Products/services: {', '.join(result.products_or_services[:4])}"
            )
        if result.recent_news:
            details.append(f"Recent news: {result.recent_news[0]}")
        if result.sponsorship_fit:
            details.append(
                f"Why it may fit: {', '.join(result.sponsorship_fit[:3])}"
            )
        return details

    def _leadership_summary(self, result: LeadershipResearch) -> str:
        return (
            result.overall_tone
            or ", ".join(result.messaging_themes[:3])
            or f"Leadership themes collected for {result.company_name}."
        )

    def _leadership_details(self, result: LeadershipResearch) -> list[str]:
        details: list[str] = []
        if result.decision_makers:
            names = [
                f"{leader.name}{f' ({leader.role})' if leader.role else ''}"
                for leader in result.decision_makers[:4]
            ]
            details.append(f"Possible decision makers: {', '.join(names)}")
        if result.messaging_themes:
            details.append(
                f"Public messaging themes: {', '.join(result.messaging_themes[:4])}"
            )
        quoted = [leader.quote for leader in result.decision_makers if leader.quote]
        if quoted:
            details.append(f"Useful public quote/theme: {quoted[0]}")
        return details

    def _context_details(self, result: UnifiedContext) -> list[str]:
        details = [f"Recommended ask: {result.recommended_ask}"]
        details.extend(result.alignment_points[:4])
        if result.personalization_angles:
            details.append(
                f"Personalization angles: {', '.join(result.personalization_angles[:3])}"
            )
        if result.risk_flags:
            details.append(f"Watch-outs: {', '.join(result.risk_flags[:3])}")
        return details

    def _bundle_generation_summary(self, contacts: list[Any]) -> str:
        return (
            f"Generated email and LinkedIn drafts for {len(contacts)} contact"
            f"{'' if len(contacts) == 1 else 's'}."
        )

    def _bundle_humanized_summary(self, contacts: list[Any]) -> str:
        return (
            f"Humanized all channel drafts for {len(contacts)} contact"
            f"{'' if len(contacts) == 1 else 's'}."
        )

    def _bundle_draft_details(
        self,
        contact: Any,
        bundle: GeneratedOutreachBundle,
    ) -> list[str]:
        label = contact.full_name or contact.raw_contact or contact.email or "Team contact"
        details = [f"{label}: email subject '{bundle.email.subject}'."]
        if bundle.email.personalization_highlights:
            details.append(
                f"{label}: email hooks {', '.join(bundle.email.personalization_highlights[:2])}."
            )
        linkedin_preview = bundle.linkedin_message.body_markdown.splitlines()[0].strip()
        if linkedin_preview:
            details.append(f"{label}: LinkedIn opener '{linkedin_preview[:120]}'")
        return details

    def _humanized_bundle_details(
        self,
        contact: Any,
        bundle: GeneratedOutreachBundle,
    ) -> list[str]:
        label = contact.full_name or contact.raw_contact or contact.email or "Team contact"
        details = [f"{label}: final email subject '{bundle.email.subject}'."]
        if bundle.email.preview_line:
            details.append(f"{label}: preview line '{bundle.email.preview_line}'.")
        if bundle.email.personalization_highlights:
            details.append(
                f"{label}: kept hooks {', '.join(bundle.email.personalization_highlights[:2])}."
            )
        return details

    def _reap_finished_tasks(self) -> None:
        self._active_tasks = {task for task in self._active_tasks if not task.done()}

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
