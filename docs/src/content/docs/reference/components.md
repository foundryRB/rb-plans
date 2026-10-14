---
title: Components
type: Reference
summary: "The app's components and how they fit together."
id: DOC-COMPONENTS
status: Active
updated: "2026-10-04"
---

Vodafone Plans ships an application image and a documentation image. The application serves the cockpit and its API doors; the documentation image serves this reference site.

## Components

- `app` - the released application image: a Python/FastAPI hexagonal backend serving the built React cockpit bundle, the REST API, and the `/mcp` door, from one image.
- `docs` - this site, served under the docs portal at `/apps/vf-plans`.

## Repository layout

```text
backend/     the Python hexagonal package - domain/, usecases/, adapters/{http,mcp,store,export}/
frontend/    the React MVVM cockpit
renderer/    the one canonical REF-Plan renderer source + its projection script
e2e/         playwright-intent specs
tests/       the pytest suite; tests/deployed/ is the one in-cluster suite (claim 042)
devops/      Dockerfile, docker-compose.yml, promotion.yaml
k8s/         the Helm chart CI publishes
docs/        this Starlight site
intent.yaml  the 46 CSD-INTENT-01 claims
```

See [Architecture](../architecture/) for the layered view and the decision records, and [Traceability](../traceability/) for the requirement-to-claim map.
