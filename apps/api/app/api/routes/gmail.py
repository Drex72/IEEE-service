from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.api.deps import (
    get_app_settings,
    get_configured_gmail_service,
    get_repository,
    get_owner_key,
)
from app.core.config import Settings
from app.models.schemas import GmailStatusResponse, SendEmailRequest, SendEmailResponse
from app.services.gmail import GmailOAuthService
from app.services.supabase import SupabaseRepository


router = APIRouter(tags=["gmail"])


@router.get("/gmail/status", response_model=GmailStatusResponse)
def gmail_status(
    owner_key: str = Depends(get_owner_key),
    settings: Settings = Depends(get_app_settings),
    repo: SupabaseRepository = Depends(get_repository),
) -> GmailStatusResponse:
    if not settings.has_supabase:
        return GmailStatusResponse(configured=settings.has_gmail_oauth, connected=False)
    return repo.gmail_status(owner_key, configured=settings.has_gmail_oauth)


@router.get("/gmail/auth-url")
def gmail_auth_url(
    return_to: str | None = Query(default=None),
    owner_key: str = Depends(get_owner_key),
    gmail_service: GmailOAuthService = Depends(get_configured_gmail_service),
):
    return {"url": gmail_service.authorization_url(owner_key=owner_key, return_to=return_to)}


@router.get("/gmail/callback")
async def gmail_callback(
    code: str,
    state: str,
    repo: SupabaseRepository = Depends(get_repository),
    gmail_service: GmailOAuthService = Depends(get_configured_gmail_service),
):
    if not repo.settings.has_supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is required to store Gmail credentials.",
        )
    result = await gmail_service.exchange_code(code=code, state=state)
    repo.save_gmail_account(
        owner_key=result["owner_key"],
        email=result["email"],
        encrypted_access_token=result["encrypted_access_token"],
        encrypted_refresh_token=result["encrypted_refresh_token"],
        token_expiry=result["token_expiry"],
        scope=result["scope"],
    )
    redirect_url = gmail_service.callback_redirect(
        result["return_to"],
        status="connected",
        email=result["email"],
    )
    return RedirectResponse(redirect_url)


@router.post("/gmail/send", response_model=SendEmailResponse)
def send_email(
    payload: SendEmailRequest,
    owner_key: str = Depends(get_owner_key),
    repo: SupabaseRepository = Depends(get_repository),
    gmail_service: GmailOAuthService = Depends(get_configured_gmail_service),
) -> SendEmailResponse:
    if not repo.settings.has_supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is required to send and log emails.",
        )
    account = repo.get_gmail_account(owner_key)
    template = repo.get_template_by_company(owner_key, payload.company_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connect Gmail before sending emails.",
        )

    try:
        message_id = gmail_service.send_email(account, payload)
        repo.log_email(
            owner_key,
            company_id=payload.company_id,
            template_id=template.id if template else None,
            recipient_email=payload.recipient_email,
            status="sent",
            gmail_message_id=message_id,
        )
        return SendEmailResponse(status="sent", message_id=message_id)
    except Exception as exc:  # pragma: no cover - integration failure surface
        repo.log_email(
            owner_key,
            company_id=payload.company_id,
            template_id=template.id if template else None,
            recipient_email=payload.recipient_email,
            status="failed",
            error_message=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gmail send failed: {exc}",
        ) from exc
