"""Outbound port the use cases depend on: a plan version store.

A ``typing.Protocol`` (stdlib only - INT-PLANS-028): the concrete
implementation (backend.adapters.store.postgres.PostgresPlanStore) is
never imported here, only depended on by shape. VER-004: every read
returns persisted state; nothing here holds a plan in process.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

__all__ = ["StoredVersion", "PlanSummary", "PlanStore"]


@dataclass(frozen=True)
class StoredVersion:
    plan_id: str
    version: int
    dataset: dict
    ephemeral: bool
    created_at: datetime


@dataclass(frozen=True)
class PlanSummary:
    """A plan's own summary fields only (BND-002: no cross-plan read)."""

    plan_id: str
    title: str
    updated: datetime
    next_milestone: str | None


class PlanStore(Protocol):
    def exists(self, plan_id: str) -> bool: ...

    def create_plan(self, plan_id: str, dataset: dict, *, ephemeral: bool = False) -> StoredVersion:
        """Create a plan at version 1. Raises if plan_id already exists."""
        ...

    def append_version(self, plan_id: str, dataset: dict, *, ephemeral: bool = False) -> StoredVersion:
        """Append the next version. Append-only, immutable (VER-001/VER-002)."""
        ...

    def get_latest(self, plan_id: str) -> StoredVersion | None: ...

    def get_version(self, plan_id: str, version: int) -> StoredVersion | None: ...

    def list_versions(self, plan_id: str) -> list[StoredVersion]:
        """Oldest first; every earlier version stays readable (VER-001)."""
        ...

    def list_plans(self) -> list[PlanSummary]: ...
