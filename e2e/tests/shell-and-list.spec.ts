import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent("INT-PLANS-001", "the engine serves the Plan Cockpit application shell at the root path", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Vodafone Plans/);
    await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
});

intent(
    "INT-PLANS-006",
    "the plans list shows every stored plan, and opening one renders it through the REF-Plan render",
    async ({ page }) => {
        const id = uniqueId("shell-list");
        await createPlanThroughUi(page, id, "Shell List Plan");

        await page.goto("/");
        // Match on the id: multiple Playwright PROJECTS share one backing
        // Postgres within a single `playwright test` invocation, so even
        // a title with the id suffixed on is not unique across projects
        // by a leading-words substring match.
        const row = page.locator("tr", { hasText: id });
        await expect(row).toBeVisible();

        await row.getByRole("button", { name: "Open" }).click();
        await page.waitForURL(`**/plans/${id}`);
        await expect(page.locator(".pr-band h1")).toContainText("Shell List Plan");
    }
);
