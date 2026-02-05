"""
Authentication utilities for Supabase JWT tokens.
"""
from fastapi import HTTPException, Header
from typing import Optional
import jwt
from jwt import PyJWKClient
import os

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
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
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
            except Exception:
                # Fallback to HS256 with JWT secret
                jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
                if jwt_secret:
                    payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
                else:
                    payload = jwt.decode(token, options={"verify_signature": False})
        else:
            # No JWKS client, try HS256 with secret
            jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
            if jwt_secret:
                payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
            else:
                # Dev mode - no verification
                payload = jwt.decode(token, options={"verify_signature": False})
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        return user_id
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
