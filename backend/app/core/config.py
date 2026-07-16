from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # VAPID for Web Push
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claim_email: str = ""
    
    # AI Research
    anthropic_api_key: str = ""
    tavily_api_key: str = ""
    ai_model: str = "anthropic/claude-opus-4-8"
    ai_max_tokens: int = 20000

    # Daily news briefing providers
    marketaux_api_key: str = ""
    marketaux_symbols_per_request: int = 1
    marketaux_articles_per_request: int = 3
    marketaux_request_delay_seconds: float = 2.0
    marketaux_max_retries: int = 4
    marketaux_retry_backoff_seconds: float = 30.0
    sec_user_agent: str = "DeepStock daily briefing contact@example.com"

    # Twitter scraping
    twitter_auth_token: str = ""
    twitter_ct0: str = ""
    proxy_url: str = ""  # optional, empty = no proxy

    # App
    debug: bool = False

    @field_validator("debug", mode="before")
    @classmethod
    def normalize_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, (int, float)):
            return bool(value)

        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "dev", "development", "local"}:
            return True
        if normalized in {"0", "false", "no", "off", "release", "prod", "production", "staging"}:
            return False
        return value
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
