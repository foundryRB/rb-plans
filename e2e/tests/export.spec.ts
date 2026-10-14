import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent(
    "INT-PLANS-020",
    "the exported HTML opened with no network available renders the same plan the UI shows, in the same typography",
    async ({ page, context }) => {
        const id = uniqueId("export-offline");
        await createPlanThroughUi(page, id, "Export Offline Plan");
        await page.goto(`/plans/${id}/new-item/milestone`);
        await page.getByLabel("Name").fill("Offline milestone");
        await page.getByLabel("Due (ISO date)").fill("2026-10-15");
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);

        // The typography the cockpit draws this plan in: the identity's stacks, carried by the
        // renderer's own sheet. The export must match it, whatever identity the sheet was stamped with.
        // The cockpit loads that sheet after the render mounts, so read only once it has styled the plan.
        await expect
            .poll(() => page.locator(".pr-root").evaluate((el) => getComputedStyle(el).getPropertyValue("--font-sans").trim()))
            .not.toBe("");
        const cockpitDisplayFont = await page.locator(".pr-band h1").evaluate((el) => getComputedStyle(el).fontFamily);
        const cockpitMonoFont = await page.locator(".pr-version").evaluate((el) => getComputedStyle(el).fontFamily);

        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("link", { name: "Export" }).click(),
        ]);
        const dir = mkdtempSync(join(tmpdir(), "vf-plans-export-"));
        const filePath = join(dir, "export.html");
        await download.saveAs(filePath);
        const html = readFileSync(filePath, "utf-8");

        // Load the exported bytes directly into a FRESH, offline browser
        // context via setContent - no navigation request of any kind, so
        // this proves the file needs none (an un-embedded dependency - a
        // font, a script - would fail silently and the render would fall
        // back). Deliberately not `goto("file://...")`: WebKit's headless
        // Linux build refuses local file:// navigation in a sandboxed CI
        // runner with an internal error unrelated to this app; setContent
        // tests the identical claim (no external network dependency)
        // without depending on a browser engine's file-URL handling.
        const offlineContext = await page.context().browser()!.newContext({ offline: true });
        const offlinePage = await offlineContext.newPage();
        await offlinePage.setContent(html, { waitUntil: "load" });

        await expect(offlinePage.locator(".pr-band h1")).toContainText("Export Offline Plan");
        await expect(offlinePage.locator(".pr-rail-card", { hasText: "Offline milestone" })).toBeVisible();

        // The same stacks as the cockpit; the browser uses the inlined face or its declared fallback.
        const displayFont = await offlinePage.locator(".pr-band h1").evaluate((el) => getComputedStyle(el).fontFamily);
        expect(displayFont).toBe(cockpitDisplayFont);
        const monoFont = await offlinePage.locator(".pr-version").evaluate((el) => getComputedStyle(el).fontFamily);
        expect(monoFont).toBe(cockpitMonoFont);

        await offlineContext.close();
        void context;
    }
);
