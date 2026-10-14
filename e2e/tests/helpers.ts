import type { Page } from "@playwright/test";

/** Creates a plan through the real UI (Plans · Table -> New plan -> Plan ·
 * Setup) and returns its id. Every e2e spec that needs a starting plan
 * goes through this - never a direct API call - because the point of
 * these specs is that a person with no agent can do the whole thing.
 */
export async function createPlanThroughUi(page: Page, id: string, title: string): Promise<void> {
    await page.goto("/plans/new");
    await page.getByLabel("Id").fill(id);
    // The id rides along in the title too: the plans list and any
    // keyboard-focus test locate rows by title text, and this suite's
    // database accumulates plans across runs (no per-test isolation), so
    // a title with no unique component collides with an earlier run's
    // plan of the same name.
    await page.getByLabel("Title").fill(`${title} ${id}`);
    await page.getByLabel("Horizon start (required)").fill("2026-09-01");
    await page.getByLabel("Horizon end (required)").fill("2026-12-01");
    await page.getByRole("button", { name: /Save as v0\.1/ }).click();
    await page.waitForURL(`**/plans/${id}`);
}

export function uniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
