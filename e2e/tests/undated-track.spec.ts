import { test, expect } from "@playwright/test";
import { createPlanThroughUi, uniqueId } from "./helpers";

/**
 * REF-Plan: "The timeline and the tables' due column consume only the ISO
 * fields." A bar is a window, so it is drawn only for a track that states
 * both ends. The renderer used to fall back to the plan's horizon for a
 * missing start or end, which drew every undated track as a full-width bar:
 * a window the dataset never stated, indistinguishable from a track that
 * really spans the plan. Not a numbered claim of its own (it is REF-Plan's
 * rule about what the timeline reads), so a plain Playwright test.
 */
test("an undated track keeps its row and draws no bar; a dated one draws its window", async ({ page }) => {
    const id = uniqueId("undated-track");
    await createPlanThroughUi(page, id, "Undated Track Plan");

    await page.goto(`/plans/${id}/new-item/track`);
    await page.getByLabel("Name").fill("Windowed work");
    await page.getByLabel("Start").fill("2030-02-01");
    await page.getByLabel("End").fill("2030-03-01");
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    await page.goto(`/plans/${id}/new-item/track`);
    await page.getByLabel("Name").fill("Floating work");
    await page.getByRole("button", { name: /Save as next version/ }).click();
    await page.waitForURL(`**/plans/${id}`);

    const schedule = page.locator("#schedule svg");
    // both tracks keep a labelled row
    await expect(schedule.locator("text", { hasText: "Windowed work" }).first()).toBeVisible();
    await expect(schedule.locator("text", { hasText: "Floating work" })).toBeVisible();

    // a bar carries a <title> naming its track: the dated track has one, the undated none
    const bars = schedule.locator("rect:has(title)");
    await expect(bars.filter({ hasText: "Windowed work" }).first()).toBeAttached();
    const undatedBars = await bars.evaluateAll((rects) =>
        rects.filter((r) => (r.querySelector("title")?.textContent || "").includes("Floating work")).length,
    );
    expect(undatedBars, "an undated track drew a bar").toBe(0);
});
