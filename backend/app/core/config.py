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
    upload_dir: str = "./uploads"
    default_locale: str = "ur"
    timezone: str = "Asia/Karachi"
    # Owner (2026-10-26): only the product owner creates shops. Public signup stays off in
    # production; the local dev/test setup turns it on so automated tests can make throwaway shops.
    public_signup: bool = False
    # comma-separated mobile numbers of super users (the product owner), e.g. "03001234567"
    superuser_phones: str = ""

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
