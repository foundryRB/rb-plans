import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import AxeBuilder from "@axe-core/playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent(
    "INT-PLANS-037",
    "every interactive control on the cockpit's shipped screens is reachable and operable by keyboard alone, with a visible focus indicator",
    async ({ page }) => {
        const id = uniqueId("keyboard");
        await createPlanThroughUi(page, id, "Keyboard Plan");

        await page.goto("/");
        // Tab from the top of the page until the first plans-table row
        // receives focus, then operate it with the keyboard alone.
        // Match on the id, not the title's leading words: multiple
        // Playwright PROJECTS (chromium/firefox/webkit) share one backing
        // Postgres across one `playwright test` invocation, so a
        // substring shared by every run's title (even with the id
        // suffixed on) still matches more than one row once a second
        // project's own run has landed its plan.
        const row = page.locator("tr", { hasText: id });
        await row.focus();
        await expect(row).toBeFocused();
        const outline = await row.evaluate((el) => getComputedStyle(el).outlineStyle);
        // jsdom-free real browser check: a visible focus ring is either the
        // element's own outline or the UA default, never `none`.
        expect(outline).not.toBe("none");

        await page.keyboard.press("Enter");
        await page.waitForURL(`**/plans/${id}`);
    }
);

intent(
    "INT-PLANS-038",
    "the cockpit's shipped screens and the exported artifact meet WCAG AA contrast for text and for the non-text marks that carry meaning",
    async ({ page }) => {
        const id = uniqueId("contrast");
        await createPlanThroughUi(page, id, "Contrast Plan");
        await page.goto(`/plans/${id}/new-item/dependency`);
        await page.getByLabel("Name").fill("Contrast dep");
        await page.getByRole("radio", { name: "High" }).click();
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);

        const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
        const contrastViolations = results.violations.filter((v) => v.id === "color-contrast");
        expect(contrastViolations, JSON.stringify(contrastViolations, null, 2)).toEqual([]);

        // The claim names the exported artifact explicitly - the live
        // cockpit's tokens are not the ones a downloaded, network-isolated
        // file actually carries (renderer/plan-renderer.css's own
        // vocabulary, never the chrome's), so scan the real download too.
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("link", { name: "Export" }).click(),
        ]);
        const dir = mkdtempSync(join(tmpdir(), "rb-plans-contrast-"));
        const filePath = join(dir, "export.html");
        await download.saveAs(filePath);
        const html = readFileSync(filePath, "utf-8");
        const offlineContext = await page.context().browser()!.newContext({ offline: true });
        const offlinePage = await offlineContext.newPage();
        // setContent, not goto("file://...") - see export.spec.ts's comment.
        await offlinePage.setContent(html, { waitUntil: "load" });
        const exportResults = await new AxeBuilder({ page: offlinePage }).withTags(["wcag2aa"]).analyze();
        const exportContrastViolations = exportResults.violations.filter((v) => v.id === "color-contrast");
        expect(exportContrastViolations, JSON.stringify(exportContrastViolations, null, 2)).toEqual([]);
        await offlineContext.close();
    }
);

intent(
    "INT-PLANS-039",
    "RB typography is applied to headings and body text in the cockpit",
    async ({ page }) => {
        await page.goto("/");
        const titleFont = await page.locator(".rb-lockup b").first().evaluate((el) => getComputedStyle(el).fontFamily);
        expect(titleFont).toContain("Segoe UI");
        const bodyFont = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
        expect(bodyFont).toContain("Segoe UI");
    }
);
