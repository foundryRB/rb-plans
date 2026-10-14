"""The version store: append-only, immutable (VER-001/VER-002)."""

from __future__ import annotations

from pytest_intent import intent

from backend.adapters.store.postgres import PostgresPlanStore


@intent("INT-PLANS-021")
def test_every_mutating_write_lands_a_new_version(store: PostgresPlanStore, plan_id: str, sample_dataset: dict) -> None:
    store.create_plan(plan_id, sample_dataset)
    assert len(store.list_versions(plan_id)) == 1

    v2 = dict(sample_dataset)
    v2["items"] = [*sample_dataset["items"], {"id": "M2", "type": "milestone", "name": "Second", "due": "2026-03-01"}]
    store.append_version(plan_id, v2)
    versions = store.list_versions(plan_id)
    assert len(versions) == 2
    # earlier version stays readable at its own content
    assert store.get_version(plan_id, 1).dataset == sample_dataset
    assert store.get_version(plan_id, 2).dataset == v2


@intent("INT-PLANS-022")
def test_store_never_issues_update_or_delete_sql() -> None:
    import inspect

    source = inspect.getsource(PostgresPlanStore)
    assert "UPDATE " not in source.upper().replace("\n", " ")
    assert "DELETE FROM" not in source.upper()


@intent("INT-PLANS-022")
def test_an_earlier_version_is_unchanged_by_a_later_write(store: PostgresPlanStore, plan_id: str, sample_dataset: dict) -> None:
    store.create_plan(plan_id, sample_dataset)
    original = store.get_version(plan_id, 1).dataset
    v2 = dict(sample_dataset, meta={**sample_dataset["meta"], "title": "Renamed"})
    store.append_version(plan_id, v2)
    assert store.get_version(plan_id, 1).dataset == original
    assert store.get_version(plan_id, 1).dataset["meta"]["title"] == "Sample Plan"


@intent("INT-PLANS-024")
def test_every_stored_version_records_ephemeral_and_v1_writes_only_kept(
    store: PostgresPlanStore, plan_id: str, sample_dataset: dict
) -> None:
    stored = store.create_plan(plan_id, sample_dataset)
    assert stored.ephemeral is False
    stored2 = store.append_version(plan_id, sample_dataset)
    assert stored2.ephemeral is False
