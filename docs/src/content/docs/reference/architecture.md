---
title: Architecture
id: DOC-ARCHITECTURE
type: Reference
summary: "The layered view, the REF-Plan dataset contract, and the three doors - UI, REST, MCP - over one write path."
status: Active
updated: "2026-10-04"
---

The cockpit, REST API and MCP tools enter the same application service. It validates the REF-Plan dataset and commits each write as an immutable PostgreSQL version; the shared renderer presents that version in the cockpit and exported HTML.

## Layout

```text
backend/     the Python hexagonal package
  domain/      pure models and validation (REF-Plan section 3); no framework import
  usecases/    PlanService - the single write path every door enters
  adapters/
    store/     PostgreSQL, append-only (ADR-003)
    http/      the REST door + the fail-closed Basic gate (ADR-005)
    mcp/       the MCP door - nine tools (ADR-002)
    export/    the Export Composer (ADR-004)
frontend/    the React MVVM cockpit (ADR-006)
  api/         the one fetch() module
  viewmodels/  one hook per screen, the only callers of api/
  views/       the five screens; no data access
renderer/    the one canonical REF-Plan renderer (ADR-001)
e2e/         playwright-intent specs (the 15 self-contained e2e claims)
tests/       the pytest suite; tests/deployed/ is the one in-cluster suite
devops/      Dockerfile (ADR-007), docker-compose.yml, promotion.yaml
k8s/         the Helm chart CI publishes
docs/        this site
```

## The REF-Plan dataset contract

The engine serves `REF-Plan.md` section 3 unchanged: one JSON object per plan version, with `meta`, `lanes`, `items`, `gates` and `log` collections. The engine adds exactly one field on write - `meta.version`, the store-assigned version stamp (`"v0.1"`, `"v0.2"`, ...) - and removes none. `backend/domain/models.py::validate_dataset` is the one place that shape is checked, used both when a plan is created or imported and before every write is committed.

## The three doors, one write path

| Door | Entry point | Enters |
| --- | --- | --- |
| UI | `frontend/src/views/*.tsx` via `frontend/src/viewmodels/*` | `PlanService` over REST |
| REST | `backend/adapters/http/routes.py` | `PlanService` directly |
| MCP | `backend/adapters/mcp/server.py` (nine tools) | `PlanService` directly |

Every write - `upsert_item`, `set_status`, `record_decision`, `append_log`, `reanchor_dates`, `new_version` - lands a new, immutable version in the store (`ADR-002`, `ADR-003`). A read from any door returns the exact same persisted state; nothing is held only in one door's process (`VER-004`).

## Export

`GET /api/plans/{id}/export` and the MCP `export_plan` tool both return the bytes `backend/adapters/export/composer.py::compose_export_html` produces: the dataset, the canonical renderer, and the three locked faces (embedded as base64), assembled into one file with no external request (`ADR-004`, `EXP-001`).

## Decisions

See [Decisions](../../decisions/) for the architecture decision records and [Brand](../../brand/) for the locked visual identity. [Traceability](../traceability/) maps the customer's 35 requirement IDs onto this repo's 46 intent claims.
