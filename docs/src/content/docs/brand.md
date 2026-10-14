---
title: Brand
id: DOC-BRAND
type: Reference
status: Active
updated: "2026-09-17"
summary: "The RB Software Engineering identity and the source files that own it."
---

The application wears the RB Software Engineering identity: a near-black stage in dark and paper in light, the lockup (the RB tile, "Software Engineering" over "RB") as the one mark, the brand's green as the primary with the darker `#007a4d` for link and accent text (WCAG AA on the paper ground), system fonts for text and Cascadia Code for identifiers. The product name sits beside the lockup. An exported plan carries the same lockup and neutrals; lane, status and priority colours are data and stay as validated.

## Application source

`frontend/src/styles/theme.css`, `App.tsx` and `Appearance.tsx` own the concrete palette, composition, reading preference and ambient fields. Brand changes are ordinary edits to these files. Components consume existing semantic tokens.

Dark is the default. The Light/Dark reading preference is saved locally. Open side fields and sparse fading particles stay behind content, pause in hidden pages, and stop for reduced motion and print. Reduced transparency suppresses the background decoration. Forms and dense data surfaces are opaque; summary surfaces may use restrained glass. Material and motion are authored choices.

Headings use a stronger sans weight; body text remains regular. Actions have legible labels and visible focus boundaries. State always carries text, never colour alone. Responsive gutters preserve a bounded reading frame.

## Outputs

`renderer/plan-renderer.css` carries the plan presentation, and it is a **vendored copy**: the canonical sheet belongs to the playbook's `bootstrap-plan` skill, which is also where its brand values are stamped from the design hub. Nothing here edits it; a change is made upstream and arrives as a pin bump. `renderer/project-to-frontend.mjs` projects the copy into the cockpit; the export composer embeds the same bytes into standalone HTML. Lane colours remain categorical and distinct from status colours, and stay instrument-owned for that reason: they carry meaning, not brand.
