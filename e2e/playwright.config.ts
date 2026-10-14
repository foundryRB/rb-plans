import { defineConfig, devices } from "@playwright/test";

/**
 * The 15 self-contained e2e claims (Chromium, Firefox and WebKit
 * at current versions), run against the app's own stack - a real
 * PostgreSQL (DATABASE_URL, exported by test.yml's services: container in
 * CI, or devops/docker-compose.yml's db service locally) and the full
 * backend+frontend, both started as webServer entries so `npx playwright
 * test` runs cold. PLANS_AUTH_SCOPE=mcp serves the human surfaces as the
 * chart does behind its sign-in sidecar, which this local/CI stack does
 * not run (ADR-008).
 */
export default defineConfig({
    testDir: "./tests",
    timeout: 30_000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://127.0.0.1:5183",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
    ],
    webServer: [
        {
            command: "python -m backend.run",
            cwd: "..",
            env: {
                DATABASE_URL: process.env.DATABASE_URL || "",
                MCP_USER: "e2e",
                MCP_PASSWORD: "e2e",
                PLANS_AUTH_SCOPE: "mcp",
                PORT: "8091",
            },
            url: "http://127.0.0.1:8091/api/health",
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
        {
            // --host 127.0.0.1 is load-bearing: vite's bare "localhost"
            // default binds only the IPv6 loopback on some hosts, which
            // this config's IPv4 health-check URL (and Playwright's own
            // webServer probe) cannot reach - it looks like a slow start
            // and times out, not like a bind failure.
            command: "npm run dev -- --port 5183 --host 127.0.0.1",
            cwd: "../frontend",
            env: { VITE_API_PROXY_TARGET: "http://127.0.0.1:8091" },
            url: "http://127.0.0.1:5183",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
});
