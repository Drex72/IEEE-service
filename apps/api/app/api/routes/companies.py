from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_configured_repository, get_owner_key
from app.models.schemas import (
    BulkGenerationRequest,
    BulkGenerationResponse,
    CampaignContextRecord,
    CampaignContextUpdateRequest,
    CompanyListResponse,
    CompanyRecord,
    CompanyUpdateRequest,
    DashboardSummary,
    GenerationJobRecord,
    NotificationListResponse,
    TemplateGenerationRequest,
    UploadResponse,
)
from app.services.excel import ExcelSponsorTrackerParser
from app.services.supabase import SupabaseRepository


router = APIRouter(tags=["companies"])
parser = ExcelSponsorTrackerParser()


@router.get("/companies", response_model=CompanyListResponse)
def list_companies(
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> CompanyListResponse:
    return CompanyListResponse(companies=repo.list_companies(owner_key))


@router.get("/companies/{company_id}", response_model=CompanyRecord)
def get_company(
    company_id: str,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> CompanyRecord:
    company = repo.get_company(owner_key, company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    return company


@router.get("/dashboard")
def dashboard(
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> DashboardSummary:
    return repo.dashboard_summary(owner_key)


@router.get("/campaign-context", response_model=CampaignContextRecord)
def get_campaign_context(
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> CampaignContextRecord:
    return repo.get_campaign_context(owner_key)


@router.put("/campaign-context", response_model=CampaignContextRecord)
def save_campaign_context(
    payload: CampaignContextUpdateRequest,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> CampaignContextRecord:
    return repo.save_campaign_context(owner_key, payload.brief)


@router.patch("/companies/{company_id}", response_model=CompanyRecord)
def update_company(
    company_id: str,
    payload: CompanyUpdateRequest,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> CompanyRecord:
    company = repo.update_company(owner_key, company_id, payload)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    return company


@router.get("/generation-jobs/{company_id}", response_model=GenerationJobRecord)
def get_latest_generation_job(
    company_id: str,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> GenerationJobRecord:
    job = repo.get_latest_generation_job(owner_key, company_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No generation job found.")
    return job


@router.get("/notifications", response_model=NotificationListResponse)
def list_notifications(
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> NotificationListResponse:
    return NotificationListResponse(notifications=repo.list_notifications(owner_key))


@router.post("/notifications/read-all", response_model=NotificationListResponse)
def mark_all_notifications_read(
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> NotificationListResponse:
    repo.mark_all_notifications_read(owner_key)
    return NotificationListResponse(notifications=repo.list_notifications(owner_key))


@router.post("/upload-companies", response_model=UploadResponse)
async def upload_companies(
    file: UploadFile = File(...),
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> UploadResponse:
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are supported.",
        )
    parsed_rows, tracker_summary = parser.parse(await file.read())
    saved = repo.upsert_companies(owner_key, parsed_rows)
    return UploadResponse(imported=len(saved), companies=saved, tracker_summary=tracker_summary)


@router.post("/generate/{company_id}", response_model=GenerationJobRecord)
def generate_template(
    company_id: str,
    payload: TemplateGenerationRequest | None = Body(default=None),
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
):
    company = repo.get_company(owner_key, company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    effective_context = repo.resolve_campaign_context(
        owner_key,
        company,
        payload.campaign_context if payload else None,
    )
    return repo.enqueue_generation_job(
        owner_key,
        company_id=company_id,
        trigger="generate",
        campaign_context=effective_context,
    )


@router.post("/regenerate/{company_id}", response_model=GenerationJobRecord)
def regenerate_template(
    company_id: str,
    payload: TemplateGenerationRequest | None = Body(default=None),
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
):
    company = repo.get_company(owner_key, company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    effective_context = repo.resolve_campaign_context(
        owner_key,
        company,
        payload.campaign_context if payload else None,
    )
    return repo.enqueue_generation_job(
        owner_key,
        company_id=company_id,
        trigger="regenerate",
        campaign_context=effective_context,
    )


@router.post("/generate-all", response_model=BulkGenerationResponse)
def generate_all_templates(
    payload: BulkGenerationRequest | None = Body(default=None),
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> BulkGenerationResponse:
    requested_ids = payload.company_ids if payload else []
    companies = (
        repo.list_companies_by_ids(owner_key, requested_ids)
        if requested_ids
        else repo.list_companies(owner_key)
    )

    jobs: list[GenerationJobRecord] = []
    skipped_companies = 0
    regenerate_existing = payload.regenerate_existing if payload else False
    campaign_context = payload.campaign_context if payload else None
    company_ids = [company.id for company in companies]
    active_jobs = repo.get_active_generation_jobs_map(owner_key, company_ids)
    shared_global_context = None
    if not campaign_context:
        shared_global_context = repo.get_campaign_context(owner_key).brief

    queued_payloads: list[dict[str, str | None]] = []

    for company in companies:
        if company.has_template and not regenerate_existing:
            skipped_companies += 1
            continue
        if company.id in active_jobs:
            skipped_companies += 1
            continue

        effective_context = (
            campaign_context
            or company.campaign_context_override
            or shared_global_context
        )
        queued_payloads.append(
            {
                "company_id": company.id,
                "trigger": "bulk-regenerate" if regenerate_existing else "bulk-generate",
                "campaign_context": effective_context,
            }
        )

    jobs = repo.enqueue_generation_jobs(owner_key, queued_payloads)

    return BulkGenerationResponse(
        queued_jobs=len(jobs),
        skipped_companies=skipped_companies,
        jobs=jobs,
    )
