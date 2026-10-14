"""FastAPI application factory: the UI's static bundle, the REST door, and
the MCP door, one deployable (REF-MCP.md section 2).
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from mcp.server.fastmcp import FastMCP

from backend import __version__
from backend.adapters.http.auth import install_auth
from backend.adapters.http.routes import build_router
from backend.adapters.http.spa import SpaStaticFiles
from backend.adapters.mcp.server import build_mcp_server
from backend.adapters.store.postgres import PostgresPlanStore
from backend.config import database_dsn, load_settings
from backend.usecases.service import PlanService

__all__ = ["create_app"]

# The built cockpit bundle (frontend/dist, copied by devops/Dockerfile);
# absent in a bare source checkout, in which case no catch-all mounts and
# the API/MCP doors still serve (useful for backend-only dev and tests).
_STATIC_DIR = Path(__file__).resolve().parents[3] / "app" / "static"


def create_app() -> FastAPI:
    settings = load_settings()
    store = PostgresPlanStore(database_dsn(settings))
    store.ensure_schema()
    service = PlanService(store)
    mcp_server = build_mcp_server(service)

    app = FastAPI(title="vf-plans", version=__version__, lifespan=_lifespan(mcp_server))

    # The machine door takes the app's own key; the human surfaces are
    # served only behind the identity realm's sign-in (ADR-008).
    install_auth(app, settings)
    app.include_router(build_router(service, settings), prefix="/api", tags=["api"])

    # The bare /mcp path must serve too (REF-MCP.md section 4): register
    # this BEFORE the catch-all static mount below, which would otherwise
    # swallow it.
    @app.api_route("/mcp", methods=["GET", "POST", "DELETE"], include_in_schema=False)
    async def _mcp_redirect() -> RedirectResponse:
        return RedirectResponse(url="/mcp/", status_code=307)

    app.mount("/mcp", mcp_server.streamable_http_app())

    if _STATIC_DIR.is_dir():
        # A single-page app: a path that is no file is the cockpit's own route (spa.py says why).
        app.mount("/", SpaStaticFiles(directory=str(_STATIC_DIR), html=True), name="static")

    return app


def _lifespan(mcp_server: FastMCP) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with mcp_server.session_manager.run():
            yield

    return lifespan
