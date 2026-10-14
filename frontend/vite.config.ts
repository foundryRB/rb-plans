import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend serves the built bundle from app/static/ (devops/Dockerfile);
// /api and /mcp are the same origin in production. In dev, proxy both to a
// locally running backend - uvicorn on :8000 by default (backend/run.py),
// overridable so e2e/playwright.config.ts can point at its own instance
// without colliding with a developer's already-running one.
const target = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": target,
            "/mcp": target,
        },
    },
    build: {
        outDir: "dist",
    },
});
