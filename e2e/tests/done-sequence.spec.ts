import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlanThroughUi, uniqueId } from "./helpers";

intent(
    "INT-PLANS-040",
    "a person with no agent opens the UI, edits an item, records a decision, saves a new version, and downloads a standalone HTML that renders identically offline - in one unbroken sequence",
    async ({ page }) => {
        const id = uniqueId("done-001");

        // Open the UI.
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();

        // Create the plan (the entry into having something to edit).
        await createPlanThroughUi(page, id, "Done Sequence Plan");

        // Edit an item.
        await page.goto(`/plans/${id}/new-item/dependency`);
        await page.getByLabel("Name").fill("Sequence dependency");
        await page.getByRole("button", { name: /Save as next version/ }).click();
        await page.waitForURL(`**/plans/${id}`);

        // Record a decision.
        await page.locator(".pr-row-toggle", { hasText: "Sequence dependency" }).click();
        await page.getByRole("link", { name: "Edit →" }).click();
        await page.getByLabel(/Who/).fill("Sequence Tester");
        await page.getByLabel("Decision").fill("Sequence approved.");
        await page.getByRole("button", { name: "Record a decision" }).click();
        await expect(page.getByText("Sequence approved.")).toBeVisible();

        // Save a new version (the decision-recording write already did;
        // this is the explicit "Save" the form still offers for any other
        // pending field edits).
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(`**/plans/${id}`);

        // Download a standalone HTML.
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("link", { name: "Export" }).click(),
        ]);
        const dir = mkdtempSync(join(tmpdir(), "vf-plans-done-"));
        const filePath = join(dir, "export.html");
        await download.saveAs(filePath);
        const html = readFileSync(filePath, "utf-8");

        // ...that renders identically offline. setContent, not
        // goto("file://...") - see export.spec.ts's comment on why.
        const offlineContext = await page.context().browser()!.newContext({ offline: true });
        const offlinePage = await offlineContext.newPage();
        await offlinePage.setContent(html, { waitUntil: "load" });
        await expect(offlinePage.locator(".pr-band h1")).toContainText("Done Sequence Plan");
        await expect(offlinePage.getByText("Sequence dependency")).toBeVisible();
        await offlineContext.close();
    }
);
