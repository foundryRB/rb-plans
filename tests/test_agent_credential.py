"""The connect-an-agent panel's credential route (INT-PLANS-045)."""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from pytest_intent import intent

from backend.adapters.http.app import create_app


def _client(monkeypatch: pytest.MonkeyPatch, database_url: str, **env: str) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", database_url)
    for name in ("MCP_USER", "MCP_PASSWORD", "PLANS_AUTH_SCOPE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return TestClient(create_app())


@intent("INT-PLANS-045")
def test_the_route_hands_the_caller_the_doors_basic_pair(monkeypatch: pytest.MonkeyPatch, database_url: str) -> None:
    # Under scope=mcp the cockpit's gate is the oauth2-proxy in front of the
    # app, absent here, so the app itself serves the route to this caller.
    client = _client(monkeypatch, database_url, MCP_USER="agent", MCP_PASSWORD="s3cret", PLANS_AUTH_SCOPE="mcp")
    r = client.get("/api/agent-credential")
    assert r.status_code == 200, r.text
    assert base64.b64decode(r.json()["credential"]).decode("utf-8") == "agent:s3cret"


@intent("INT-PLANS-045")
def test_the_route_answers_503_while_either_half_of_the_key_is_unset(
    monkeypatch: pytest.MonkeyPatch, database_url: str
) -> None:
    for env in ({}, {"MCP_USER": "agent"}, {"MCP_PASSWORD": "s3cret"}):
        client = _client(monkeypatch, database_url, PLANS_AUTH_SCOPE="mcp", **env)
        assert client.get("/api/agent-credential").status_code == 503, env


@intent("INT-PLANS-045")
def test_with_no_sidecar_declared_the_route_hands_out_nothing(
    monkeypatch: pytest.MonkeyPatch, database_url: str
) -> None:
    for scope in ({}, {"PLANS_AUTH_SCOPE": "misspelt"}):
        client = _client(monkeypatch, database_url, MCP_USER="agent", MCP_PASSWORD="s3cret", **scope)
        assert client.get("/api/agent-credential").status_code == 503, scope
        assert client.get("/api/agent-credential", auth=("agent", "s3cret")).status_code == 503, scope


@intent("INT-PLANS-043")
def test_with_no_sidecar_declared_the_human_surfaces_refuse_and_the_door_keeps_its_key(
    monkeypatch: pytest.MonkeyPatch, database_url: str
) -> None:
    client = _client(monkeypatch, database_url, MCP_USER="agent", MCP_PASSWORD="s3cret")
    assert client.get("/api/health").status_code == 200
    assert client.get("/").status_code == 503
    assert client.get("/api/plans", auth=("agent", "s3cret")).status_code == 503
    assert client.get("/mcp/", follow_redirects=False).status_code == 401
