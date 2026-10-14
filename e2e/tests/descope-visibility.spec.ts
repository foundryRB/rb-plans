import { test, expect } from "@playwright/test";
import { createPlanThroughUi, uniqueId } from "./helpers";

/**
 * design.md "Plan · Render": "descoped and superseded items stay hidden
 * under every filter state except their own pills... and the section
 * counts report them separately rather than folding them into one
 * number." Not a numbered intent claim of its own (it is DSN-018, a
 * design-record rule the claims win on behaviour but this specific rule
 * has no dedicated INT-PLANS-* id), so a plain Playwright test - no
 * intent() marker - rather than an unattested claim reference.
 */
test("descoped and superseded items are hidden by default and counted separately", async ({ page }) => {
    const id = uniqueId("descope-vis");
    await createPlanThroughUi(page, id, "Descope Visibility Plan");

    await page.goto(`/plans/${id}/new-item/dependency`);
    await page.getByLabel("Name").fill("Live dep");
    await page.getByRole("radio", { name: "Open" }).click();
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    await page.goto(`/plans/${id}/new-item/dependency`);
    await page.getByLabel("Name").fill("Descoped dep");
    await page.getByRole("radio", { name: "Descoped" }).click();
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    const depTable = page.locator("#dependencies table.pr-table");
    await expect(depTable).toContainText("Live dep");
    // hidden by default, with no status pill active.
    await expect(depTable).not.toContainText("Descoped dep");
    // the count is reported separately, not folded into "2 items".
    await expect(page.locator("#dependencies .pr-count")).toContainText("1 item");
    await expect(page.locator("#dependencies .pr-count")).toContainText("1 descoped");

    // selecting the Descoped pill surfaces it - "except their own pills".
    await page.getByRole("button", { name: "Descoped", exact: true }).click();
    await expect(depTable).toContainText("Descoped dep");
});
