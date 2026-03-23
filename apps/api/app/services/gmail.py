from __future__ import annotations

import base64
import json
from email.message import EmailMessage
from typing import Any
from urllib.parse import quote_plus

import httpx
from cryptography.fernet import Fernet
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow

from app.core.config import Settings
from app.models.schemas import SendEmailRequest


class TokenCipher:
    def __init__(self, encryption_key: str) -> None:
        self.fernet = Fernet(encryption_key)

    def encrypt(self, value: str) -> str:
        return self.fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        return self.fernet.decrypt(value.encode("utf-8")).decode("utf-8")

    def encode_state(self, payload: dict[str, Any]) -> str:
        return self.encrypt(json.dumps(payload))

    def decode_state(self, value: str) -> dict[str, Any]:
        return json.loads(self.decrypt(value))


class GmailOAuthService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not settings.has_gmail_oauth:
            raise RuntimeError(
                "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                "GOOGLE_REDIRECT_URI, and GMAIL_TOKEN_ENCRYPTION_KEY."
            )
        self.cipher = TokenCipher(settings.gmail_token_encryption_key)

    def authorization_url(self, owner_key: str, return_to: str | None = None) -> str:
        flow = self._build_flow()
        state = self.cipher.encode_state(
            {
                "owner_key": owner_key,
                "return_to": return_to or f"{self.settings.frontend_url}/settings/gmail",
            }
        )
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            include_granted_scopes="true",
            state=state,
        )
        return auth_url

    async def exchange_code(self, code: str, state: str) -> dict[str, Any]:
        flow = self._build_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials
        owner_state = self.cipher.decode_state(state)

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {credentials.token}"},
            )
            response.raise_for_status()
            profile = response.json()

        return {
            "owner_key": owner_state["owner_key"],
            "return_to": owner_state["return_to"],
            "email": profile.get("email"),
            "encrypted_access_token": self.cipher.encrypt(credentials.token),
            "encrypted_refresh_token": self.cipher.encrypt(credentials.refresh_token)
            if credentials.refresh_token
            else None,
            "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "scope": " ".join(credentials.scopes or self.settings.gmail_scopes),
        }

    def send_email(self, account: dict[str, Any], payload: SendEmailRequest) -> str:
        creds = Credentials(
            token=self.cipher.decrypt(account["encrypted_access_token"]),
            refresh_token=self.cipher.decrypt(account["encrypted_refresh_token"])
            if account.get("encrypted_refresh_token")
            else None,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.settings.google_client_id,
            client_secret=self.settings.google_client_secret,
            scopes=self.settings.gmail_scopes,
        )
        if not creds.valid and creds.refresh_token:
            creds.refresh(Request())

        message = EmailMessage()
        message["To"] = payload.recipient_email
        message["From"] = account["email"]
        message["Subject"] = payload.subject
        plain_text = payload.body_markdown
        message.set_content(plain_text)
        if payload.body_html:
            message.add_alternative(payload.body_html, subtype="html")

        for attachment in payload.attachments:
            binary = base64.b64decode(attachment.content_base64)
            main_type, _, sub_type = attachment.content_type.partition("/")
            message.add_attachment(
                binary,
                maintype=main_type or "application",
                subtype=sub_type or "octet-stream",
                filename=attachment.filename,
            )

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service = build("gmail", "v1", credentials=creds)
        response = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": encoded_message})
            .execute()
        )
        return response["id"]

    def callback_redirect(self, base_url: str, *, status: str, email: str | None = None) -> str:
        params = [f"status={quote_plus(status)}"]
        if email:
            params.append(f"email={quote_plus(email)}")
        return f"{base_url}?{'&'.join(params)}"

    def _build_flow(self) -> Flow:
        return Flow.from_client_config(
            {
                "web": {
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.settings.google_redirect_uri],
                }
            },
            scopes=self.settings.gmail_scopes,
            redirect_uri=self.settings.google_redirect_uri,
        )

