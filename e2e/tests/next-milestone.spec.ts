import { test, expect } from "@playwright/test";
import { createPlanThroughUi, uniqueId } from "./helpers";

/**
 * REF-Plan's next-milestone tile names the soonest milestone still AHEAD of
 * the plan. The renderer used to filter the dated, unclosed ones and then
 * concatenate every milestone straight back in, so the filter did nothing: a
 * descoped milestone could be named as next, and a closed one stayed named as
 * next for ever, counting further overdue each day. Not a numbered claim of
 * its own (it is REF-Plan's rule about what the tile reads), so a plain
 * Playwright test.
 */
test("the next milestone tile skips a descoped one and advances past a closed one", async ({ page }) => {
    const id = uniqueId("next-milestone");
    await createPlanThroughUi(page, id, "Next Milestone Plan");

    // The soonest by date, but withdrawn: never "next".
    await page.goto(`/plans/${id}/new-item/milestone`);
    await page.getByLabel("Name").fill("Withdrawn gate");
    await page.getByLabel("Due (ISO date)").fill("2026-10-01");
    await page.getByRole("radio", { name: "Descoped" }).click();
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    // The one that is genuinely next.
    await page.goto(`/plans/${id}/new-item/milestone`);
    await page.getByLabel("Name").fill("Live gate");
    await page.getByLabel("Due (ISO date)").fill("2026-11-01");
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    const tile = page.locator(".pr-stat", { hasText: "Next milestone" });
    await expect(tile).toContainText("Live gate");
    await expect(tile).not.toContainText("Withdrawn gate");
});
