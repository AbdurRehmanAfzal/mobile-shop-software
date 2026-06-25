"""Configuration settings for the Mobile Shop Management System."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""

    # App settings
    app_name: str = "Mobile Shop Management System"
    debug: bool = True
    api_prefix: str = "/api"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_debug: bool = True

    # Database settings
    database_url: str = "sqlite:///./mobile_shop.db"

    # CORS settings
    allowed_origins: list = ["http://localhost:3000", "http://localhost:5173"]

    # WhatsApp/SMS settings (Twilio)
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None
    twilio_sms_number: Optional[str] = None

    # Shop settings
    shop_name: str = "Mobile Shop"
    shop_city: str = "Faisalabad"
    shop_phone: str = ""
    shop_email: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "allow"


settings = Settings()
