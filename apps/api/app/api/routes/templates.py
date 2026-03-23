from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_configured_repository, get_owner_key
from app.models.schemas import EmailTemplateRecord, TemplateUpdateRequest
from app.services.supabase import SupabaseRepository


router = APIRouter(tags=["templates"])


@router.get("/template/{company_id}", response_model=EmailTemplateRecord)
def get_template(
    company_id: str,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> EmailTemplateRecord:
    template = repo.get_template_by_company(owner_key, company_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    return template


@router.patch("/template/{company_id}", response_model=EmailTemplateRecord)
def update_template(
    company_id: str,
    update: TemplateUpdateRequest,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_configured_repository),
) -> EmailTemplateRecord:
    template = repo.update_template(owner_key, company_id, update)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    return template

