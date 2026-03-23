from __future__ import annotations

from functools import lru_cache

from fastapi import HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.services.gmail import GmailOAuthService
from app.services.openai_pipeline import OutreachPipeline
from app.services.supabase import SupabaseRepository


def get_owner_key(request: Request) -> str:
    settings = get_settings()
    return request.headers.get("x-owner-key") or settings.default_owner_key


@lru_cache
def get_repository() -> SupabaseRepository:
    settings = get_settings()
    return SupabaseRepository(settings)


@lru_cache
def get_outreach_pipeline() -> OutreachPipeline:
    settings = get_settings()
    return OutreachPipeline(settings)


@lru_cache
def get_gmail_service() -> GmailOAuthService:
    settings = get_settings()
    return GmailOAuthService(settings)


def get_configured_repository() -> SupabaseRepository:
    repo = get_repository()
    if not repo.settings.has_supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is not configured.",
        )
    return repo


def get_configured_pipeline() -> OutreachPipeline:
    try:
        return get_outreach_pipeline()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def get_configured_gmail_service() -> GmailOAuthService:
    try:
        return get_gmail_service()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def get_app_settings() -> Settings:
    return get_settings()

