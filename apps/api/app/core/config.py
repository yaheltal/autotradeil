from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

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

    # CORS — strict allowlist. Annotated[..., NoDecode] tells
    # pydantic-settings 2.x NOT to try its built-in JSON decoder on this
    # env value — that decoder runs BEFORE field_validator(mode='before')
    # and rejects the bracket-but-no-quotes string that bash leaves after
    # `source .env` (CORS_ORIGINS=["a","b"] → [a,b] in os.environ).
    # With NoDecode the raw string flows through to _parse_cors which
    # accepts any of: JSON list, comma-separated, or bracket-stripped.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # Resend — transactional email (PRIMARY sender). Production uses
    # the verified autotradeil.com domain; the default below is a
    # safe placeholder for fresh dev environments. Render env var
    # RESEND_FROM_EMAIL overrides at runtime.
    resend_api_key: str = Field(default="")
    resend_from_email: str = Field(
        default='"AutoTradeIL" <info@autotradeil.com>'
    )
    # Reply-To for every outgoing message — keeps customer replies
    # routed to the support inbox even though the FROM is info@.
    reply_to_email: str = Field(default="support@autotradeil.com")

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

    # Google OAuth — these are configured in Supabase Dashboard
    # (Authentication → Providers → Google) NOT used directly by the
    # backend, but tracked here so the env-var inventory in render.yaml
    # stays in sync. Supabase handles the OAuth handshake; the backend
    # only verifies the resulting JWT and looks up the user.
    supabase_google_client_id: str = Field(default="")
    supabase_google_client_secret: str = Field(default="")

    # Gmail SMTP — FALLBACK only. Resend is the primary sender; Gmail
    # kicks in only when Resend errors or the API key is unset.
    # Production points GMAIL_FROM at the same info@autotradeil.com
    # address so customers see one consistent sender across both
    # delivery paths.
    gmail_app_password: str = Field(default="")
    gmail_from: str = Field(default="info@autotradeil.com")

    # Sentry — error + performance monitoring. Empty DSN disables the
    # SDK entirely (init becomes a no-op). Sample rates are conservative
    # for free-tier; bump traces_sample_rate up if you're investigating
    # a specific perf regression.
    sentry_dsn: str = Field(default="")
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0.0, le=1.0)

    # Web Push — VAPID keypair for the Push API. Empty values mean
    # the /api/v1/notifications/push/vapid-key endpoint returns ""
    # and the frontend hides the toggle. Generate via:
    #   npx web-push generate-vapid-keys
    # Then expose the public key to the frontend via the endpoint
    # and keep the private key on the server only.
    vapid_public_key: str = Field(default="")
    vapid_private_key: str = Field(default="")
    vapid_subject: str = Field(default="mailto:support@autotradeil.com")

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
            # Accept JSON list string when the quotes survived (file
            # sources hit this; shell sources usually don't).
            if s.startswith("["):
                import json

                try:
                    parsed = json.loads(s)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed]
                except json.JSONDecodeError:
                    # Bash-source case: brackets present but quotes
                    # stripped → strip the brackets and fall through to
                    # the comma-split branch below.
                    s = s.lstrip("[").rstrip("]")
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
