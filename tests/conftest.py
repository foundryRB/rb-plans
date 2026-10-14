"""Shared fixtures for the pytest suite.

`db_url` raises rather than skips when no PostgreSQL is reachable:
a skipped test is a claim attested by nothing that ran, which
`REF-CSD.md` section 6 forbids for an active claim. A run with neither a
container runtime nor DATABASE_URL ends degraded on claim coverage; it
does not silently green this suite.
"""

from __future__ import annotations

import os
import uuid

import pytest

from backend.adapters.store.postgres import PostgresPlanStore
from backend.usecases.service import PlanService


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set: the integration suite needs a reachable "
            "PostgreSQL (devops/docker-compose.yml's db service locally, a "
            "services: container in CI). Never substituted with an in-memory "
            "store."
        )
    return url


@pytest.fixture(scope="session")
def database_url() -> str:
    return _database_url()


@pytest.fixture
def store(database_url: str) -> PostgresPlanStore:
    s = PostgresPlanStore(database_url)
    s.ensure_schema()
    return s


@pytest.fixture
def service(store: PostgresPlanStore) -> PlanService:
    return PlanService(store)


@pytest.fixture
def plan_id() -> str:
    """A fresh id per test, so tests never collide on a shared store."""
    return f"test-{uuid.uuid4().hex[:12]}"


@pytest.fixture
def anyio_backend() -> str:
    """MCP protocol tests (test_mcp_server.py) are async; pin asyncio so the
    anyio plugin does not also try (and fail to find) a trio backend."""
    return "asyncio"


@pytest.fixture
def sample_dataset(plan_id: str) -> dict:
    return {
        "meta": {
            "id": plan_id,
            "title": "Sample Plan",
            "eyebrow": "Engagement",
            "lede": "A sample plan for the test suite.",
            "focus": "Deliver the sample.",
            "anchor": "2026-01-01",
            "horizon": ["2026-01-01", "2026-06-30"],
            "classification": "internal",
            "sources": [],
        },
        "lanes": [{"id": "build", "name": "Build"}, {"id": "ship", "name": "Ship"}],
        "items": [
            {
                "id": "DEP-001",
                "type": "dependency",
                "name": "Vendor signs MSA",
                "owner": "Sales",
                "lane": "build",
                "priority": "high",
                "status": "wait",
                "due": "2026-02-01",
            },
            {
                "id": "M1",
                "type": "milestone",
                "name": "Kickoff",
                "short": "Kickoff",
                "lane": "build",
                "due": "2026-01-15",
                "status": "ok",
            },
        ],
        "gates": [
            {
                "id": "G1",
                "name": "Budget approved",
                "evidence": "Signed PO",
                "closer": "Finance",
                "refs": [],
                "due": "2026-01-10",
            }
        ],
        "log": [{"date": "2026-01-01", "refs": ["PLAN"], "text": "Plan opened.", "who": "PM"}],
    }
