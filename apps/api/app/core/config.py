from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Environment = Field(default="development")
    log_level: str = Field(default="INFO")

    # Database — plain `postgresql://` is accepted and auto-upgraded to
    # `postgresql+asyncpg://` for the async engine.
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/autotradeil"
    )

    # Supabase — uses the newer publishable / secret key names.
    supabase_url: str = Field(default="")
    supabase_publishable_key: str = Field(default="")
    supabase_secret_key: str = Field(default="")
    # JWT secret from Supabase Project Settings → API → JWT Settings.
    # Used to verify access tokens on the backend.
    supabase_jwt_secret: str = Field(default="")
    # Expected `aud` claim on Supabase JWTs.
    supabase_jwt_audience: str = Field(default="authenticated")

    # CORS — strict allowlist (JSON list or comma-separated string).
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Resend — transactional email
    resend_api_key: str = Field(default="")
    resend_from_email: str = Field(default="onboarding@resend.dev")

    # Impersonation — HS256 secret for short-lived admin-as-dealer tokens.
    # Generate with:  python3 -c 'import secrets; print(secrets.token_hex(32))'
    impersonation_secret: str = Field(default="")

    # Cloudinary — image uploads (server-side signing; cloud name also
    # exposed to the browser as NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).
    cloudinary_cloud_name: str = Field(default="")
    cloudinary_api_key: str = Field(default="")
    cloudinary_api_secret: str = Field(default="")

    # Anthropic — vision model for AI image-based vehicle identification.
    anthropic_api_key: str = Field(default="")

    # Twilio — SMS OTP delivery (Phase 3.5)
    twilio_account_sid: str = Field(default="")
    twilio_auth_token: str = Field(default="")
    twilio_phone_number: str = Field(default="")

    # Gmail SMTP — fallback email sender for dev environments where
    # the Resend domain isn't verified yet (Phase 4.4 addendum).
    gmail_app_password: str = Field(default="")
    gmail_from: str = Field(default="")

    @field_validator("database_url", mode="after")
    @classmethod
    def _ensure_asyncpg_driver(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> object:
        if isinstance(v, str):
            s = v.strip()
            # Accept JSON list string
            if s.startswith("["):
                import json

                try:
                    parsed = json.loads(s)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed]
                except json.JSONDecodeError:
                    pass
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
