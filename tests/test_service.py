"""PlanService: the single write path (ADR-002, VER-004)."""

from __future__ import annotations

import copy

import pytest
from pytest_intent import intent

from backend.domain.errors import ValidationError
from backend.usecases.service import PlanService


@intent("INT-PLANS-002")
def test_a_plan_read_back_carries_every_field_it_was_written_with_and_no_more(
    service: PlanService, sample_dataset: dict
) -> None:
    created = service.create_plan(copy.deepcopy(sample_dataset))
    read_back = service.get_plan(sample_dataset["meta"]["id"])
    # every authored field survives...
    for key in ("lanes", "items", "gates", "log"):
        assert read_back[key] == sample_dataset[key]
    for key in ("id", "title", "eyebrow", "lede", "focus", "anchor", "horizon", "classification", "sources"):
        assert read_back["meta"][key] == sample_dataset["meta"][key]
    # ...and version is the ONLY field the engine adds (write-assigned, not
    # invented data about the plan's own content).
    assert set(read_back.keys()) == set(sample_dataset.keys())
    assert set(read_back["meta"].keys()) == set(sample_dataset["meta"].keys()) | {"version"}
    assert created["meta"]["version"] == "v0.1"


@intent("INT-PLANS-025")
def test_every_read_returns_persisted_state_not_in_process_state(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    plan_id = sample_dataset["meta"]["id"]
    # a second, independent service instance over the same store sees the
    # identical state - nothing lives only in the first instance's process.
    other = PlanService(service._store)  # noqa: SLF001 - same store, fresh service
    assert other.get_plan(plan_id) == service.get_plan(plan_id)


@intent("INT-PLANS-033")
def test_critical_flag_passes_through_unchanged_and_is_never_derived(service: PlanService, sample_dataset: dict) -> None:
    dataset = copy.deepcopy(sample_dataset)
    dataset["items"][0]["critical"] = True
    service.create_plan(dataset)
    plan_id = sample_dataset["meta"]["id"]
    read = service.get_plan(plan_id)
    assert read["items"][0]["critical"] is True
    # a second item with no authored flag stays unset - never computed
    assert "critical" not in read["items"][1] or read["items"][1]["critical"] is False


def test_upsert_item_allocates_the_next_ordinal_id_when_none_given(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    plan_id = sample_dataset["meta"]["id"]
    updated = service.upsert_item(plan_id, {"type": "dependency", "name": "Second dep", "status": "wait"})
    ids = [i["id"] for i in updated["items"] if i["type"] == "dependency"]
    assert "DEP-002" in ids


def test_set_status_rejects_an_unknown_status(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    plan_id = sample_dataset["meta"]["id"]
    with pytest.raises(ValidationError):
        service.set_status(plan_id, "DEP-001", "not-a-status")


def test_reanchor_shifts_every_dependent_date(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    plan_id = sample_dataset["meta"]["id"]
    shifted = service.reanchor_dates(plan_id, 7, "PM")
    assert shifted["meta"]["horizon"] == ["2026-01-08", "2026-07-07"]
    assert shifted["items"][0]["due"] == "2026-02-08"
    assert shifted["items"][1]["due"] == "2026-01-22"
    assert shifted["gates"][0]["due"] == "2026-01-17"
    assert shifted["log"][-1]["text"].startswith("Re-anchored")
