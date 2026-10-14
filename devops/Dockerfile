# The app image (rb-plans-app): the FastAPI backend serving the built
# React cockpit bundle, the REST API and the MCP door, from one image
# (ADR-007).
#
# Three stages: build the cockpit (node), assemble the Python package with
# tests/deployed/ and its runtime dependencies for the in-cluster
# verification Job, then a slim runtime image.

FROM node:22-alpine AS frontend-build
WORKDIR /repo
COPY renderer/ renderer/
COPY frontend/package.json frontend/package-lock.json frontend/
WORKDIR /repo/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/ .
# The canonical renderer source is projected here, at build time, never
# hand-copied (ADR-001): the SAME mechanism `npm run dev`/`test` use
# locally.
RUN node ../renderer/project-to-frontend.mjs
RUN npm run build

FROM python:3.13-slim AS backend
WORKDIR /app
COPY pyproject.toml ./
COPY backend/ backend/
# tests/deployed/ and its runtime dependencies (pytest, csd-pytest-intent,
# httpx) ship in the released image: the verification Job that attests
# claim 042 runs from this image in-cluster, so the production image
# carries that suite too.
COPY tests/deployed/ tests/deployed/
RUN pip install --no-cache-dir . "pytest>=8.3" "csd-pytest-intent~=0.3.0" "httpx>=0.27"
# The canonical renderer source, sibling to backend/ in both a source
# checkout and this image - the Export Composer reads it directly by a
# path computed from that layout (backend/adapters/export/composer.py).
COPY renderer/ renderer/
COPY --from=frontend-build /repo/frontend/dist app/static/
ENV PORT=8000
EXPOSE 8000
CMD ["python", "-m", "backend.run"]
