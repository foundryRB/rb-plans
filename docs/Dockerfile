# syntax=docker/dockerfile:1
# The docs image (vf-plans-docs): built like any other image (CI), served by
# nginx under DOCS_BASE so the portal's no-rewrite route resolves
# (INT-FOUNDRY-018).
FROM node:22-alpine AS build
ARG DOCS_BASE=/
WORKDIR /app
COPY package.json package-lock.json ./
# @psa-department-of-engineering/* resolves from the public npm registry
# (csd-library ADR-0003), so this needs no .npmrc, no build secret, and no
# credential of any kind (INT-FOUNDRY-039).
RUN npm ci --no-audit --no-fund
COPY . .
ENV DOCS_BASE=${DOCS_BASE}
RUN npm run build

FROM nginx:1.27-alpine
ARG DOCS_BASE=/
COPY --from=build /app/dist /usr/share/nginx/html${DOCS_BASE}
