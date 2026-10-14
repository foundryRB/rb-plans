#!/usr/bin/env node
/**
 * Project the one canonical renderer source (this directory's
 * plan-renderer.{js,css}) into frontend/public/renderer/, so
 * the cockpit's Plan Render view can load it as a static asset and call
 * `PlanRenderer.render()` against the fetched dataset - the SAME function
 * the Export Composer's output runs client-side too. The copy is mechanical
 * and regenerated on every dev/build (see frontend/package.json's
 * predev/prebuild), never hand-edited in place (ADR-001, INT-PLANS-004).
 * frontend/public/renderer/ is gitignored: it exists only as this script's
 * output. Lives in renderer/ beside the source it projects, run from
 * frontend/ via a relative `node ../renderer/project-to-frontend.mjs`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rendererSrc = here;
const dest = join(here, "..", "frontend", "public", "renderer");

if (!existsSync(rendererSrc)) {
    console.error(`renderer source not found at ${rendererSrc}`);
    process.exit(1);
}

const pin = JSON.parse(readFileSync(join(rendererSrc, "PINNED.json"), "utf8"));
mkdirSync(dest, { recursive: true });
for (const name of readdirSync(dest)) {
    if (/^plan-renderer(?:\.[a-f0-9]{64})?\.(?:js|css)$/.test(name)) {
        unlinkSync(join(dest, name));
    }
}
for (const name of ["plan-renderer.js", "plan-renderer.css"]) {
    const bytes = readFileSync(join(rendererSrc, name));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== pin.files[name]) {
        throw new Error(`${name} differs from renderer/PINNED.json`);
    }
    const ext = extname(name);
    const asset = `${name.slice(0, -ext.length)}.${digest}${ext}`;
    writeFileSync(join(dest, asset), bytes);
}

console.log(`projected renderer source -> ${dest}`);
