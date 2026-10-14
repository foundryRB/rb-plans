---
title: MCP connect
id: DOC-MCP-CONNECT
type: Reference
summary: "How an agent connects to the rb-plans MCP door: the URL, the HTTP Basic shape, and where the key lives."
status: Active
updated: "2026-10-04"
---

rb-plans serves nine MCP tools at `/mcp` (`create_plan`, `get_plan`, `upsert_item`, `record_decision`, `set_status`, `append_log`, `reanchor_dates`, `new_version`, `export_plan`) - the same use cases the UI and the REST API call (`REF-MCP.md`, `MCP-001`).

## Connect

```bash
claude mcp add --scope user --transport http rb-plans https://rb-plans.rb-foundry.com/mcp --header "Authorization: Basic <credential>"
```

`<credential>` is the base64 encoding of `MCP_USER:MCP_PASSWORD`.

## From the cockpit

Open **Connect agent** in the cockpit's header band. The panel shows this command with the credential already filled in, fetched from `/api/agent-credential` behind the same sign-in as the cockpit (`INT-PLANS-045`). Copy it and run it once.

## Where the key lives

The machine door's key is the app's own fail-closed HTTP Basic credential (`ADR-005`) - **not** a realm-issued token, and not something this page states the value of. It lives in the `rb-plans` namespace's `rb-plans-mcp` Secret, which the chart mints in-cluster on its first sync and never rotates (`k8s/templates/mcp-key.yaml`); no value is ever committed. The cockpit's panel reads it from the running app; with cluster access, read it directly:

```bash
kubectl -n rb-plans get secret rb-plans-mcp -o jsonpath='{.data.MCP_USER}' | base64 -d
kubectl -n rb-plans get secret rb-plans-mcp -o jsonpath='{.data.MCP_PASSWORD}' | base64 -d
```

## Behaviour

`/mcp` answers `503` while the key is unset, `401` on a missing or wrong credential, and refuses the bare path with neither a silent 404 nor a swallow by the app's static bundle - `/mcp` redirects (307) to `/mcp/` before the catch-all mount. Every other surface (the cockpit, the REST API) serves independently of this key, gated instead by the identity realm's proxy once granted (`ADR-005`).
