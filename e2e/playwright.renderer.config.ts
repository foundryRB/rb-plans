import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.PLANS_RENDERER_PORT || 5183);
const url = `http://127.0.0.1:${port}`;

// Rendering regressions exercise the shipped UI with a deterministic read-only dataset.
export default defineConfig({
    ...base,
    testMatch: "renderer-layout.spec.ts",
    use: { ...base.use, baseURL: url },
    webServer: {
        command: `npm run dev -- --port ${port} --host 127.0.0.1`,
        cwd: "../frontend",
        url,
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
