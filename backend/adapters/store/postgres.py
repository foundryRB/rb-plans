"""The plan version store, over PostgreSQL (PLT-001).

Append-only: this module contains no UPDATE and no DELETE statement
against plan_versions (INT-PLANS-022). A connection is opened per
call rather than pooled: this app's write volume is a handful of people
editing plans, not a request-per-millisecond service, and psycopg's own
connection setup is cheap enough that a pool would be complexity this
delivery has no load to justify.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from backend.domain import models
from backend.usecases.ports import PlanSummary, StoredVersion

__all__ = ["PostgresPlanStore"]

_SCHEMA_SQL = (Path(__file__).with_name("schema.sql")).read_text(encoding="utf-8")


class PostgresPlanStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, row_factory=dict_row)

    def ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(_SCHEMA_SQL)
            conn.commit()

    def exists(self, plan_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM plans WHERE plan_id = %s", (plan_id,)).fetchone()
            return row is not None

    def create_plan(self, plan_id: str, dataset: dict, *, ephemeral: bool = False) -> StoredVersion:
        with self._connect() as conn:
            conn.execute("INSERT INTO plans (plan_id) VALUES (%s)", (plan_id,))
            row = conn.execute(
                """
                INSERT INTO plan_versions (plan_id, version, dataset, ephemeral)
                VALUES (%s, 1, %s, %s)
                RETURNING plan_id, version, dataset, ephemeral, created_at
                """,
                (plan_id, Jsonb(dataset), ephemeral),
            ).fetchone()
            conn.commit()
            return _to_stored(row)

    def append_version(self, plan_id: str, dataset: dict, *, ephemeral: bool = False) -> StoredVersion:
        # Two writers landing on the same plan_id at once (a double-submit,
        # or two doors racing - REST and MCP both enter this same method,
        # STD-001) can otherwise both read the same MAX(version) before
        # either commits, then both try to insert the same next version and
        # collide on plan_versions' primary key. `plans` carries exactly
        # one row per plan_id, so locking it (FOR UPDATE, inside this
        # transaction) serializes writers for THIS plan_id only - a write
        # to a different plan is never blocked by it - and the second
        # writer's MAX(version) read waits until the first has committed
        # and released the lock, so it correctly sees the version the
        # first one just landed.
        with self._connect() as conn:
            conn.execute("SELECT plan_id FROM plans WHERE plan_id = %s FOR UPDATE", (plan_id,))
            next_version = conn.execute(
                "SELECT COALESCE(MAX(version), 0) + 1 AS n FROM plan_versions WHERE plan_id = %s",
                (plan_id,),
            ).fetchone()["n"]
            row = conn.execute(
                """
                INSERT INTO plan_versions (plan_id, version, dataset, ephemeral)
                VALUES (%s, %s, %s, %s)
                RETURNING plan_id, version, dataset, ephemeral, created_at
                """,
                (plan_id, next_version, Jsonb(dataset), ephemeral),
            ).fetchone()
            conn.commit()
            return _to_stored(row)

    def get_latest(self, plan_id: str) -> StoredVersion | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT plan_id, version, dataset, ephemeral, created_at
                FROM plan_versions WHERE plan_id = %s
                ORDER BY version DESC LIMIT 1
                """,
                (plan_id,),
            ).fetchone()
            return _to_stored(row) if row else None

    def get_version(self, plan_id: str, version: int) -> StoredVersion | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT plan_id, version, dataset, ephemeral, created_at
                FROM plan_versions WHERE plan_id = %s AND version = %s
                """,
                (plan_id, version),
            ).fetchone()
            return _to_stored(row) if row else None

    def list_versions(self, plan_id: str) -> list[StoredVersion]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT plan_id, version, dataset, ephemeral, created_at
                FROM plan_versions WHERE plan_id = %s
                ORDER BY version ASC
                """,
                (plan_id,),
            ).fetchall()
            return [_to_stored(row) for row in rows]

    def list_plans(self) -> list[PlanSummary]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT ON (plan_id) plan_id, dataset, created_at
                FROM plan_versions
                ORDER BY plan_id, version DESC
                """
            ).fetchall()
        summaries = []
        for row in rows:
            dataset = row["dataset"]
            meta = dataset.get("meta", {})
            summaries.append(
                PlanSummary(
                    plan_id=row["plan_id"],
                    title=meta.get("title", row["plan_id"]),
                    updated=row["created_at"],
                    next_milestone=models.next_milestone_label(dataset),
                )
            )
        return summaries


def _to_stored(row: dict) -> StoredVersion:
    created_at: datetime = row["created_at"]
    return StoredVersion(
        plan_id=row["plan_id"],
        version=row["version"],
        dataset=row["dataset"],
        ephemeral=row["ephemeral"],
        created_at=created_at,
    )
