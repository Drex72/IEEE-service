from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.models.schemas import (
    CompanyResearch,
    GeneratedEmail,
    GenerationJobRecord,
    GenerationStepRecord,
    LeadershipResearch,
    ResearchSource,
    UnifiedContext,
)
from app.services.openai_pipeline import OutreachPipeline
from app.services.supabase import SupabaseRepository


logger = logging.getLogger(__name__)


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
                progress=90,
                current_step="Writing email draft",
            )
            generated_email = self.pipeline.write_email(
                company,
                program_context,
                unified_context,
            )
            self._set_step_completed(
                job,
                steps,
                step_key="email_generation",
                progress=96,
                current_step="Saving completed draft",
                summary=generated_email.preview_line,
                details=self._email_details(generated_email),
                sources=[],
            )

            generated_context = {
                "program_context": program_context,
                "user_campaign_brief": job.campaign_context,
                "company_research": company_research.model_dump(mode="json"),
                "leadership_research": leadership_research.model_dump(mode="json"),
                "unified_context": unified_context.model_dump(mode="json"),
                "generation_job_id": job.id,
            }
            template = self.repo.save_generated_template(
                job.owner_key,
                job.company_id,
                generated_email,
                generated_context,
            )
            self.repo.update_generation_job(
                job.id,
                status="completed",
                progress_percent=100,
                current_step="Completed",
                steps=steps,
                template_id=template.id,
                completed_at=self._now(),
                error_message=None,
            )
            self.repo.create_notification(
                job.owner_key,
                title="Draft ready",
                message=f"{company.name} now has a completed sponsorship draft ready for review.",
                level="success",
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

    def _set_step_running(
        self,
        job: GenerationJobRecord,
        steps: list[GenerationStepRecord],
        *,
        step_key: str,
        progress: int,
        current_step: str,
    ) -> None:
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

    def _email_details(self, result: GeneratedEmail) -> list[str]:
        details = [f"Subject line: {result.subject}"]
        if result.personalization_highlights:
            details.append(
                f"Personalization highlights: {', '.join(result.personalization_highlights[:3])}"
            )
        return details

    def _reap_finished_tasks(self) -> None:
        self._active_tasks = {task for task in self._active_tasks if not task.done()}

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
