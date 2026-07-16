from __future__ import annotations

"""
LiteLLM wrapper — provider-agnostic LLM calls.

Configure via environment variables:
  AI_MODEL=anthropic/claude-opus-4-8     (default)
  AI_MAX_TOKENS=20000                    (default)

Supported providers (examples):
  anthropic/claude-opus-4-8
  openai/gpt-4o
  gemini/gemini-1.5-pro
  perplexity/sonar-pro

Each provider needs its own API key env var:
  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.
"""
import asyncio
import os
import logging
import litellm

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Silence litellm verbose logging
litellm.set_verbose = False


def _get_ai_model() -> str:
    """Return the canonical configured AI model."""
    return get_settings().ai_model


def _get_ai_max_tokens() -> int:
    """Return the canonical configured LLM max token limit."""
    return get_settings().ai_max_tokens


def _get_api_key(ai_model: str) -> str | None:
    """Resolve API key based on the configured provider."""
    settings = get_settings()
    if "anthropic" in ai_model or ai_model.startswith("claude"):
        return settings.anthropic_api_key
    if "openai" in ai_model or ai_model.startswith("gpt"):
        return os.getenv("OPENAI_API_KEY")
    if "gemini" in ai_model:
        return os.getenv("GEMINI_API_KEY")
    if "perplexity" in ai_model:
        return os.getenv("PERPLEXITY_API_KEY")
    return None


async def call_llm(system_prompt: str, user_prompt: str, request_timeout: int = 300) -> tuple[str, str]:
    """
    Call the configured LLM model with system + user prompt.
    Returns (content, model_used).
    Raises ValueError on API/auth/credit errors.
    """
    ai_model = _get_ai_model()
    api_key = _get_api_key(ai_model)
    if not api_key:
        raise ValueError(f"API key not found for model '{ai_model}'. Zkontroluj env vars.")

    logger.info(f"Calling LLM model: {ai_model} (timeout={request_timeout}s)")

    completion_kwargs = dict(
        model=ai_model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=_get_ai_max_tokens(),
        request_timeout=request_timeout,
    )
    # Some newer models reject an explicit temperature ("temperature is deprecated
    # for this model"). Only send it when explicitly opted in via env.
    _temp = os.getenv("AI_TEMPERATURE")
    if _temp is not None:
        completion_kwargs["temperature"] = float(_temp)

    try:
        response = await litellm.acompletion(**completion_kwargs)
    except litellm.AuthenticationError:
        raise ValueError("Neplatný API klíč pro AI model. Zkontroluj ANTHROPIC_API_KEY v nastavení.")
    except litellm.RateLimitError:
        raise ValueError("Překročen rate limit AI modelu. Zkus to za chvíli znovu.")
    except litellm.Timeout:
        raise ValueError("AI model nereagoval včas (timeout). Zkus to znovu.")
    except (TimeoutError, asyncio.TimeoutError):
        raise ValueError("AI model nereagoval včas (timeout). Zkus to znovu.")
    except litellm.APIError as e:
        # Catch credit/billing errors that come as generic APIError
        msg = str(e).lower()
        if "credit" in msg or "billing" in msg or "quota" in msg or "insufficient" in msg:
            raise ValueError("Došly kredity na AI API. Dobij kredit na console.anthropic.com.")
        raise ValueError(f"Chyba AI API: {e}")
    except Exception as e:
        logger.error(f"Unexpected LLM error: {type(e).__name__}: {e}")
        raise ValueError(f"Neočekávaná chyba AI modelu ({type(e).__name__}). Zkus to znovu.")

    content = response.choices[0].message.content
    model_used = response.model or ai_model
    logger.info(f"LLM response received ({len(content)} chars) from {model_used}")
    return content, model_used
