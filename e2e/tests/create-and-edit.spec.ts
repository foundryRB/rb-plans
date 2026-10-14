import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent(
    "INT-PLANS-007",
    "a person with no agent creates a new plan from the UI and lands on that plan's render, stored as its first version",
    async ({ page }) => {
        const id = uniqueId("create");
        await createPlanThroughUi(page, id, "Created Plan");
        await expect(page.locator(".pr-version")).toContainText("v0.1");
    }
);

intent(
    "INT-PLANS-008",
    "a person with no agent adds and edits dataset items through a form shaped for that item's type",
    async ({ page }) => {
        const id = uniqueId("edit-item");
        await createPlanThroughUi(page, id, "Edit Item Plan");

        await page.goto(`/plans/${id}/new-item/dependency`);
        await expect(page.getByRole("heading", { name: "New dependency" })).toBeVisible();
        // A dependency form carries a Priority row; a risk form does not -
        // the shape is per type, not one generic form.
        await expect(page.getByRole("radiogroup", { name: "Priority" })).toBeVisible();

        await page.getByLabel("Name").fill("Vendor signs MSA");
        await page.getByLabel("Owner").fill("Sales");
        await page.getByRole("radio", { name: "High" }).click();
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);
        await expect(page.locator(".pr-table", { hasText: "Vendor signs MSA" })).toBeVisible();

        await page.goto(`/plans/${id}/new-item/risk`);
        await expect(page.getByRole("heading", { name: "New risk" })).toBeVisible();
        await expect(page.getByRole("radiogroup", { name: "Priority" })).toHaveCount(0);
    }
);

intent(
    "INT-PLANS-009",
    "a person with no agent flips an item's status from the UI, and the new status is what the render then shows",
    async ({ page }) => {
        const id = uniqueId("status-flip");
        await createPlanThroughUi(page, id, "Status Flip Plan");
        await page.goto(`/plans/${id}/new-item/dependency`);
        await page.getByLabel("Name").fill("Flip me");
        await page.getByRole("radio", { name: "Open" }).click();
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);
        // Dependencies, workstreams and risks each render their own
        // .pr-table - scope to the dependency row's own table by section.
        const depTable = page.locator("#dependencies table.pr-table");
        await expect(depTable).toContainText("Open");

        await page.locator(".pr-row-toggle", { hasText: "Flip me" }).click();
        await page.getByRole("link", { name: "Edit →" }).click();
        await page.getByRole("radio", { name: "Decided" }).click();
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(`**/plans/${id}`);
        await expect(depTable).toContainText("Decided");
        await expect(depTable).not.toContainText("Open");
    }
);
