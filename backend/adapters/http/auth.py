"""The app's own fail-closed gate (REF-MCP.md section 7, REF-Foundry.md
section 4, INT-PLANS-043, ADR-008).

The engine authenticates no user of its own (BND-003). People reach the
human surfaces through the identity realm's oauth2-proxy sidecar, and the
app serves them only under `PLANS_AUTH_SCOPE=mcp`, the shape the chart runs
beside that sidecar; under any other value they answer 503. The machine
door, `/mcp`, is gated here with the app's own key - never a session, never
a user directory.
"""

from __future__ import annotations

import base64
import secrets

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import RequestResponseEndpoint

from backend.config import Settings

__all__ = ["install_auth"]

_EXEMPT_PATHS = frozenset({"/api/health"})
_MCP_PREFIX = "/mcp"


def _is_mcp_door(path: str) -> bool:
    return path == _MCP_PREFIX or path.startswith(_MCP_PREFIX + "/")


def install_auth(app: FastAPI, settings: Settings) -> None:
    configured = bool(settings.mcp_user and settings.mcp_password)
    fronted = settings.auth_scope == "mcp"

    @app.middleware("http")
    async def _gate(request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path in _EXEMPT_PATHS:
            return await call_next(request)
        if not _is_mcp_door(path):
            if fronted:
                return await call_next(request)
            # No sidecar is declared in front, so the human surfaces refuse;
            # a misspelt value never serves them open.
            return JSONResponse(
                status_code=503,
                content={"detail": "served only behind the identity realm's sign-in"},
            )
        if not configured:
            # Fail closed (REF-Foundry.md section 4): every protected route
            # answers 503 until the key exists, never silently open.
            return JSONResponse(status_code=503, content={"detail": "authentication is not configured"})
        if _is_authorized(request, settings.mcp_user, settings.mcp_password):
            return await call_next(request)
        return Response(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="vf-plans"'},
        )


def _is_authorized(request: Request, user: str, password: str) -> bool:
    scheme, _, encoded = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "basic" or not encoded:
        return False
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    got_user, separator, got_password = decoded.partition(":")
    if not separator:
        return False
    return secrets.compare_digest(got_user, user) and secrets.compare_digest(got_password, password)
