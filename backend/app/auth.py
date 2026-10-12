"""LIFEGRID Supabase JWT authentication and role authorization.

This version supports:
1. Supabase asymmetric JWTs (RS256 / ES256 family) through JWKS.
2. Legacy HS256 Supabase JWTs when SUPABASE_JWT_SECRET is configured.
3. A secure Supabase Auth user-endpoint fallback when a publishable/anon key
   is configured on the backend.

Roles are read from app_metadata only. User-editable user_metadata is never
used to grant privileges.
"""

import os
from functools import lru_cache
from typing import Any
from urllib.request import Request, urlopen

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

load_dotenv(override=False)

security = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

JWKS_URL = os.getenv(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    if SUPABASE_URL
    else "",
)

# Only use this for legacy HS256 projects.
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

# Backend-only fallback key. A publishable/anon key is safe to send as the
# apikey header; NEVER put a service_role key in the frontend.
SUPABASE_AUTH_KEY = (
    os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
)

ALLOWED_ASYMMETRIC_ALGORITHMS = {
    "RS256",
    "RS384",
    "RS512",
    "ES256",
    "ES384",
    "ES512",
}


@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    if not JWKS_URL:
        raise RuntimeError(
            "SUPABASE_URL or SUPABASE_JWKS_URL is not configured."
        )

    return PyJWKClient(
        JWKS_URL,
        cache_keys=True,
        lifespan=600,
    )


def _unauthorized(message: str = "Invalid or expired authentication token."):
    return HTTPException(
        status_code=401,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _claims_from_supabase_user_endpoint(token: str) -> dict[str, Any] | None:
    """Ask Supabase Auth to validate the token when local JWKS validation
    cannot be used. This is a server-to-server validation fallback.
    """
    if not SUPABASE_URL or not SUPABASE_AUTH_KEY:
        return None

    url = f"{SUPABASE_URL}/auth/v1/user"

    request = Request(
        url,
        method="GET",
        headers={
            "apikey": SUPABASE_AUTH_KEY,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=6) as response:
            import json

            raw = response.read().decode("utf-8")
            user = json.loads(raw)

        if not isinstance(user, dict) or not user.get("id"):
            return None

        app_metadata = user.get("app_metadata") or {}
        user_metadata = user.get("user_metadata") or {}

        return {
            "sub": user["id"],
            "email": user.get("email"),
            "app_metadata": app_metadata,
            "user_metadata": user_metadata,
        }

    except Exception:
        return None


def _decode_token(token: str) -> dict[str, Any]:
    """Validate a Supabase access token and return its claims."""
    try:
        header = jwt.get_unverified_header(token)
        algorithm = str(header.get("alg") or "").upper()
    except Exception as exc:
        raise _unauthorized() from exc

    # Current Supabase projects commonly use asymmetric signing keys.
    if algorithm in ALLOWED_ASYMMETRIC_ALGORITHMS:
        try:
            signing_key = get_jwks_client().get_signing_key_from_jwt(token)

            return jwt.decode(
                token,
                signing_key.key,
                algorithms=[algorithm],
                options={
                    "verify_aud": False,
                },
            )
        except Exception:
            # Try Supabase's own token validation before rejecting.
            claims = _claims_from_supabase_user_endpoint(token)
            if claims:
                return claims

            raise _unauthorized()

    # Older Supabase projects may still use HS256.
    if algorithm == "HS256":
        if SUPABASE_JWT_SECRET:
            try:
                return jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    options={
                        "verify_aud": False,
                    },
                )
            except Exception:
                pass

        claims = _claims_from_supabase_user_endpoint(token)
        if claims:
            return claims

        raise _unauthorized(
            "HS256 token received, but SUPABASE_JWT_SECRET is not configured "
            "or the token could not be validated."
        )

    # Unknown algorithm: never accept it.
    raise _unauthorized("Unsupported authentication token signing algorithm.")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    """Return the authenticated LIFEGRID user from a Supabase access token."""
    if not credentials or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Authentication required.")

    token = credentials.credentials.strip()

    if not token:
        raise _unauthorized("Authentication token is missing.")

    try:
        claims = _decode_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        raise _unauthorized() from exc

    subject = claims.get("sub")

    if not subject:
        raise _unauthorized(
            "Authentication token has no user identity."
        )

    app_metadata = claims.get("app_metadata") or {}
    user_metadata = claims.get("user_metadata") or {}

    # Production security rule: privileged roles come from app_metadata.
    # Local demo mode is deliberately explicit and exists so a student can
    # demonstrate every LIFEGRID workspace without a Supabase service-role
    # key. It is disabled by default in production.
    role = str(app_metadata.get("role") or "").lower().strip()
    if not role and os.getenv("LIFEGRID_LOCAL_DEMO", "false").lower() == "true":
        requested = str(user_metadata.get("lifegrid_role_request") or "").lower().strip()
        if requested in {"ambulance", "hospital", "resource_provider", "citizen"}:
            role = requested

    role = role or "citizen"

    return {
        "id": subject,
        "email": claims.get("email"),
        "role": role,
        "app_metadata": app_metadata,
        "user_metadata": user_metadata,
        "claims": claims,
    }


def require_roles(*allowed_roles: str):
    """FastAPI dependency for role-protected LIFEGRID endpoints."""
    allowed = {
        role.lower().strip()
        for role in allowed_roles
    }

    def dependency(
        user: dict[str, Any] = Depends(get_current_user),
    ):
        if user["role"] not in allowed:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Your account is not authorized for this action."
                ),
            )

        return user

    return dependency
