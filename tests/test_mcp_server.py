"""The MCP door, verified at the protocol level through the SDK's own
client against the running app (REF-MCP.md section 8) - never by calling
the tool functions directly (its anti-pattern 7).
"""

from __future__ import annotations

import base64
import threading
import time

import httpx
import pytest
import uvicorn
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from pytest_intent import intent

from backend.adapters.http.app import create_app

_EXPECTED_TOOLS = {
    "create_plan",
    "get_plan",
    "upsert_item",
    "record_decision",
    "set_status",
    "append_log",
    "reanchor_dates",
    "new_version",
    "export_plan",
}


@pytest.fixture
def live_server(database_url: str, monkeypatch: pytest.MonkeyPatch):
    """A real, running instance of the app on a loopback port - MCP's
    streamable HTTP transport needs an actual ASGI server, not a
    TestClient (which speaks WSGI-style request/response, not the
    long-lived session the transport keeps)."""
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("MCP_USER", "dev")
    monkeypatch.setenv("MCP_PASSWORD", "dev")
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=8871, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        try:
            httpx.get("http://127.0.0.1:8871/api/health", timeout=0.2)
            break
        except httpx.TransportError:
            time.sleep(0.05)
    yield "http://127.0.0.1:8871"
    server.should_exit = True
    thread.join(timeout=5)


def _auth_header() -> dict[str, str]:
    token = base64.b64encode(b"dev:dev").decode("ascii")
    return {"Authorization": f"Basic {token}"}


@intent("INT-PLANS-018")
@pytest.mark.anyio
async def test_mcp_exposes_exactly_the_nine_named_tools(live_server: str) -> None:
    async with streamablehttp_client(f"{live_server}/mcp/", headers=_auth_header()) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = {t.name for t in tools.tools}
            assert names == _EXPECTED_TOOLS


@intent("INT-PLANS-041")
@pytest.mark.anyio
async def test_an_agent_completes_the_whole_sequence_through_mcp_alone(live_server: str, plan_id: str) -> None:
    async with streamablehttp_client(f"{live_server}/mcp/", headers=_auth_header()) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            dataset = {
                "meta": {"id": plan_id, "title": "Agent Plan", "horizon": ["2026-01-01", "2026-06-01"]},
                "lanes": [{"id": "build", "name": "Build"}],
                "items": [],
                "gates": [],
                "log": [],
            }
            await session.call_tool("create_plan", {"dataset": dataset})
            result = await session.call_tool("upsert_item", {
                "plan_id": plan_id,
                "item": {"type": "dependency", "name": "Agent dep", "status": "wait"},
            })
            assert not result.isError, result.content
            result = await session.call_tool("record_decision", {
                "plan_id": plan_id, "item_id": "DEP-001", "who": "agent", "text": "Approved",
            })
            assert not result.isError
            result = await session.call_tool("new_version", {"plan_id": plan_id, "meta": {"lede": "Updated by agent"}})
            assert not result.isError
            result = await session.call_tool("export_plan", {"plan_id": plan_id})
            assert not result.isError
            payload = result.structuredContent or {}
            assert payload.get("filename", "").startswith(plan_id)
            assert "PlanRenderer" in payload.get("html", "")


@intent("INT-PLANS-018")
@pytest.mark.anyio
async def test_new_version_takes_the_patch_its_rest_counterpart_takes(live_server: str, plan_id: str) -> None:
    """new_version enters the use case the REST /plans/{id}/meta route
    enters, with the same patch: items, gates and log land in the one
    version the call writes."""
    async with streamablehttp_client(f"{live_server}/mcp/", headers=_auth_header()) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            dataset = {
                "meta": {"id": plan_id, "title": "Patch Plan", "horizon": ["2026-01-01", "2026-06-01"]},
                "lanes": [{"id": "build", "name": "Build"}],
                "items": [{"id": "TRK-01", "type": "track", "name": "Build it", "owner": "A team",
                           "lane": "build", "status": "wait"}],
                "gates": [{"id": "G1", "name": "Built", "short": "Built", "evidence": "It runs",
                           "closer": "A team", "refs": ["TRK-01"]}],
                "log": [],
            }
            await session.call_tool("create_plan", {"dataset": dataset})
            items = dataset["items"] + [{"id": "TRK-02", "type": "track", "name": "Ship it", "owner": "A team",
                                         "lane": "build", "status": "wait", "needs": ["TRK-01"]}]
            gates = [{**dataset["gates"][0], "refs": ["TRK-01", "TRK-02"]}]
            log = [{"date": "2026-01-05", "who": "agent", "refs": ["TRK-02", "G1"], "text": "TRK-02 added; G1 closes on it."}]
            result = await session.call_tool("new_version", {
                "plan_id": plan_id, "meta": {"lede": "Patched"}, "items": items, "gates": gates, "log": log,
            })
            assert not result.isError, result.content
            landed = result.structuredContent or {}
            assert landed["meta"]["version"] == "v0.2"
            assert landed["meta"]["lede"] == "Patched"
            assert [i["id"] for i in landed["items"]] == ["TRK-01", "TRK-02"]
            assert landed["gates"][0]["refs"] == ["TRK-01", "TRK-02"]
            assert landed["log"] == log


@intent("INT-PLANS-043")
@pytest.mark.anyio
async def test_mcp_refuses_an_uncredentialed_call_and_serves_503_with_no_key_configured(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # No credential presented at all: refused (401), never silently open.
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("MCP_USER", "dev")
    monkeypatch.setenv("MCP_PASSWORD", "dev")
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=8872, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            try:
                httpx.get("http://127.0.0.1:8872/api/health", timeout=0.2)
                break
            except httpx.TransportError:
                time.sleep(0.05)
        r = httpx.post("http://127.0.0.1:8872/mcp/", json={}, timeout=2)
        assert r.status_code == 401
    finally:
        server.should_exit = True
        thread.join(timeout=5)

    # no key configured at all: the door answers 503, fail-closed.
    monkeypatch.delenv("MCP_USER", raising=False)
    monkeypatch.delenv("MCP_PASSWORD", raising=False)
    app2 = create_app()
    config2 = uvicorn.Config(app2, host="127.0.0.1", port=8873, log_level="warning")
    server2 = uvicorn.Server(config2)
    thread2 = threading.Thread(target=server2.run, daemon=True)
    thread2.start()
    try:
        for _ in range(100):
            try:
                httpx.get("http://127.0.0.1:8873/api/health", timeout=0.2)
                break
            except httpx.TransportError:
                time.sleep(0.05)
        r = httpx.post("http://127.0.0.1:8873/mcp/", json={}, timeout=2)
        assert r.status_code == 503
    finally:
        server2.should_exit = True
        thread2.join(timeout=5)


@intent("INT-PLANS-043")
@pytest.mark.anyio
async def test_scope_mcp_gates_mcp_alone_and_serves_every_other_route(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The shape the chart runs beside the identity realm's sidecar
    (k8s/templates/deployment.yaml sets PLANS_AUTH_SCOPE=mcp): the app's own
    Basic gate covers /mcp and ONLY /mcp - both halves, or the write door
    goes unguarded or the REST API the sidecar already protects is gated
    twice.
    """
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("MCP_USER", "dev")
    monkeypatch.setenv("MCP_PASSWORD", "dev")
    monkeypatch.setenv("PLANS_AUTH_SCOPE", "mcp")
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=8874, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            try:
                httpx.get("http://127.0.0.1:8874/api/health", timeout=0.2)
                break
            except httpx.TransportError:
                time.sleep(0.05)
        # /mcp still refuses an uncredentialed call...
        r = httpx.post("http://127.0.0.1:8874/mcp/", json={}, timeout=2)
        assert r.status_code == 401
        # ...and answers once credentialed (proves the branch does not
        # accidentally close the door entirely).
        token = base64.b64encode(b"dev:dev").decode("ascii")
        r = httpx.post(
            "http://127.0.0.1:8874/mcp/",
            json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            headers={"Authorization": f"Basic {token}", "Accept": "application/json, text/event-stream"},
            timeout=2,
        )
        assert r.status_code != 401 and r.status_code != 503
        # every other route - the surfaces the proxy now fronts - is open
        # with NO credential at all (this is the narrowing itself).
        r = httpx.get("http://127.0.0.1:8874/api/plans", timeout=2)
        assert r.status_code == 200, f"scope=mcp must leave /api open; got {r.status_code}"
    finally:
        server.should_exit = True
        thread.join(timeout=5)
