from supabase import create_client, Client
from app.core.config import get_settings

settings = get_settings()

supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key  # Service role for backend operations
)
