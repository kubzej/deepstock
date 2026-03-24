"""
Authentication utilities for Supabase JWT tokens.
"""
from fastapi import HTTPException, Header
from typing import Optional
import logging
import jwt
from jwt import PyJWKClient
import os

logger = logging.getLogger(__name__)

# Cache JWKS client to avoid repeated fetches
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> Optional[PyJWKClient]:
    """Get or create cached JWKS client."""
    global _jwks_client
    if _jwks_client is None:
        supabase_url = os.getenv("SUPABASE_URL")
        if supabase_url:
            jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
            _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """
    Extract user ID from Supabase JWT token.
    Token is passed in Authorization header as 'Bearer <token>'.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Chybí autorizační hlavička")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Neplatný formát autorizace")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        # Try JWKS-based verification first (supports ES256)
        jwks_client = _get_jwks_client()
        
        if jwks_client:
            try:
                # Get signing key from JWKS endpoint
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256", "RS256", "HS256"],
                    audience="authenticated"
                )
            except Exception as jwks_err:
                # JWKS failed — fallback to HS256 with JWT secret
                logger.warning("JWKS verification failed, trying HS256: %s", jwks_err)
                jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
                if not jwt_secret:
                    logger.error("JWKS failed and SUPABASE_JWT_SECRET not set — cannot verify token")
                    raise HTTPException(status_code=503, detail="Autentizace dočasně nedostupná")
                payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        else:
            # No JWKS client — use HS256 with secret
            jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
            if not jwt_secret:
                logger.error("Neither SUPABASE_URL nor SUPABASE_JWT_SECRET configured")
                raise HTTPException(status_code=503, detail="Autentizace není nakonfigurována")
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Neplatný token: chybí ID uživatele")

        return user_id

    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token vypršel")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Neplatný token")
