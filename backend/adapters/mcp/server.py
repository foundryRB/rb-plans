"""The MCP door (MCP-001, REF-MCP.md): exactly nine tools, each a thin
wrapper over PlanService - the identical use cases the UI and the REST
API call (INT-PLANS-018). No tool re-implements anything; a rejected
write's error message is the use case's own reason (REF-MCP.md section 3).
"""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from backend.adapters.export.composer import compose_export_html
from backend.usecases.service import PlanService

__all__ = ["build_mcp_server"]

_INSTRUCTIONS = (
    "vf-plans: create and manage REF-Plan project plans. Every write lands a "
    "new, immutable version (VER-001) - nothing is ever edited in place. "
    "create_plan seeds a plan from a full REF-Plan section 3 dataset; get_plan "
    "reads the latest (or a named) version; upsert_item adds or updates one "
    "item by id; set_status flips an item's status; record_decision sets an "
    "item's decision (who, text, date); append_log appends a decision-log row; "
    "reanchor_dates shifts every dependent date by a day count; new_version "
    "merges a meta/lanes/items/gates/log patch as the next version (the door "
    "behind the plan's own setup edits); export_plan returns the standalone, "
    "self-contained HTML file for the calling agent to save."
)

_ALLOWED_HOST_ENV = "MCP_ALLOWED_HOST"


def _transport_security() -> TransportSecuritySettings | None:
    host = os.environ.get(_ALLOWED_HOST_ENV)
    if not host:
        return None
    return TransportSecuritySettings(allowed_hosts=[h.strip() for h in host.split(",") if h.strip()])


def build_mcp_server(service: PlanService) -> FastMCP:
    server = FastMCP(
        "vf-plans",
        instructions=_INSTRUCTIONS,
        streamable_http_path="/",
        stateless_http=True,
        transport_security=_transport_security(),
    )

    @server.tool()
    def create_plan(dataset: dict[str, Any]) -> dict[str, Any]:
        """Create a plan from a full REF-Plan section 3 dataset (meta, lanes,
        items, gates, log). Refused with the reason if the dataset does not
        conform. Stored as v0.1."""
        return service.create_plan(dataset)

    @server.tool()
    def get_plan(plan_id: str, version: int | None = None) -> dict[str, Any]:
        """Return a plan's REF-Plan dataset: the latest version, or a named
        one."""
        return service.get_plan(plan_id, version)

    @server.tool()
    def upsert_item(plan_id: str, item: dict[str, Any]) -> dict[str, Any]:
        """Add or update one item (dependency, assumption, risk, milestone or
        track) by id; omit id to create one with the next ordinal id for its
        type. Returns the plan's new version."""
        return service.upsert_item(plan_id, item)

    @server.tool()
    def record_decision(plan_id: str, item_id: str, who: str, text: str, date: str | None = None) -> dict[str, Any]:
        """Record an item's decision (who decided, the decision verbatim,
        and the date - defaults to today). Returns the plan's new version."""
        return service.record_decision(plan_id, item_id, who, text, date)

    @server.tool()
    def set_status(plan_id: str, item_id: str, status: str) -> dict[str, Any]:
        """Flip an item's status (ok, wait, block, descoped, superseded).
        Returns the plan's new version."""
        return service.set_status(plan_id, item_id, status)

    @server.tool()
    def append_log(plan_id: str, who: str, text: str, refs: list[str] | None = None, date: str | None = None) -> dict[str, Any]:
        """Append a row to the plan's append-only decision log. refs name the
        ids it touches, or default to ['PLAN']. Returns the plan's new
        version."""
        return service.append_log(plan_id, text, who, refs, date)

    @server.tool()
    def reanchor_dates(plan_id: str, delta_days: int, who: str) -> dict[str, Any]:
        """Shift every dependent date (meta.horizon, meta.anchor, every
        item's due/start/end) by delta_days calendar days, and record the
        shift as a log row. Returns the plan's new version."""
        return service.reanchor_dates(plan_id, delta_days, who)

    @server.tool()
    def new_version(
        plan_id: str,
        meta: dict[str, Any] | None = None,
        lanes: list[dict[str, Any]] | None = None,
        items: list[dict[str, Any]] | None = None,
        gates: list[dict[str, Any]] | None = None,
        log: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Land one new version from a patch, the same patch the REST
        /plans/{id}/meta route takes: meta is merged into the plan's meta;
        lanes, items, gates and log each replace their whole collection.
        Behind the plan's own setup surface (renaming the plan, editing its
        focus or horizon, reordering lanes) and behind a re-published
        dataset landing as one version. Returns the plan's new version."""
        patch: dict[str, Any] = {}
        for key, value in (("meta", meta), ("lanes", lanes), ("items", items), ("gates", gates), ("log", log)):
            if value is not None:
                patch[key] = value
        return service.new_version(plan_id, patch)

    @server.tool()
    def export_plan(plan_id: str, version: int | None = None) -> dict[str, Any]:
        """Return the standalone, self-contained HTML export of a plan
        version (the same artifact the UI's download button and the REST
        export endpoint serve) as {filename, html} for the calling agent to
        write to its own filesystem (the server never writes the client's
        machine)."""
        dataset = service.get_plan(plan_id, version)
        html = compose_export_html(dataset)
        filename = f"{plan_id}-{dataset.get('meta', {}).get('version', 'v0')}.html"
        return {"filename": filename, "html": html.decode("utf-8")}

    return server
