"""
LiteLLM wrapper — provider-agnostic LLM calls.

Configure via environment variables:
  AI_MODEL=anthropic/claude-sonnet-4-6   (default)
  AI_MAX_TOKENS=8000                     (default)

Supported providers (examples):
  anthropic/claude-sonnet-4-6
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

logger = logging.getLogger(__name__)

AI_MODEL = os.getenv("AI_MODEL", "anthropic/claude-sonnet-4-6")
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "8000"))

# Silence litellm verbose logging
litellm.set_verbose = False


def _get_api_key() -> str | None:
    """Resolve API key based on the configured provider."""
    if "anthropic" in AI_MODEL or AI_MODEL.startswith("claude"):
        return os.getenv("ANTHROPIC_API_KEY")
    if "openai" in AI_MODEL or AI_MODEL.startswith("gpt"):
        return os.getenv("OPENAI_API_KEY")
    if "gemini" in AI_MODEL:
        return os.getenv("GEMINI_API_KEY")
    if "perplexity" in AI_MODEL:
        return os.getenv("PERPLEXITY_API_KEY")
    return None


async def call_llm(system_prompt: str, user_prompt: str, request_timeout: int = 300) -> tuple[str, str]:
    """
    Call the configured LLM model with system + user prompt.
    Returns (content, model_used).
    Raises ValueError on API/auth/credit errors.
    """
    api_key = _get_api_key()
    if not api_key:
        raise ValueError(f"API key not found for model '{AI_MODEL}'. Zkontroluj env vars.")

    logger.info(f"Calling LLM model: {AI_MODEL} (timeout={request_timeout}s)")

    try:
        response = await litellm.acompletion(
            model=AI_MODEL,
            api_key=api_key,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=AI_MAX_TOKENS,
            temperature=0.3,
            request_timeout=request_timeout,
        )
    except litellm.AuthenticationError:
        raise ValueError("Neplatný API klíč pro AI model. Zkontroluj ANTHROPIC_API_KEY v nastavení.")
    except litellm.RateLimitError:
        raise ValueError("Překročen rate limit AI modelu. Zkus to za chvíli znovu.")
    except litellm.InsufficientCreditsError:
        raise ValueError("Došly kredity na AI API (Anthropic). Dobij kredit na console.anthropic.com.")
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
    model_used = response.model or AI_MODEL
    logger.info(f"LLM response received ({len(content)} chars) from {model_used}")
    return content, model_used
