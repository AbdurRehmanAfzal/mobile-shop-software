from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_name: str = "Mobile Shop SaaS"
    app_env: str = "dev"  # dev | test | prod
    database_url: str = "sqlite:///./mobile_shop_v2.db"
    secret_key: str = "dev-secret-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # passkeys (fingerprint login on the website): the site's domain and its full origins
    webauthn_rp_id: str = "localhost"
    webauthn_origins: str = "http://localhost:5173,https://localhost:5174"
    upload_dir: str = "./uploads"
    default_locale: str = "ur"
    timezone: str = "Asia/Karachi"
    # Owner (2026-10-26): only the product owner creates shops. Public signup stays off in
    # production; the local dev/test setup turns it on so automated tests can make throwaway shops.
    public_signup: bool = False
    # comma-separated mobile numbers of super users (the product owner), e.g. "03001234567"
    superuser_phones: str = ""
    # WhatsApp Cloud API (Meta); empty = messages are sent by hand from the Messages screen
    # where an owner's "forgot password" request goes (else the first super user number)
    admin_whatsapp: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""
    whatsapp_api_version: str = "v21.0"
    whatsapp_templates: str = ""  # JSON: our template key -> approved Meta template
    # the in-process clock for the night report, reminders and sending queued messages
    scheduler_enabled: bool = True
    # OTP (owner 2026-10-30): codes go by WhatsApp when it is configured. OTP_DEV_ECHO returns the
    # code in the API response (dev / e2e only). SIGNUP_OTP makes public signup prove the number.
    otp_dev_echo: bool = False
    signup_otp: bool = False
    # Email (owner 2026-10-30): any SMTP account (Gmail app password, the hosting's mail). Empty host =
    # email messages stay queued and the app says so.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    # AI (owner 2026-10-30): one platform key; the chat on the main model, photo reading on the
    # cheap vision model; a per-shop daily call cap keeps the bill predictable.
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-5-5"
    ai_vision_model: str = "claude-haiku-5-5"
    ai_daily_limit: int = 200
    # one-PC install (owner 2026-10-30): the backend also serves the built web app from this folder
    web_dir: str = ""
    # the one-PC install: the shop made here is `chain` with no expiry (no server to pay for)
    local_mode: bool = False
    # offline renewal codes (docs/19 §E): the private key lives only on the SaaS server; every
    # install carries the public key. `python -m app.modules.plan.renewal keygen` makes a pair.
    renewal_private_key: str = ""
    renewal_public_key: str = "En5rRS7S_HhTvmEyAz1-5pS0AOsOJQIXiXmENyoa95o"

    @property
    def superusers(self) -> set[str]:
        from app.core.pk import normalise_phone

        return {normalise_phone(p) for p in self.superuser_phones.split(",") if p.strip()}

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
