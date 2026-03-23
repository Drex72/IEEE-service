from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_title: str = "IEEE Sponsorship Outreach API"
    api_version: str = "0.1.0"
    frontend_url: str = "http://localhost:3000"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    default_owner_key: str = "local-demo"

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    openai_api_key: str | None = None
    openai_research_model: str = "gpt-5-mini"
    openai_generation_model: str = "gpt-5-mini"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/gmail/callback"
    gmail_scopes: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/userinfo.email",
            "openid",
        ]
    )
    gmail_token_encryption_key: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: Any) -> list[str]:
        if value is None:
            return ["http://localhost:3000"]
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                return [item.strip() for item in parsed if item and item.strip()]
            return [item.strip() for item in value.split(",") if item.strip()]
        return list(value)

    @field_validator("gmail_scopes", mode="before")
    @classmethod
    def split_scopes(cls, value: Any) -> list[str]:
        if value is None:
            return [
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/userinfo.email",
                "openid",
            ]
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                return [item.strip() for item in parsed if item and item.strip()]
            return [item.strip() for item in value.split(",") if item.strip()]
        return list(value)

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_gmail_oauth(self) -> bool:
        return bool(
            self.google_client_id
            and self.google_client_secret
            and self.google_redirect_uri
            and self.gmail_token_encryption_key
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
