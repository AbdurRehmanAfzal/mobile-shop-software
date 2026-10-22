from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./mobile_shop.db"
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_debug: bool = True
    
    # CORS
    allowed_origins: list = ["http://localhost:3000", "http://localhost:5173"]
    
    # Twilio
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None
    
    # Shop Settings
    shop_name: str = "Mobile Shop"
    shop_city: str = "Lahore"
    shop_phone: str = "+92XXXXXXXXX"
    shop_email: str = "shop@example.com"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
