import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent(
    "INT-PLANS-013",
    "saving in the UI writes a new version rather than overwriting the version that was open",
    async ({ page }) => {
        const id = uniqueId("new-version");
        await createPlanThroughUi(page, id, "New Version Plan");
        await expect(page.locator(".pr-version")).toContainText("v0.1");

        await page.goto(`/plans/${id}/new-item/dependency`);
        await page.getByLabel("Name").fill("Second write");
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);
        await expect(page.locator(".pr-version")).toContainText("v0.2");

        // the earlier version is still readable at its own content.
        await page.goto(`/plans/${id}/versions`);
        await expect(page.locator("table.chrome-table")).toContainText("v0.1");
        await expect(page.locator("table.chrome-table")).toContainText("v0.2");
    }
);

intent(
    "INT-PLANS-014",
    "the version picker lists a plan's versions and presents the decision log entries between two versions as the human-readable diff",
    async ({ page }) => {
        // This journey creates two versions, appends a log entry, then opens the diff.
        // WebKit can exceed the suite's 30-second budget even while each control is ready.
        test.setTimeout(90_000);
        const id = uniqueId("versions-diff");
        await createPlanThroughUi(page, id, "Versions Diff Plan");
        await page.goto(`/plans/${id}/new-item/dependency`);
        await page.getByLabel("Name").fill("Diffed item");
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);

        await page.locator(".pr-row-toggle", { hasText: "Diffed item" }).click();
        await page.getByRole("link", { name: "Edit →" }).click();
        await page.getByLabel("Log text").fill("A log row between versions.");
        await page.getByRole("button", { name: "Append log row" }).click();
        await expect(page.getByLabel("Log text")).toHaveValue("");

        await page.goto(`/plans/${id}/versions`);
        const rows = page.locator("table.chrome-table tbody tr");
        await rows.first().click(); // newest (current) version first, per the picker's own order
        await expect(page.getByRole("heading", { name: /Decision log since/ })).toBeVisible();
        await expect(page.getByText("A log row between versions.")).toBeVisible();
    }
);
