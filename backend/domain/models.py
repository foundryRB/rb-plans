"""The REF-Plan section 3 dataset, as data the domain validates and the
usecases layer transforms - never as a whitelisted dataclass. A dataclass
that named only the fields this engine knows about would silently drop
any field it did not anticipate, which is exactly the fork
INT-PLANS-002 forbids ("no field the engine invented", and by the same
rule, no field the engine subtracts). So a dataset is a plain ``dict`` end
to end - the store persists it whole, every door returns it whole - and
this module's job is to validate its shape and to implement the pure,
data-only transforms the use cases call (versioning, re-anchoring, id
allocation). No adapter, no framework import (INT-PLANS-028).
"""

from __future__ import annotations

import copy
import re
from datetime import date, datetime, timedelta
from typing import Any

from backend.domain.errors import ValidationError

__all__ = [
    "ITEM_TYPES",
    "STATUS_VALUES",
    "PRIORITY_VALUES",
    "validate_dataset",
    "next_ordinal_id",
    "bump_version",
    "shift_dataset_dates",
    "empty_dataset",
    "next_milestone_label",
]

ITEM_TYPES = frozenset({"dependency", "assumption", "risk", "milestone", "track"})
STATUS_VALUES = frozenset({"ok", "wait", "block", "descoped", "superseded"})
PRIORITY_VALUES = frozenset({"blocker", "high", "medium", "low", "optional"})
_ID_PREFIX = {
    "dependency": "DEP",
    "assumption": "ASM",
    "risk": "RSK",
    "track": "TRK",
    "milestone": "M",
}
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_META_REQUIRED = ("id", "title")


def _err(reasons: list[str], msg: str) -> None:
    reasons.append(msg)


def validate_dataset(dataset: Any) -> None:
    """Validate a dataset against REF-Plan.md section 3.

    Raises ValidationError carrying every reason found (never just the
    first) when the shape does not conform. Used both by plan creation
    and by the importer (INT-PLANS-026), whose refusal must state the
    reason.
    """
    reasons: list[str] = []
    if not isinstance(dataset, dict):
        raise ValidationError(["the dataset is not a JSON object"])

    meta = dataset.get("meta")
    if not isinstance(meta, dict):
        _err(reasons, "meta is missing or not an object")
        meta = {}
    for field in _META_REQUIRED:
        if not meta.get(field):
            _err(reasons, f"meta.{field} is required")
    horizon = meta.get("horizon")
    if horizon is not None:
        if not (isinstance(horizon, list) and len(horizon) == 2 and all(_valid_date(d) for d in horizon)):
            _err(reasons, "meta.horizon must be [start, end] ISO dates")

    lanes = dataset.get("lanes", [])
    if not isinstance(lanes, list):
        _err(reasons, "lanes must be a list")
        lanes = []
    lane_ids: set[str] = set()
    for i, lane in enumerate(lanes):
        if not isinstance(lane, dict) or not lane.get("id") or not lane.get("name"):
            _err(reasons, f"lanes[{i}] must carry id and name")
            continue
        lane_ids.add(lane["id"])

    items = dataset.get("items", [])
    if not isinstance(items, list):
        _err(reasons, "items must be a list")
        items = []
    item_ids: set[str] = set()
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            _err(reasons, f"items[{i}] is not an object")
            continue
        item_id = item.get("id")
        if not item_id:
            _err(reasons, f"items[{i}] has no id")
        elif item_id in item_ids:
            _err(reasons, f"duplicate item id {item_id!r}")
        else:
            item_ids.add(item_id)
        if item.get("type") not in ITEM_TYPES:
            _err(reasons, f"items[{i}] ({item_id}) has an unknown type {item.get('type')!r}")
        if not item.get("name"):
            _err(reasons, f"items[{i}] ({item_id}) has no name")
        status = item.get("status")
        if status is not None and status not in STATUS_VALUES:
            _err(reasons, f"items[{i}] ({item_id}) has an unknown status {status!r}")
        priority = item.get("priority")
        if priority is not None and priority not in PRIORITY_VALUES:
            _err(reasons, f"items[{i}] ({item_id}) has an unknown priority {priority!r}")
        if item.get("type") != "dependency" and priority is not None:
            _err(reasons, f"items[{i}] ({item_id}) carries priority but is not a dependency (REF-Plan section 3)")
        lane = item.get("lane")
        if lane is not None and lane not in lane_ids:
            _err(reasons, f"items[{i}] ({item_id}) references unknown lane {lane!r}")
        for field in ("due", "start", "end"):
            val = item.get(field)
            if val is not None and not _valid_date(val):
                _err(reasons, f"items[{i}] ({item_id}).{field} is not an ISO date")

    # edges resolve (REF-Plan section 10)
    all_ids = item_ids | {g.get("id") for g in dataset.get("gates", []) if isinstance(g, dict)}
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        for needed in item.get("needs", []) or []:
            if needed not in all_ids:
                _err(reasons, f"{item.get('id')} needs unknown id {needed!r}")
        parent = item.get("parent")
        if parent is not None and parent not in item_ids:
            _err(reasons, f"{item.get('id')}.parent references unknown id {parent!r}")

    gates = dataset.get("gates", [])
    if not isinstance(gates, list):
        _err(reasons, "gates must be a list")
        gates = []
    for i, gate in enumerate(gates):
        if not isinstance(gate, dict) or not gate.get("id") or not gate.get("name"):
            _err(reasons, f"gates[{i}] must carry id and name")
            continue
        if gate.get("due") is not None and not _valid_date(gate["due"]):
            _err(reasons, f"gates[{i}] ({gate['id']}).due is not an ISO date")

    log = dataset.get("log", [])
    if not isinstance(log, list):
        _err(reasons, "log must be a list")
        log = []
    for i, row in enumerate(log):
        if not isinstance(row, dict) or not row.get("date") or not row.get("text") or not row.get("who"):
            _err(reasons, f"log[{i}] must carry date, text and who")

    if reasons:
        raise ValidationError(reasons)


def _valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def next_ordinal_id(dataset: dict, item_type: str) -> str:
    """The next id for a new item of this type (DEP-001, ASM-03, M2 form).

    Milestones use a bare number with no zero-padding (`REF-Plan.md`
    section 3's own examples: `M2`); every other type pads to three digits
    except assumptions, which pad to two (`ASM-03`).
    """
    prefix = _ID_PREFIX[item_type]
    existing = [it["id"] for it in dataset.get("items", []) if it.get("type") == item_type]
    numbers = []
    for item_id in existing:
        suffix = item_id[len(prefix) :].lstrip("-")
        if suffix.isdigit():
            numbers.append(int(suffix))
    next_n = max(numbers, default=0) + 1
    if item_type == "milestone":
        return f"{prefix}{next_n}"
    if item_type == "assumption":
        return f"{prefix}-{next_n:02d}"
    return f"{prefix}-{next_n:03d}"


def bump_version(dataset: dict, step: int) -> dict:
    """Return a deep copy of ``dataset`` with meta.version set for this step.

    Save writes a new version; the display string is read-only after
    v0.1 because it is written by a save, never typed (design.md "Plan ·
    Setup"). Steps are simple tenths: step 1 -> "v0.1", step 5 -> "v0.5".
    """
    out = copy.deepcopy(dataset)
    out.setdefault("meta", {})["version"] = f"v0.{step}"
    return out


def shift_dataset_dates(dataset: dict, delta_days: int) -> dict:
    """Shift every dependent date by ``delta_days`` calendar days.

    Every ISO date the dataset carries EXCEPT a decision's own date (that
    is a historical fact, not a schedule) and a gate's ``closed.date``
    (also historical) moves: meta.horizon, meta.anchor, and every item's
    due/start/end (INT-PLANS-012 - "every dependent date... moves
    with the anchor").
    """
    out = copy.deepcopy(dataset)
    meta = out.setdefault("meta", {})
    if meta.get("anchor"):
        meta["anchor"] = _shift(meta["anchor"], delta_days)
    horizon = meta.get("horizon")
    if isinstance(horizon, list) and len(horizon) == 2:
        meta["horizon"] = [_shift(horizon[0], delta_days), _shift(horizon[1], delta_days)]
    for item in out.get("items", []):
        for field in ("due", "start", "end"):
            if item.get(field):
                item[field] = _shift(item[field], delta_days)
    for gate in out.get("gates", []):
        if gate.get("due"):
            gate["due"] = _shift(gate["due"], delta_days)
    return out


def _shift(iso: str, delta_days: int) -> str:
    d = date.fromisoformat(iso) + timedelta(days=delta_days)
    return d.isoformat()


def next_milestone_label(dataset: dict) -> str | None:
    """The plans list's own summary field (BND-002): this plan's next
    upcoming milestone by due date, or None. Never aggregated across plans.
    """
    milestones = [
        it
        for it in dataset.get("items", [])
        if it.get("type") == "milestone" and it.get("due") and it.get("status") not in {"descoped", "superseded"}
    ]
    if not milestones:
        return None
    milestones.sort(key=lambda m: m["due"])
    nearest = milestones[0]
    return nearest.get("short") or nearest.get("name")


def empty_dataset(plan_id: str, title: str) -> dict:
    """The skeleton `New plan` creates (design.md "Plans · Table"): empty
    collections, ready for Plan · Setup to fill in.
    """
    today = datetime.now().date().isoformat()
    return {
        "meta": {
            "id": plan_id,
            "title": title,
            "eyebrow": "",
            "lede": "",
            "focus": "",
            "anchor": today,
            "horizon": [today, today],
            "classification": "internal",
            "sources": [],
        },
        "lanes": [],
        "items": [],
        "gates": [],
        "log": [],
    }
