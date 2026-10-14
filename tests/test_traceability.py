"""STD-003 made checkable: every claim names a requirement ID from the
committed P1 spine, and every spine ID is named by some claim OR carried
in the committed descope table.

The P1 spine and the descope table are parsed straight out of
docs/reference/traceability.md's two markdown tables, not re-typed here:
a second, hand-maintained copy of the 35 IDs in this file could drift
from the published page (a row edited, an ID typo'd) with nothing to
catch it, which defeats the page's own claim to be "the durable copy of
this list" (its docstring, and INT-PLANS-031). Parsing the page
means a change to either side - intent.yaml's derived_from fields, or
the page's own tables - that breaks their agreement fails this test.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml
from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]
_TRACEABILITY_PAGE = _REPO / "docs" / "src" / "content" / "docs" / "reference" / "traceability.md"

_REQ_ID_RE = re.compile(r"^[A-Z]+-\d+$")


def _parse_markdown_table(text: str, heading: str) -> list[list[str]]:
    """Rows (as cell lists) of the first `| --- | --- |`-style table under
    the given `## heading`, up to the next `##` heading or EOF."""
    heading_re = re.compile(rf"^## {re.escape(heading)}\s*$", re.MULTILINE)
    start = heading_re.search(text)
    assert start, f"{_TRACEABILITY_PAGE.name} has no '## {heading}' section"
    rest = text[start.end():]
    next_heading = re.search(r"^## ", rest, re.MULTILINE)
    section = rest[: next_heading.start()] if next_heading else rest

    rows = []
    for line in section.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r"-+", c) for c in cells):
            continue  # the `| --- | --- |` separator row
        rows.append(cells)
    assert rows, f"'## {heading}' in {_TRACEABILITY_PAGE.name} has no table rows"
    return rows[1:]  # drop the header row


def _spine_and_descoped() -> tuple[set[str], set[str]]:
    text = _TRACEABILITY_PAGE.read_text(encoding="utf-8")

    descoped = {row[0] for row in _parse_markdown_table(text, "Descoped")}
    covered = {row[0] for row in _parse_markdown_table(text, "Requirement to claim")}
    spine = descoped | covered

    for req in spine:
        assert _REQ_ID_RE.match(req), f"{req!r} parsed out of {_TRACEABILITY_PAGE.name} is not a requirement id"
    assert len(spine) == 35, f"expected 35 P1 requirement ids in {_TRACEABILITY_PAGE.name}, parsed {len(spine)}: {sorted(spine)}"

    return spine, descoped


def _load_claims() -> dict:
    raw = (_REPO / "intent.yaml").read_text(encoding="utf-8")
    return yaml.safe_load(raw)


@intent("INT-PLANS-030")
def test_every_claim_names_a_spine_requirement_and_every_spine_id_is_covered() -> None:
    spine, descoped = _spine_and_descoped()

    claims = _load_claims()
    named: set[str] = set()
    for claim_id, body in claims.items():
        if not isinstance(body, dict) or "derived_from" not in body:
            continue
        derived = body["derived_from"]
        assert derived, f"{claim_id} names no requirement id"
        for req in derived:
            assert req in spine, f"{claim_id} names {req!r}, not on the P1 spine (docs/reference/traceability.md)"
            named.add(req)

    uncovered = spine - named - descoped
    assert not uncovered, f"spine ids named by no claim and not descoped: {sorted(uncovered)}"

    # descoped ids carry no claim by definition; a descoped id a claim
    # still names would be a claim asserting what the page says is out
    # of scope - that contradiction is worth its own explicit check.
    claimed_and_descoped = named & descoped
    assert not claimed_and_descoped, f"descoped per the page but named by a claim anyway: {sorted(claimed_and_descoped)}"
