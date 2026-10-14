"""The single write path (ADR-002, VER-004): every door - HTTP, MCP, the
importer - calls PlanService, never the store directly and never its own
copy of this logic. No adapter, no framework import (INT-PLANS-028);
depends only on the PlanStore port and the domain module.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from backend.domain import models
from backend.domain.errors import NotFoundError, ValidationError
from backend.usecases.ports import PlanStore, PlanSummary, StoredVersion

__all__ = ["PlanService"]

_DATASET_SCRIPT_RE = re.compile(
    r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


class PlanService:
    def __init__(self, store: PlanStore) -> None:
        self._store = store

    # ---- reads -------------------------------------------------------

    def list_plans(self) -> list[PlanSummary]:
        return self._store.list_plans()

    def get_plan(self, plan_id: str, version: int | None = None) -> dict:
        stored = self._store.get_version(plan_id, version) if version else self._store.get_latest(plan_id)
        if stored is None:
            raise NotFoundError(f"no plan {plan_id!r}" + (f" at version {version}" if version else ""))
        return stored.dataset

    def list_versions(self, plan_id: str) -> list[StoredVersion]:
        versions = self._store.list_versions(plan_id)
        if not versions:
            raise NotFoundError(f"no plan {plan_id!r}")
        return versions

    # ---- writes (each lands a new, immutable version: VER-001) -------

    def create_plan(self, dataset: dict) -> dict:
        models.validate_dataset(dataset)
        plan_id = dataset["meta"]["id"]
        if self._store.exists(plan_id):
            raise ValidationError([f"a plan {plan_id!r} already exists"])
        versioned = models.bump_version(dataset, 1)
        stored = self._store.create_plan(plan_id, versioned)
        return stored.dataset

    def import_plan(self, html: str) -> dict:
        """Extract the dataset block from a REF-Plan HTML file and store it
        (IMP-001/IMP-002). Refuses with the reason; nothing is written on
        a conformance failure (design.md "Plans · Table").
        """
        match = _DATASET_SCRIPT_RE.search(html)
        if not match:
            raise ValidationError(["no REF-Plan dataset block found (no <script type=\"application/json\"> in the file)"])
        import json

        try:
            dataset = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            raise ValidationError([f"the dataset block is not valid JSON: {exc}"]) from None
        return self.create_plan(dataset)

    def upsert_item(self, plan_id: str, item: dict) -> dict:
        dataset = self._latest_or_404(plan_id)
        items = list(dataset.get("items", []))
        item = dict(item)
        if not item.get("id"):
            item_type = item.get("type")
            if item_type not in models.ITEM_TYPES:
                raise ValidationError([f"unknown item type {item_type!r}"])
            item["id"] = models.next_ordinal_id(dataset, item_type)
        existing_idx = next((i for i, it in enumerate(items) if it["id"] == item["id"]), None)
        if existing_idx is None:
            items.append(item)
        else:
            items[existing_idx] = {**items[existing_idx], **item}
        dataset["items"] = items
        models.validate_dataset(dataset)
        return self._commit(plan_id, dataset)

    def set_status(self, plan_id: str, item_id: str, status: str) -> dict:
        if status not in models.STATUS_VALUES:
            raise ValidationError([f"unknown status {status!r}"])
        dataset = self._latest_or_404(plan_id)
        item = self._find_item_or_404(dataset, item_id)
        item["status"] = status
        models.validate_dataset(dataset)
        return self._commit(plan_id, dataset)

    def record_decision(self, plan_id: str, item_id: str, who: str, text: str, decision_date: str | None = None) -> dict:
        dataset = self._latest_or_404(plan_id)
        item = self._find_item_or_404(dataset, item_id)
        item["decision"] = {
            "date": decision_date or datetime.now(timezone.utc).date().isoformat(),
            "who": who,
            "text": text,
        }
        models.validate_dataset(dataset)
        return self._commit(plan_id, dataset)

    def append_log(self, plan_id: str, text: str, who: str, refs: list[str] | None = None, log_date: str | None = None) -> dict:
        dataset = self._latest_or_404(plan_id)
        row = {
            "date": log_date or datetime.now(timezone.utc).date().isoformat(),
            "refs": refs or ["PLAN"],
            "text": text,
            "who": who,
        }
        dataset.setdefault("log", []).append(row)
        models.validate_dataset(dataset)
        return self._commit(plan_id, dataset)

    def reanchor_dates(self, plan_id: str, delta_days: int, who: str) -> dict:
        dataset = self._latest_or_404(plan_id)
        shifted = models.shift_dataset_dates(dataset, delta_days)
        shifted.setdefault("log", []).append(
            {
                "date": datetime.now(timezone.utc).date().isoformat(),
                "refs": ["PLAN"],
                "text": f"Re-anchored dates by {delta_days:+d} days.",
                "who": who,
            }
        )
        models.validate_dataset(shifted)
        return self._commit(plan_id, shifted)

    def new_version(self, plan_id: str, patch: dict[str, Any]) -> dict:
        """Merge a patch into the latest dataset and land it as the next
        version - the generic MCP tool behind `Plan · Setup`'s meta/lanes
        edits, which are not covered by a more specific use case.
        """
        dataset = self._latest_or_404(plan_id)
        if "meta" in patch:
            dataset["meta"] = {**dataset.get("meta", {}), **patch["meta"]}
        for key in ("lanes", "items", "gates", "log"):
            if key in patch:
                dataset[key] = patch[key]
        models.validate_dataset(dataset)
        return self._commit(plan_id, dataset)

    # ---- helpers -------------------------------------------------------

    def _latest_or_404(self, plan_id: str) -> dict:
        stored = self._store.get_latest(plan_id)
        if stored is None:
            raise NotFoundError(f"no plan {plan_id!r}")
        return stored.dataset

    def _find_item_or_404(self, dataset: dict, item_id: str) -> dict:
        for item in dataset.get("items", []):
            if item["id"] == item_id:
                return item
        raise NotFoundError(f"no item {item_id!r}")

    def _commit(self, plan_id: str, dataset: dict) -> dict:
        next_step = len(self._store.list_versions(plan_id)) + 1
        versioned = models.bump_version(dataset, next_step)
        stored = self._store.append_version(plan_id, versioned)
        return stored.dataset
