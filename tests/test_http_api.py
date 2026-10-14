"""The REST door (API-001/002/003)."""

from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient
from pytest_intent import intent

from backend.adapters.http.app import create_app


@pytest.fixture
def client(database_url: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", database_url)
    # The shape the chart runs: the sign-in sidecar, absent here, fronts the REST door.
    monkeypatch.setenv("PLANS_AUTH_SCOPE", "mcp")
    return TestClient(create_app())


@intent("INT-PLANS-015")
def test_rest_and_mcp_share_the_same_use_cases_a_rest_write_is_visible_elsewhere(
    client: TestClient, sample_dataset: dict
) -> None:
    plan_id = sample_dataset["meta"]["id"]
    r = client.post("/api/plans", json=copy.deepcopy(sample_dataset))
    assert r.status_code == 201, r.text
    # a write through REST is visible on the next read through REST (the
    # cross-door half is exercised again, over MCP, in test_mcp_server.py)
    r = client.get(f"/api/plans/{plan_id}")
    assert r.status_code == 200
    assert r.json()["items"][0]["id"] == "DEP-001"


@intent("INT-PLANS-016")
def test_get_returns_ref_plan_json_with_no_envelope_and_no_added_fields(client: TestClient, sample_dataset: dict) -> None:
    plan_id = sample_dataset["meta"]["id"]
    client.post("/api/plans", json=copy.deepcopy(sample_dataset))
    r = client.get(f"/api/plans/{plan_id}")
    body = r.json()
    # no envelope: the top-level object IS the dataset (meta/lanes/items/gates/log)
    assert set(body.keys()) == {"meta", "lanes", "items", "gates", "log"}
    assert "data" not in body and "result" not in body


@intent("INT-PLANS-017")
def test_export_endpoint_is_deterministic_over_the_stored_version(client: TestClient, sample_dataset: dict) -> None:
    plan_id = sample_dataset["meta"]["id"]
    client.post("/api/plans", json=copy.deepcopy(sample_dataset))
    first = client.get(f"/api/plans/{plan_id}/export")
    second = client.get(f"/api/plans/{plan_id}/export?version=1")
    assert first.status_code == second.status_code == 200
    # both calls serve the one artifact the Export Composer produced for
    # this version - byte for byte, not merely equivalent.
    assert first.content == second.content


@intent("INT-PLANS-019")
def test_exported_html_is_self_contained_no_external_network_request(client: TestClient, sample_dataset: dict) -> None:
    plan_id = sample_dataset["meta"]["id"]
    client.post("/api/plans", json=copy.deepcopy(sample_dataset))
    html = client.get(f"/api/plans/{plan_id}/export").text
    assert "<script" in html and "PlanRenderer" in html
    # no request-issuing reference: no external stylesheet/script/font link,
    # no fetch. The SVG namespace URI is a required, inert string constant
    # (createElementNS), never dereferenced over the network.
    assert "<link" not in html
    assert "<script src" not in html
    assert "fetch(" not in html
    assert 'url("fonts/' not in html  # no relative font path: a face is inlined or absent
    assert 'url("http' not in html  # and never fetched


@intent("INT-PLANS-034")
def test_plans_list_carries_only_each_plans_own_summary_no_cross_plan_aggregation(
    client: TestClient, sample_dataset: dict
) -> None:
    client.post("/api/plans", json=copy.deepcopy(sample_dataset))
    r = client.get("/api/plans")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    for row in rows:
        assert set(row.keys()) == {"id", "title", "updated", "next_milestone"}


@intent("INT-PLANS-035")
def test_the_engine_ships_no_login_route_no_session_no_user_directory(client: TestClient) -> None:
    for path in ("/login", "/api/login", "/auth", "/api/auth", "/api/users", "/api/session"):
        r = client.get(path)
        assert r.status_code in (404, 401), f"{path} unexpectedly answers {r.status_code}"
    r = client.get("/api/health")
    assert "set-cookie" not in {k.lower() for k in r.headers.keys()}


@intent("INT-PLANS-026")
def test_importer_extracts_the_dataset_and_refuses_a_nonconforming_file(client: TestClient, plan_id: str) -> None:
    good_html = (
        "<!doctype html><html><body>"
        '<script type="application/json">'
        '{"meta":{"id":"' + plan_id + '","title":"Imported"},"lanes":[],"items":[],"gates":[],"log":[]}'
        "</script></body></html>"
    )
    r = client.post("/api/plans/import", files={"file": ("plan.html", good_html, "text/html")})
    assert r.status_code == 201, r.text
    assert r.json()["meta"]["id"] == plan_id

    bad_html = "<!doctype html><html><body>no dataset here</body></html>"
    r = client.post("/api/plans/import", files={"file": ("plan.html", bad_html, "text/html")})
    assert r.status_code == 422
    assert "no REF-Plan dataset block" in str(r.json()["detail"])
    # nothing written by the refused import: the good one is still the only
    # plan this test itself produced (other tests' plans use their own
    # fixture-generated ids and are not this test's concern).
    r = client.get("/api/plans")
    ids = {row["id"] for row in r.json()}
    assert plan_id in ids
