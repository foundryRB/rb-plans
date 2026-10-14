# RB Plans

Create and manage `REF-Plan` project plans: one write path, immutable versions, standalone HTML export. Three doors - a UI a human drives with no agent, a REST API, and an MCP door for agents - all enter the same use cases, so a write through any door is visible through every other.

## Run with Docker

```bash
docker compose -f devops/docker-compose.yml up --build
```

The app serves at http://localhost:8080, backed by a local `db` service (PostgreSQL).

## Develop without Docker

Use Python 3.13+, Node.js 22.20+ and npm.

```bash
# 1. A local PostgreSQL (or reuse devops/docker-compose.yml's db service):
docker compose -f devops/docker-compose.yml up -d db

# 2. Backend (repo root):
pip install -e ".[test]"
DATABASE_URL=postgresql://vf_plans:vf_plans@localhost:55432/vf_plans \
  MCP_USER=dev MCP_PASSWORD=dev python -m backend.run

# 3. Frontend (separate shell):
cd frontend && npm install && npm run dev

# 4. Docs site:
cd docs && npm install && npm run dev
```

## Renderer checks

After installing the backend, frontend and e2e dependencies, run
`npx playwright test --config playwright.renderer.config.ts` from `e2e/`.
This suite serves the real cockpit with a fixed read-only dataset and exercises
HTML from the Export Composer in both appearances at desktop, tablet and phone
widths. It checks column alignment, full-width expansion, filtering, keyboard
access, contrast, contained scrolling and the light print palette without a database.
The regular e2e configuration runs these checks alongside the database-backed flows.

## Layout

- `backend/` - the Python hexagonal package: `domain/`, `usecases/`, `adapters/{http,mcp,store,export}/`
- `frontend/` - the React MVVM cockpit (the Plan Cockpit)
- `renderer/` - the one canonical `REF-Plan` renderer, shared by the cockpit and the Export Composer
- `e2e/` - Playwright e2e specs (the self-contained e2e claims)
- `tests/` - the pytest suite; `tests/deployed/` is the one in-cluster verification suite
- `devops/` - Dockerfile + compose (the released images) + the promotion contract
- `k8s/` - the Helm chart CI publishes (database + identity-realm wiring, the machine door's key, the docs route)
- `docs/` - the Starlight docs site, served under the portal at `/apps/rb-plans`
- `intent.yaml` - the app's CSD-INTENT-01 claims

## Commits

Every commit follows the platform's commit convention: a Conventional Commit subject and no co-author trailer. CI derives the version from the type and blocks release otherwise. The convention is documented on the platform portal's GitOps delivery page, under "Commit convention"; the committed `.pre-commit-config.yaml` checks it locally once installed (`pre-commit install`).
