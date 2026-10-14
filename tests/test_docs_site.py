"""Claims 005 and 031 are propositions about docs/, but their markers live
here at the repo root: docs/ carries its own
separate intent.yaml (the STARLIGHT bundle), and the auditor refuses to
descend into any directory holding one, so a marker placed inside docs/
would orphan against that bundle instead of attesting this repo's claim.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml
from pytest_intent import intent

_DOCS = Path(__file__).resolve().parents[1] / "docs" / "src" / "content" / "docs"

_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


def _read(*parts: str) -> str:
    path = _DOCS.joinpath(*parts)
    assert path.is_file(), f"missing docs page: {path}"
    return path.read_text(encoding="utf-8")


def _frontmatter(text: str, *, source: str) -> dict:
    match = _FRONTMATTER_RE.match(text)
    assert match, f"{source} carries no Starlight frontmatter block - not a routable page, a stub"
    data = yaml.safe_load(match.group(1))
    assert isinstance(data, dict), f"{source}'s frontmatter did not parse to a mapping"
    return data


@intent("INT-PLANS-005")
def test_docs_carries_an_adr_recording_how_the_renderer_is_shared() -> None:
    adr = _read("decisions", "adr-001.md")

    # A routable Starlight page, not a stub: real frontmatter with a
    # decided status, since a draft or missing status is not "the docs
    # site carries an ADR recording" the decision, only a page proposing one.
    front = _frontmatter(adr, source="decisions/adr-001.md")
    assert front.get("adr_status") == "Decided", (
        f"ADR-001 is not recorded as Decided (got {front.get('adr_status')!r}) - "
        f"the claim is about a recorded decision, not an open question"
    )

    body = adr.split("---", 2)[-1]

    # Names BOTH consumers the statement asserts a decision between -
    # a page that only ever discusses one side is not a sharing record.
    assert "bootstrap-plan" in body, "ADR-001 never names bootstrap-plan, the other side of the sharing decision"
    assert re.search(r"\bcockpit\b|\bengine\b", body, re.IGNORECASE), (
        "ADR-001 never names this engine/cockpit as the sharing decision's other consumer"
    )

    # Names the actual mechanism (the canonical source + its build-time
    # projection), not merely the word "renderer" in passing prose.
    assert "renderer/plan-renderer" in body, "ADR-001 never names the canonical renderer source file"
    assert "project-to-frontend" in body or "projection" in body.lower(), (
        "ADR-001 never names the build-time projection mechanism"
    )

    # Reachable: linked from the decisions index, not just present on disk.
    decisions_index = _read("decisions", "index.md")
    assert "adr-001" in decisions_index, "decisions/index.md does not link ADR-001"


@intent("INT-PLANS-031")
def test_docs_publishes_the_dataset_contract_the_three_doors_and_the_decisions() -> None:
    architecture = _read("reference", "architecture.md")

    # The dataset contract: the actual REF-Plan section 3 collections named,
    # not just the string "REF-Plan" appearing somewhere on the page.
    for collection in ("meta", "lanes", "items", "gates", "log"):
        assert collection in architecture, f"architecture.md never names the '{collection}' dataset collection"

    # The three doors, each with a real entry point named - a bare
    # occurrence of "UI"/"REST"/"MCP" in running prose would pass on a
    # stub; a concrete adapter path per door would not.
    door_markers = {
        "UI": "frontend/src/views",
        "REST": "backend/adapters/http",
        "MCP": "backend/adapters/mcp",
    }
    for door, marker in door_markers.items():
        assert marker in architecture, f"architecture.md names no concrete entry point ({marker}) for the {door} door"

    # The decisions: every ADR file is a real, routable Starlight page
    # (frontmatter, not just a file on disk) AND is actually linked from
    # the decisions index - "reachable... as a page" means both.
    decisions_dir = _DOCS / "decisions"
    adr_files = sorted(p.name for p in decisions_dir.glob("adr-*.md"))
    assert len(adr_files) >= 7, f"expected ADR-001..007, found {adr_files}"

    decisions_index = _read("decisions", "index.md")
    for name in adr_files:
        slug = name.removesuffix(".md")
        page = _read("decisions", name)
        front = _frontmatter(page, source=f"decisions/{name}")
        assert front.get("title"), f"decisions/{name} has no title - not a real Starlight page"
        assert slug in decisions_index, f"decisions/index.md does not link {slug}"

    # Architecture itself points back at the decisions page, closing the
    # "reachable" loop from the page this test starts at.
    assert "decisions" in architecture.lower()
