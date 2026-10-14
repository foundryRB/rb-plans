"""The store's owner role has no source but the platform grant,
and an unset value on the discrete-settings path is a named startup
failure, never a silent connect as somebody else.
"""

from __future__ import annotations

import pytest
from pytest_intent import intent

from backend.config import Settings, database_dsn
from backend.domain.errors import ConfigError


@intent("INT-PLANS-044")
def test_discrete_path_refuses_to_start_with_an_unset_owner_role() -> None:
    settings = Settings(
        database_url=None,
        database_host="shared-rw.databases.svc.cluster.local",
        database_port="5432",
        database_name="rb-plans",
        database_user="",
        database_password="",
        mcp_user="",
        mcp_password="",
        mcp_allowed_host=None,
        auth_scope="mcp",
    )
    with pytest.raises(ConfigError, match="DATABASE_USER"):
        database_dsn(settings)


def test_the_database_url_path_takes_precedence_and_is_unaffected() -> None:
    settings = Settings(
        database_url="postgresql://x:y@host/db",
        database_host="unused",
        database_port="5432",
        database_name="unused",
        database_user="",
        database_password="",
        mcp_user="",
        mcp_password="",
        mcp_allowed_host=None,
        auth_scope="mcp",
    )
    assert database_dsn(settings) == "postgresql://x:y@host/db"


def test_discrete_path_composes_the_dsn_when_the_owner_role_is_set() -> None:
    settings = Settings(
        database_url=None,
        database_host="shared-rw.databases.svc.cluster.local",
        database_port="5432",
        database_name="rb-plans",
        database_user="rb-plans-owner",
        database_password="secret",
        mcp_user="",
        mcp_password="",
        mcp_allowed_host=None,
        auth_scope="mcp",
    )
    dsn = database_dsn(settings)
    assert dsn.startswith("postgresql://rb-plans-owner:secret@")
    assert "shared-rw.databases.svc.cluster.local:5432/rb-plans" in dsn
