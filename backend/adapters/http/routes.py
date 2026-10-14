"""The REST door (API-001/002/003). Every plan route calls PlanService - the
same use cases the UI and the MCP door call - and returns the REF-Plan
dataset with no envelope and no added fields (INT-PLANS-016). The
`/agent-credential` route hands the cockpit's connect-an-agent panel the
machine door's key (INT-PLANS-045).
"""

from __future__ import annotations

import base64
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from backend.adapters.export.composer import compose_export_html
from backend.config import Settings
from backend.domain import models
from backend.domain.errors import NotFoundError, ValidationError
from backend.usecases.service import PlanService

__all__ = ["build_router"]


class NewPlanRequest(BaseModel):
    id: str
    title: str


class SetStatusRequest(BaseModel):
    status: str


class DecisionRequest(BaseModel):
    who: str
    text: str
    date: str | None = None


class LogRequest(BaseModel):
    who: str
    text: str
    refs: list[str] | None = None
    date: str | None = None


class ReanchorRequest(BaseModel):
    delta_days: int
    who: str


class MetaPatchRequest(BaseModel):
    meta: dict[str, Any] | None = None
    lanes: list[dict[str, Any]] | None = None
    items: list[dict[str, Any]] | None = None
    gates: list[dict[str, Any]] | None = None
    log: list[dict[str, Any]] | None = None


def build_router(service: PlanService, settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @router.get("/agent-credential")
    def agent_credential() -> dict:
        # The connect-an-agent panel's one-liner: the pair the /mcp gate enforces,
        # reachable only past the cockpit's own gate (INT-PLANS-045); 503 while
        # either half is unset, since there is nothing to hand out.
        if not (settings.mcp_user and settings.mcp_password):
            raise HTTPException(status_code=503, detail="MCP credential is not configured")
        pair = f"{settings.mcp_user}:{settings.mcp_password}".encode("utf-8")
        return {"credential": base64.b64encode(pair).decode("ascii")}

    @router.get("/plans")
    def list_plans() -> list[dict]:
        return [
            {
                "id": summary.plan_id,
                "title": summary.title,
                "updated": summary.updated.isoformat(),
                "next_milestone": summary.next_milestone,
            }
            for summary in service.list_plans()
        ]

    @router.post("/plans", status_code=201)
    def create_plan(body: dict) -> dict:
        return _guard(lambda: service.create_plan(body))

    @router.post("/plans/new", status_code=201)
    def new_plan(body: NewPlanRequest) -> dict:
        return _guard(lambda: service.create_plan(models.empty_dataset(body.id, body.title)))

    @router.post("/plans/import", status_code=201)
    async def import_plan(file: UploadFile = File(...)) -> dict:
        html = (await file.read()).decode("utf-8", errors="replace")
        return _guard(lambda: service.import_plan(html))

    @router.get("/plans/{plan_id}")
    def get_plan(plan_id: str, version: int | None = Query(default=None)) -> dict:
        return _guard(lambda: service.get_plan(plan_id, version))

    @router.get("/plans/{plan_id}/versions")
    def list_versions(plan_id: str) -> list[dict]:
        versions = _guard(lambda: service.list_versions(plan_id))
        return [
            {
                "version": v.version,
                "display": v.dataset.get("meta", {}).get("version"),
                "created_at": v.created_at.isoformat(),
                "ephemeral": v.ephemeral,
            }
            for v in versions
        ]

    @router.get("/plans/{plan_id}/diff")
    def diff_versions(plan_id: str, from_: int = Query(alias="from"), to: int = Query()) -> dict:
        versions = {v.version: v for v in _guard(lambda: service.list_versions(plan_id))}
        if from_ not in versions or to not in versions:
            raise HTTPException(status_code=404, detail="version not found")
        from_log = versions[from_].dataset.get("log", [])
        to_log = versions[to].dataset.get("log", [])
        # log is append-only, so the rows added between two versions are
        # exactly the suffix beyond the earlier version's own length.
        added = to_log[len(from_log) :] if to >= from_ else []
        return {"from": from_, "to": to, "log": added}

    @router.post("/plans/{plan_id}/items")
    def upsert_item(plan_id: str, item: dict) -> dict:
        return _guard(lambda: service.upsert_item(plan_id, item))

    @router.post("/plans/{plan_id}/items/{item_id}/status")
    def set_status(plan_id: str, item_id: str, body: SetStatusRequest) -> dict:
        return _guard(lambda: service.set_status(plan_id, item_id, body.status))

    @router.post("/plans/{plan_id}/items/{item_id}/decision")
    def record_decision(plan_id: str, item_id: str, body: DecisionRequest) -> dict:
        return _guard(lambda: service.record_decision(plan_id, item_id, body.who, body.text, body.date))

    @router.post("/plans/{plan_id}/log")
    def append_log(plan_id: str, body: LogRequest) -> dict:
        return _guard(lambda: service.append_log(plan_id, body.text, body.who, body.refs, body.date))

    @router.post("/plans/{plan_id}/reanchor")
    def reanchor(plan_id: str, body: ReanchorRequest) -> dict:
        return _guard(lambda: service.reanchor_dates(plan_id, body.delta_days, body.who))

    @router.post("/plans/{plan_id}/meta")
    def patch_meta(plan_id: str, body: MetaPatchRequest) -> dict:
        patch = {k: v for k, v in body.model_dump().items() if v is not None}
        return _guard(lambda: service.new_version(plan_id, patch))

    @router.get("/plans/{plan_id}/export")
    def export_plan(plan_id: str, version: int | None = Query(default=None)) -> Response:
        dataset = _guard(lambda: service.get_plan(plan_id, version))
        html = compose_export_html(dataset)
        filename = f"{plan_id}-{dataset.get('meta', {}).get('version', 'v0')}.html"
        return Response(
            content=html,
            media_type="text/html",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )

    return router


def _guard(fn):
    try:
        return fn()
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.reasons) from exc
