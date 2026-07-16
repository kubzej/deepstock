from app.ai.providers import litellm_client
from app.core.config import Settings


def test_litellm_client_uses_canonical_settings_model_default(monkeypatch):
    monkeypatch.setattr(litellm_client, "get_settings", lambda: Settings())

    assert litellm_client._get_ai_model() == "anthropic/claude-opus-4-8"
    assert litellm_client._get_ai_max_tokens() == 20000


def test_litellm_client_resolves_anthropic_key_from_settings(monkeypatch):
    settings = Settings(
        ai_model="anthropic/claude-opus-4-8",
        anthropic_api_key="test-anthropic-key",
    )
    monkeypatch.setattr(litellm_client, "get_settings", lambda: settings)

    assert litellm_client._get_api_key(settings.ai_model) == "test-anthropic-key"
