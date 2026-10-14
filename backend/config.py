"""Runtime configuration, read from the environment (repo root .env.example
documents every name here). Not a domain module: this is where an
adapter's own settings live, so it may import stdlib freely but nothing
from adapters/ (it is imported BY adapters, never the reverse).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from backend.domain.errors import ConfigError

__all__ = ["Settings", "load_settings", "database_dsn"]


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    database_host: str
    database_port: str
    database_name: str
    database_user: str
    database_password: str
    mcp_user: str
    mcp_password: str
    mcp_allowed_host: str | None
    auth_scope: str


def load_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL") or None,
        database_host=os.environ.get("DATABASE_HOST", "localhost"),
        database_port=os.environ.get("DATABASE_PORT", "5432"),
        database_name=os.environ.get("DATABASE_NAME", "vf_plans"),
        database_user=os.environ.get("DATABASE_USER", ""),
        database_password=os.environ.get("DATABASE_PASSWORD", ""),
        mcp_user=os.environ.get("MCP_USER", ""),
        mcp_password=os.environ.get("MCP_PASSWORD", ""),
        mcp_allowed_host=os.environ.get("MCP_ALLOWED_HOST") or None,
        auth_scope=(os.environ.get("PLANS_AUTH_SCOPE") or "").strip().lower(),
    )


def database_dsn(settings: Settings) -> str:
    """The store connection string.

    DATABASE_URL takes precedence (the shape CI and a developer export);
    otherwise the discrete settings
    compose it, and an unset owner role on THAT path is refused loudly
    (INT-PLANS-044): the platform's revoked PUBLIC connect
    means an empty user does not fall back to guest access, it fails
    opaquely at the database, and a named error here is the only thing
    that will explain it.
    """
    if settings.database_url:
        return settings.database_url
    if not settings.database_user:
        raise ConfigError(
            "DATABASE_USER is unset and DATABASE_URL was not supplied: the store's "
            "owner role has no source. Refusing to start rather than "
            "connecting under an implicit default identity."
        )
    password_part = f":{settings.database_password}" if settings.database_password else ""
    return (
        f"postgresql://{settings.database_user}{password_part}"
        f"@{settings.database_host}:{settings.database_port}/{settings.database_name}"
    )
