import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test.setTimeout(120_000);

const fixture = fileURLToPath(new URL("../fixtures/rendering-plan.json", import.meta.url));
const dataset = JSON.parse(readFileSync(fixture, "utf8"));
const root = fileURLToPath(new URL("../../", import.meta.url));
const exported = execFileSync(process.env.PYTHON || "python", ["-c",
    "import json,sys; from backend.adapters.export.composer import compose_export_html; sys.stdout.buffer.write(compose_export_html(json.load(open(sys.argv[1], encoding='utf-8'))))", fixture,
], { cwd: root, maxBuffer: 8 * 1024 * 1024 }).toString("utf8");

for (const surface of ["cockpit", "export"] as const) {
    for (const theme of ["light", "dark"] as const) {
        for (const width of [1440, 1024, 390]) {
            test(`${surface} ${theme} ${width}: readable expansion and contained scrolling`, async ({ page }, info) => {
                const errors: string[] = [];
                page.on("pageerror", e => errors.push(e.message));
                await page.setViewportSize({ width, height: 1000 });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await page.route("**/api/plans/rendering-review", route => route.fulfill({ json: dataset }));
                if (surface === "cockpit") {
                    await page.goto("/plans/rendering-review");
                    if (theme === "light") await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
                } else {
                    await page.route("**/rendering-export", route => route.fulfill({ contentType: "text/html", body: exported }));
                    await page.goto("/rendering-export");
                }
                await expect(page.locator(".pr-root")).toBeVisible();
                const lanes = page.getByRole("group", { name: "Filter by lane" });
                await expect(lanes.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
                await lanes.getByRole("button", { name: "MVV", exact: true }).click();
                await expect(lanes.getByRole("button", { name: "MVV", exact: true })).toHaveAttribute("aria-pressed", "true");
                await expect(page.locator('[data-row-id="TRK-06"]')).toHaveCount(0);
                await lanes.getByRole("button", { name: "All", exact: true }).click();
                for (const id of ["DEP-007", "TRK-06", "RSK-01"]) {
                    const row = page.locator(`[data-row-id="${id}"]`);
                    const toggle = row.locator(".pr-row-toggle");
                    await toggle.focus();
                    await toggle.press("Enter");
                    await expect(toggle).toHaveAttribute("aria-expanded", "true");
                    const detail = row.locator(".pr-detail");
                    await expect(detail).toBeVisible();
                    const dimensions = await row.evaluate(el => {
                        const table = el.closest("table")!;
                        const summary = el.querySelector(".pr-summary-row")!;
                        const cell = el.querySelector(".pr-detail-row td") as HTMLTableCellElement;
                        return { headers: table.querySelectorAll("th").length, cells: summary.children.length,
                            span: cell.colSpan, detail: cell.getBoundingClientRect().width, table: table.getBoundingClientRect().width };
                    });
                    expect(dimensions.cells).toBe(dimensions.headers);
                    expect(dimensions.span).toBe(dimensions.headers);
                    expect(dimensions.detail).toBeGreaterThan(dimensions.table * .95);
                    if (surface === "cockpit") await expect(detail.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/plans/rendering-review/items/${id}`);
                    else await expect(detail.getByRole("link", { name: "Edit" })).toHaveCount(0);
                }
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                expect(overflow).toBeLessThanOrEqual(1);
                if (width === 390) {
                    const region = page.getByRole("region", { name: "Dependencies table" });
                    expect(await region.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
                }
                const axe = await new AxeBuilder({ page }).include(".pr-root").withTags(["wcag2a", "wcag2aa"]).analyze();
                expect(axe.violations).toEqual([]);
                await page.locator("#dependencies").scrollIntoViewIfNeeded();
                await page.screenshot({ path: info.outputPath(`${surface}-${theme}-${width}.png`) });
                expect(errors).toEqual([]);
                await page.locator('[data-row-id="DEP-007"] .pr-row-toggle').click();
                await expect(page.locator('[data-row-id="DEP-007"] .pr-detail-row')).toBeHidden();
                await page.emulateMedia({ media: "print" });
                await expect(page.locator(".pr-sticky")).toBeHidden();
                expect(await page.locator(".pr-root").evaluate(el => getComputedStyle(el).colorScheme)).toBe("light");
            });
        }
    }
}
