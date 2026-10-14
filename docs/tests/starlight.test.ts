/**
 * STARLIGHT bundle, vitest implementation.
 *
 * Walks src/content/docs/** for markdown files, parses their frontmatter,
 * and asserts each claim from intent.yaml.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { intent } from "@psa-department-of-engineering/vitest-intent";

const DOCS_DIR = join(process.cwd(), "src", "content", "docs");
const VALID_TYPES = new Set([
  "Overview",
  "Guide",
  "Standard",
  "Reference",
  "Template",
  "Intent",
  "Flow",
  "Module",
]);
const VALID_STATUSES = new Set(["Draft", "Active", "Deprecated"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

// Page-structure detection regexes (operate on the body, after frontmatter).
const H2_RE = /^##\s+\S/;                       // a level-2 heading line
const NUMBERED_H_RE = /^#{1,6}\s+\d+[.)]?\s/;   // a heading whose text starts with a number
const ORDERED_LIST_RE = /^\s*\d+[.)]\s+\S/;     // an ordered-list item
const UNORDERED_LIST_RE = /^\s*[-*+]\s+\S/;     // an unordered-list item
const TABLE_ROW_RE = /^\s*\|/;                  // a table row
// A fenced block, indented or not: three or more backticks or tildes, closed by the same marker (\1).
// Blocks whose info string starts with `mermaid` are diagrams; every fence is code, exempt from prose rules.
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n[ \t]*\1[ \t]*$/gm;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const MDX_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/g;
const VIEWPOINTS = ["Business", "Functional", "Technical"];   // the module page's three readers
const ADR_ID_RE = /\bADR-\d{3,4}\b/gi;                    // an ADR identifier in prose, any case
const DECISION_TARGET_RE = /decisions\/adr-/i;              // a target that names one decision page
// Every place a link target lives: a markdown link `](target)`, a reference definition `[x]: target`,
// and an href attribute (HTML anchors and Starlight's LinkCard alike, quoted or as a JSX string).
const LINK_TARGET_RE = /\]\(\s*([^)\s]+)[^)]*\)|^[ \t]*\[[^\]]+\]:[ \t]*(\S+)|\bhref\s*=\s*\{?\s*["']([^"']+)["']\s*\}?/gim;

interface Doc {
  path: string;          // path relative to DOCS_DIR
  frontmatter: Record<string, string>;
  body: string;          // markdown after the frontmatter block
}

function* walkMarkdown(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (st.isFile() && (extname(name) === ".md" || extname(name) === ".mdx")) {
      yield full;
    }
  }
}

function parseFrontmatter(text: string): Record<string, string> | null {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function extractBody(text: string): string {
  // Everything after the closing frontmatter delimiter. If there is no
  // frontmatter, the whole text is the body.
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return text;
  return text.slice(m[0].length);
}

function loadDocs(): Doc[] {
  const docs: Doc[] = [];
  for (const file of walkMarkdown(DOCS_DIR)) {
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text);
    if (fm === null) continue;
    docs.push({
      path: relative(DOCS_DIR, file),
      frontmatter: fm,
      body: extractBody(text),
    });
  }
  return docs;
}

// --- page-structure helpers (lenient, line-oriented) ---

function bodyLines(body: string): string[] {
  return body.split("\n");
}

/**
 * True when some non-empty, non-heading prose exists "before the first section",
 * read leniently: a reader must meet real introductory prose, not a page built
 * only from headings and lists.
 *
 * Lenient by design (per INT-STARLIGHT-007): an optional leading navigation or
 * "Read next" block is allowed before the intro, and that block is often itself
 * a heading plus a link list (for example a `## Navigation` section). So rather
 * than failing at the very first `## ` (which would reject every page that opens
 * with such a block), we require that a prose line appears somewhere before the
 * page's LAST level-2 heading. That proves the page interleaves prose with its
 * section structure rather than being pure scaffolding, while tolerating any
 * leading preamble. Prose = a non-empty line that is not a heading, not a list
 * item, not a table row, and not inside a fenced code block. A page with no `##`
 * at all is left to INT-STARLIGHT-008.
 */
function hasIntroBeforeFirstH2(body: string): boolean {
  const lines = bodyLines(body);

  // Index of the last level-2 heading; -1 if there is none.
  let lastH2 = -1;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && H2_RE.test(lines[i])) lastH2 = i;
  }

  inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line === "") continue;
    if (line.startsWith("#")) continue;        // heading, not prose
    if (ORDERED_LIST_RE.test(raw)) continue;   // list item, not prose
    if (UNORDERED_LIST_RE.test(raw)) continue; // list item (nav links), not prose
    if (TABLE_ROW_RE.test(raw)) continue;      // table row, not prose
    // A prose line. It satisfies the contract only if it sits before the last
    // section heading (interleaved with structure), or the page has no `##` yet
    // (then INT-STARLIGHT-008 carries the "must have a section" half).
    if (lastH2 === -1 || i < lastH2) return true;
  }
  return false;
}

function hasH2(body: string): boolean {
  return bodyLines(body).some((line) => H2_RE.test(line));
}

/**
 * Starlight splash / hero pages (`template: splash`) render their content from
 * frontmatter (`hero:`) rather than body sections, so they legitimately carry
 * no `## ` heading. The structure claims exempt them.
 */
function isSplash(frontmatter: Record<string, string>): boolean {
  return frontmatter["template"] === "splash";
}

function hasOrderedList(body: string): boolean {
  let inFence = false;
  for (const raw of bodyLines(body)) {
    if (raw.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (ORDERED_LIST_RE.test(raw)) return true;
  }
  return false;
}

function namedH2(body: string, name: string): boolean {
  const want = name.toLowerCase();
  return bodyLines(body).some((line) => {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    return m !== null && m[1].trim().toLowerCase() === want;
  });
}

function countNumberedHeadings(body: string): number {
  let inFence = false;
  let n = 0;
  for (const raw of bodyLines(body)) {
    if (raw.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (NUMBERED_H_RE.test(raw)) n += 1;
  }
  return n;
}

/** The bodies of the page's fenced Mermaid blocks, one string each. */
function mermaidBlocks(body: string): string[] {
  const blocks: string[] = [];
  for (const m of body.matchAll(FENCE_RE)) {
    if (m[2].trim().toLowerCase().startsWith("mermaid")) blocks.push(m[3]);
  }
  return blocks;
}

function hasSequenceDiagram(body: string): boolean {
  return mermaidBlocks(body).some((b) => /\bsequenceDiagram\b/.test(b));
}

function hasDomainModel(body: string): boolean {
  return mermaidBlocks(body).some((b) => /\b(classDiagram|erDiagram)\b/.test(b));
}

/** The page's prose: its body with fenced code, inline code and MDX comments removed. */
function prose(body: string): string {
  return body.replace(FENCE_RE, "").replace(INLINE_CODE_RE, "").replace(MDX_COMMENT_RE, "");
}

/** A viewpoint is present as a level-2 heading or as a Starlight tab label, in prose. */
function hasViewpoint(body: string, name: string): boolean {
  const text = prose(body);
  if (namedH2(text, name)) return true;
  return new RegExp(`<TabItem\\b[^>]*\\blabel=["']${name}["']`, "i").test(text);
}

/** The decisions collection: every page under a `decisions` folder, at any depth. */
function inDecisions(path: string): boolean {
  return path.split(/[\\/]/).includes("decisions");
}

/** The link targets a page's prose carries, and that prose with the targets removed. */
function linkTargets(text: string): { targets: string[]; rest: string } {
  const targets: string[] = [];
  const rest = text.replace(LINK_TARGET_RE, (whole, a, b, c) => {
    targets.push((a ?? b ?? c) as string);
    return whole.startsWith("](") ? "]()" : "";
  });
  return { targets, rest };
}

import { describe, expect } from "vitest";

describe("STARLIGHT bundle", () => {
  const docs = loadDocs();

  intent("INT-STARLIGHT-001", "every doc has a non-empty title", () => {
    const offenders = docs
      .filter((d) => !d.frontmatter["title"] || d.frontmatter["title"].length === 0)
      .map((d) => d.path);
    expect(offenders, `docs missing title: ${offenders.join(", ")}`).toEqual([]);
  });

  intent("INT-STARLIGHT-002", "every doc has a non-empty id", () => {
    const offenders = docs
      .filter((d) => !d.frontmatter["id"] || d.frontmatter["id"].length === 0)
      .map((d) => d.path);
    expect(offenders, `docs missing id: ${offenders.join(", ")}`).toEqual([]);
  });

  intent("INT-STARLIGHT-003", "doc ids are unique across the collection", () => {
    const ids = new Map<string, string[]>();
    for (const d of docs) {
      const id = d.frontmatter["id"];
      if (!id) continue;
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id)!.push(d.path);
    }
    const dupes = [...ids.entries()].filter(([, paths]) => paths.length > 1);
    const msg = dupes.map(([id, paths]) => `${id}: ${paths.join(" + ")}`).join("; ");
    expect(dupes, `duplicate ids: ${msg}`).toEqual([]);
  });

  intent("INT-STARLIGHT-004", "every doc has a valid type", () => {
    const offenders = docs
      .filter((d) => !VALID_TYPES.has(d.frontmatter["type"]))
      .map((d) => `${d.path} (type=${d.frontmatter["type"]})`);
    expect(offenders, `docs with invalid type: ${offenders.join(", ")}`).toEqual([]);
  });

  intent("INT-STARLIGHT-005", "every doc has a valid status", () => {
    const offenders = docs
      .filter((d) => !VALID_STATUSES.has(d.frontmatter["status"]))
      .map((d) => `${d.path} (status=${d.frontmatter["status"]})`);
    expect(offenders, `docs with invalid status: ${offenders.join(", ")}`).toEqual([]);
  });

  intent("INT-STARLIGHT-006", "every doc has updated as YYYY-MM-DD", () => {
    const offenders = docs
      .filter((d) => !ISO_DATE_RE.test(d.frontmatter["updated"] ?? ""))
      .map((d) => `${d.path} (updated=${d.frontmatter["updated"]})`);
    expect(offenders, `docs with missing/invalid updated: ${offenders.join(", ")}`).toEqual([]);
  });

  intent(
    "INT-STARLIGHT-007",
    "every doc opens with intro prose before its first level-2 heading",
    () => {
      const offenders = docs
        .filter((d) => !isSplash(d.frontmatter))
        .filter((d) => !hasIntroBeforeFirstH2(d.body))
        .map((d) => d.path);
      expect(
        offenders,
        `docs with no intro prose before the first ## heading: ${offenders.join(", ")}`,
      ).toEqual([]);
    },
  );

  intent("INT-STARLIGHT-008", "every doc has at least one level-2 heading", () => {
    const offenders = docs
      .filter((d) => !isSplash(d.frontmatter))
      .filter((d) => !hasH2(d.body))
      .map((d) => d.path);
    expect(
      offenders,
      `docs with no level-2 (##) heading: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  intent(
    "INT-STARLIGHT-009",
    "every Flow page has a sequenceDiagram and a steps section",
    () => {
      const flows = docs.filter((d) => d.frontmatter["type"] === "Flow");
      const offenders = flows
        .filter((d) => {
          const hasSteps = namedH2(d.body, "Steps") || hasOrderedList(d.body);
          return !(hasSequenceDiagram(d.body) && hasSteps);
        })
        .map((d) => {
          const missing: string[] = [];
          if (!hasSequenceDiagram(d.body)) missing.push("sequenceDiagram");
          if (!(namedH2(d.body, "Steps") || hasOrderedList(d.body))) {
            missing.push("steps (## Steps or an ordered list)");
          }
          return `${d.path} (missing: ${missing.join(", ")})`;
        });
      expect(
        offenders,
        `Flow pages missing required structure: ${offenders.join("; ")}`,
      ).toEqual([]);
    },
  );

  intent(
    "INT-STARLIGHT-010",
    "every Guide page has a numbered procedure",
    () => {
      const guides = docs.filter((d) => d.frontmatter["type"] === "Guide");
      const offenders = guides
        .filter((d) => !(hasOrderedList(d.body) || countNumberedHeadings(d.body) >= 2))
        .map((d) => d.path);
      expect(
        offenders,
        `Guide pages with no numbered procedure (ordered list or >=2 numbered headings): ${offenders.join(", ")}`,
      ).toEqual([]);
    },
  );

  intent(
    "INT-STARLIGHT-012",
    "every Module page carries the three viewpoints and a drawn domain model",
    () => {
      const modules = docs.filter((d) => d.frontmatter["type"] === "Module");
      const offenders = modules
        .map((d) => {
          const missing = VIEWPOINTS.filter((v) => !hasViewpoint(d.body, v));
          if (!hasDomainModel(d.body)) missing.push("domain model (mermaid classDiagram or erDiagram)");
          return missing.length === 0 ? null : `${d.path} (missing: ${missing.join(", ")})`;
        })
        .filter((x): x is string => x !== null);
      expect(
        offenders,
        `Module pages missing required structure: ${offenders.join("; ")}`,
      ).toEqual([]);
    },
  );

  intent(
    "INT-STARLIGHT-013",
    "the why stays in the decisions collection: no ADR identifier or decision link outside it",
    () => {
      const offenders: string[] = [];
      for (const d of docs) {
        if (inDecisions(d.path)) continue;
        const { targets, rest } = linkTargets(prose(d.body));
        for (const t of targets) if (DECISION_TARGET_RE.test(t)) offenders.push(`${d.path}: ${t}`);
        for (const m of rest.matchAll(ADR_ID_RE)) offenders.push(`${d.path}: ${m[0]}`);
      }
      expect(
        offenders,
        `rationale belongs in the decisions collection, reached from the index; these pages cite it inline: ${offenders.join("; ")}`,
      ).toEqual([]);
    },
  );

  intent(
    "INT-STARLIGHT-011",
    "internal links are relative: no root-absolute markdown link targets",
    () => {
      // Astro's `base` prefixes generated navigation and assets but never rewrites
      // hand-written hrefs, so [x](/page/) escapes the site's base path and 404s the
      // moment the site serves under a portal prefix (DOCS_BASE). Code is exempt:
      // link syntax inside fences or inline code is just text.
      const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;
      const ABSOLUTE_LINK_RE = /!?\[[^\]]*\]\(\s*(\/[^)\s]*)/g;
      const offenders: string[] = [];
      for (const d of docs) {
        const prose = d.body.replace(CODE_RE, "");
        for (const m of prose.matchAll(ABSOLUTE_LINK_RE)) {
          offenders.push(`${d.path}: ${m[1]}`);
        }
      }
      expect(
        offenders,
        `root-absolute link targets escape the site base (DOCS_BASE) and 404 under the portal; write them relative to the current page: ${offenders.join("; ")}`,
      ).toEqual([]);
    },
  );
});
