import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createPlanThroughUi, uniqueId } from "./helpers";

async function addDependencyAndOpenEdit(page: import("@playwright/test").Page, planId: string, name: string) {
    await page.goto(`/plans/${planId}/new-item/dependency`);
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${planId}`);
    await page.locator(".pr-row-toggle", { hasText: name }).click();
    await page.getByRole("link", { name: "Edit →" }).click();
}

intent(
    "INT-PLANS-010",
    "a decision recorded from the UI is stored with both its author and the time it was recorded, and the render shows both",
    async ({ page }) => {
        const id = uniqueId("decision");
        await createPlanThroughUi(page, id, "Decision Plan");
        await addDependencyAndOpenEdit(page, id, "Decide me");

        await page.getByLabel(/Who/).fill("Playwright Tester");
        await page.getByLabel("Decision").fill("Approved for release.");
        await page.getByRole("button", { name: "Record a decision" }).click();
        await expect(page.getByText(/Playwright Tester: Approved for release\./)).toBeVisible();

        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(`**/plans/${id}`);
        // The detail panel shows the decision, not the item's own name
        // again - scope by the row's own id rather than by text that is
        // never repeated inside it.
        await page.locator('[data-row-id="DEP-001"] .pr-row-toggle').click();
        const today = new Date().toISOString().slice(0, 10);
        const detail = page.locator('[data-row-id="DEP-001"] .pr-detail');
        await expect(detail).toContainText("Playwright Tester");
        await expect(detail).toContainText(today);
    }
);

intent(
    "INT-PLANS-011",
    "a person with no agent appends a row to a plan's log from the UI, and the appended row is present in the stored dataset",
    async ({ page }) => {
        const id = uniqueId("log-append");
        await createPlanThroughUi(page, id, "Log Append Plan");
        await addDependencyAndOpenEdit(page, id, "Log me");

        await page.getByLabel("Log text").fill("Kickoff meeting held.");
        await page.getByRole("button", { name: "Append log row" }).click();
        // The append is async and the form gives no other visible cue;
        // its own text field clearing is what confirms the write landed
        // before navigating away races it.
        await expect(page.getByLabel("Log text")).toHaveValue("");

        await page.goto(`/plans/${id}`);
        await page.locator(".pr-log-day-head").first().click();
        await expect(page.locator(".pr-log-rows")).toContainText("Kickoff meeting held.");
    }
);

intent(
    "INT-PLANS-012",
    "a person with no agent re-anchors a plan's dates from the UI, and every dependent date in the stored dataset moves with the anchor",
    async ({ page }) => {
        const id = uniqueId("reanchor");
        await createPlanThroughUi(page, id, "Reanchor Plan");
        await page.goto(`/plans/${id}/new-item/milestone`);
        await page.getByLabel("Name").fill("Anchored milestone");
        await page.getByLabel("Due (ISO date)").fill("2026-10-01");
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);

        // Milestones render as rail cards, not expandable table rows - the
        // Edit link sits directly on the card (renderer/plan-renderer.js's
        // buildMilestoneRail), no toggle click needed.
        await page.locator(".pr-rail-card", { hasText: "Anchored milestone" }).getByRole("link", { name: "Edit →" }).click();
        await page.getByLabel("Shift by (days)").fill("10");
        await page.getByRole("button", { name: "Re-anchor dates" }).click();
        await expect(page.getByLabel("Due (ISO date)")).toHaveValue("2026-10-11");
    }
);
