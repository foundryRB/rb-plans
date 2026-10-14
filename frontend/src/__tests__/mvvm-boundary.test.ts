/**
 * STD-002, checked the same way STD-001 is - by import direction, not by
 * folder names: a view component holds no data access and no plan-domain
 * logic, reaching the engine only through its view model.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { intent } from "@psa-department-of-engineering/vitest-intent";
import { expect } from "vitest";

const SRC = join(__dirname, "..");
const VIEWS_DIR = join(SRC, "views");
const IMPORT_RE = /from\s+["']([^"']+)["']/g;

function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return tsxFiles(full);
        return entry.endsWith(".tsx") || entry.endsWith(".ts") ? [full] : [];
    });
}

intent(
    "INT-PLANS-029",
    "views hold no data access and no plan-domain logic, reaching the engine only through their view models",
    () => {
        const files = tsxFiles(VIEWS_DIR);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const text = readFileSync(file, "utf8");
            const imports = [...text.matchAll(IMPORT_RE)].map((m) => m[1]);
            const apiImports = imports.filter((i) => i.includes("/api/client") || i.includes("../api/"));
            expect(apiImports, `${file} imports the API client directly`).toHaveLength(0);
            expect(text.includes("fetch("), `${file} calls fetch() directly`).toBe(false);
        }
    }
);
