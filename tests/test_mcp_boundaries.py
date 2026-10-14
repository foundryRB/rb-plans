"""BND-004/MCP-002: the engine hosts no workshop of its own."""

from __future__ import annotations

import anyio
from pytest_intent import intent

from backend.adapters.mcp.server import build_mcp_server
from backend.usecases.service import PlanService


@intent("INT-PLANS-036")
def test_the_engine_ships_no_workshop_entity_endpoint_or_capture_format(service: PlanService) -> None:
    server = build_mcp_server(service)
    tools = anyio.run(server.list_tools)
    names = {t.name for t in tools}
    assert not any("workshop" in n.lower() or "capture" in n.lower() for n in names)
