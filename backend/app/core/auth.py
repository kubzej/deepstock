"""
Authentication utilities for Supabase JWT tokens.
"""
from fastapi import HTTPException, Header
from typing import Optional
import jwt
import os


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
        # Supabase uses HS256 with JWT secret
        # For verification we need SUPABASE_JWT_SECRET
        jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
        
        if jwt_secret:
            # Verify token signature
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        else:
            # If no secret, just decode without verification (dev mode)
            payload = jwt.decode(token, options={"verify_signature": False})
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        return user_id
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
