"""The Export Composer's read-only guarantee (VER-002), and the engine text
every export carries (EXP-001)."""

from __future__ import annotations

import copy
import json
import re

from pytest_intent import intent

from backend.adapters.export.composer import RENDERER_DIR, compose_export_html
from backend.usecases.service import PlanService


@intent("INT-PLANS-023")
def test_exporting_a_plan_leaves_the_store_byte_identical(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    plan_id = sample_dataset["meta"]["id"]
    before = service.list_versions(plan_id)
    compose_export_html(service.get_plan(plan_id))
    compose_export_html(service.get_plan(plan_id))
    after = service.list_versions(plan_id)
    assert len(before) == len(after) == 1
    assert before[0].dataset == after[0].dataset


_EM_DASH = "\u2014"
# The spellings that reach the rendered page as an em-dash without being one
# in the file: JS string escapes, a CSS escape, and the HTML references.
_EM_DASH_ESCAPED = re.compile(r"\\u\{?0*2014\}?|\\0*2014|&mdash;|&#0*8212;|&#x0*2014;", re.IGNORECASE)


@intent("INT-PLANS-046")
def test_an_export_carries_no_em_dash_its_dataset_did_not(service: PlanService, sample_dataset: dict) -> None:
    service.create_plan(copy.deepcopy(sample_dataset))
    dataset = service.get_plan(sample_dataset["meta"]["id"])
    assert _EM_DASH not in json.dumps(dataset, ensure_ascii=False)
    assert dataset["meta"].get("version"), "the stored plan carries the version the title is composed from"

    html = compose_export_html(dataset).decode("utf-8")
    hits = [html[max(0, m.start() - 60) : m.end() + 20] for m in re.finditer(_EM_DASH, html)]
    assert not hits, f"the engine contributed an em-dash to the export: {hits}"
    escaped = [m.group(0) for m in _EM_DASH_ESCAPED.finditer(html)]
    assert not escaped, f"the engine contributed an escaped em-dash to the export: {escaped}"


@intent("INT-PLANS-046")
def test_the_export_is_the_renderers_own_page_frame_filled(service: PlanService, sample_dataset: dict) -> None:
    """The page around the renderer is the vendored frame, not a page of this engine's own.

    Everything outside the frame's four slots reaches the export unchanged: its ground and
    brand (the frame's own stamped palette block) and the identity's stage. So an export and
    a plan scaffolded by the skill are the same page, and a rehue or a new stage arrives here
    as a pin bump with nothing to edit in Python.
    """
    frame = (RENDERER_DIR / "plan-page.html").read_text(encoding="utf-8")
    service.create_plan(copy.deepcopy(sample_dataset))
    html = compose_export_html(service.get_plan(sample_dataset["meta"]["id"])).decode("utf-8")

    for slot in ("__TITLE__", "/*__RENDERER_CSS__*/", "/*__RENDERER_JS__*/", "__DATASET__"):
        assert slot in frame, f"the frame has no {slot} slot"
        assert slot not in html, f"{slot} was left unfilled"
    for fixed in re.split(r"__TITLE__|/\*__RENDERER_CSS__\*/|/\*__RENDERER_JS__\*/|__DATASET__", frame):
        assert fixed in html, "the export departs from the frame outside its slots"
    assert "background: var(--bg);" in frame and "/* PRESS palette */" in frame
