"""Safe defaults for tests that import the Supabase-backed service modules."""

import os


os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "ci-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "ci-service-role-key")
os.environ.setdefault("DEBUG", "false")
