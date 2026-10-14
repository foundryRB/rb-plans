---
title: "RB Plans"
type: Overview
summary: "Create and manage REF-Plan project plans - one write path, immutable versions, standalone HTML export."
id: DOC-INDEX
status: Active
updated: "2026-10-04"
---

rb-plans stores and versions `REF-Plan` project plans behind three doors over one write path - a UI a human drives with no agent, a REST API, and an MCP door where a workshop's capture lands - and exports any plan as one standalone, self-contained HTML file that renders identically offline.

## The three doors

- **UI** - the Plan Cockpit: the plans list, the plan render, the setup and item-edit forms, the version picker. No agent required.
- **REST API** - the same use cases the UI drives; a GET returns the `REF-Plan` dataset with no envelope and no added fields.
- **MCP** - nine tools (`create_plan`, `get_plan`, `upsert_item`, `record_decision`, `set_status`, `append_log`, `reanchor_dates`, `new_version`, `export_plan`) for an agent, gated by the app's own fail-closed key. See [MCP connect](./reference/mcp-connect/).

## One dataset, one renderer

Every write lands a new, immutable version of the plan's `REF-Plan` section 3 dataset. The plan view the cockpit shows and the file the export endpoint returns are both produced by the one canonical renderer this repo ships (`renderer/`).

See [Brand](./brand/) for the locked visual identity, [Architecture](./reference/architecture/) for the layout and the decision records, and [Traceability](./reference/traceability/) for how the 35 requirement IDs of P1 map to this repo's intent claims.
