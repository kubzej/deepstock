from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # VAPID for Web Push
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claim_email: str = ""
    
    # Cron job authentication
    cron_secret: str = ""
    
    # App
    debug: bool = False
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
