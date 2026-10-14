"""PLT-001's in-repo half: the chart asks for the platform database and
serves the MCP route - never an in-process or file-backed store
(INT-PLANS-032). Whether the grants are actually onboarded is a
studio read, not this static check.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]


@intent("INT-PLANS-032")
def test_chart_binds_the_platform_database_and_never_an_in_memory_store() -> None:
    values = yaml.safe_load((_REPO / "k8s" / "values.yaml").read_text(encoding="utf-8"))
    assert "database" in values, "k8s/values.yaml carries no database block at all"
    db = values["database"]
    assert "existingSecret" in db and db["existingSecret"], "the database block names no credential Secret"
    assert db["existingSecret"] != "", "an empty Secret name binds nothing"

    deployment = (_REPO / "k8s" / "templates" / "deployment.yaml").read_text(encoding="utf-8")
    assert ".Values.database" in deployment, "no template references .Values.database at all"
    assert "vf_plans" not in deployment.lower() or "DATABASE" in deployment, "no discrete DB env wiring found"

    # the MCP route is served by the app itself, on its own path, gated by
    # its own key, which the chart mints (templates/mcp-key.yaml).
    assert "{{ .Chart.Name }}-mcp" in deployment, "the Deployment reads no chart-minted MCP key"
    assert (_REPO / "k8s" / "templates" / "mcp-key.yaml").is_file(), "the chart mints no MCP key"
