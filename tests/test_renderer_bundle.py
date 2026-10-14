"""ADR-001: one canonical renderer source, and the copies both consumers
build from it are produced mechanically, never hand-maintained forks.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]


@intent("INT-PLANS-004")
def test_exactly_one_canonical_renderer_source_and_both_copies_are_mechanical() -> None:
    canonical_js = _REPO / "renderer" / "plan-renderer.js"
    canonical_css = _REPO / "renderer" / "plan-renderer.css"
    assert canonical_js.is_file() and canonical_css.is_file()

    # no second hand-maintained copy anywhere else in the tree (the frontend's
    # copy is gitignored generated output, never a second SOURCE file).
    other_definitions = [
        p
        for p in _REPO.rglob("*.js")
        if p != canonical_js
        and "node_modules" not in p.parts
        and "dist" not in p.parts
        and "public/renderer" not in str(p).replace("\\", "/")
        and "PlanRenderer" in p.read_text(encoding="utf-8", errors="ignore")
    ]
    assert not other_definitions, f"a second renderer definition exists: {other_definitions}"

    # the Export Composer's own module resolves back to this exact file
    # (it reads it directly - a computed path, not a copy - which is the
    # strongest form of "no fork": there is nowhere for one to live).
    from backend.adapters.export.composer import RENDERER_DIR

    assert (RENDERER_DIR / "plan-renderer.js").read_text(encoding="utf-8") == canonical_js.read_text(encoding="utf-8")

    # the frontend's copy is produced mechanically by the canonical
    # source's own build-time script (renderer/project-to-frontend.mjs),
    # byte-identical, never by hand: run it and diff the result.
    frontend_dir = _REPO / "frontend"
    subprocess.run(
        ["node", str(_REPO / "renderer" / "project-to-frontend.mjs")],
        cwd=frontend_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    pin = json.loads((_REPO / "renderer" / "PINNED.json").read_text(encoding="utf-8"))
    for canonical in (canonical_js, canonical_css):
        digest = pin["files"][canonical.name]
        projected = frontend_dir / "public" / "renderer" / f"{canonical.stem}.{digest}{canonical.suffix}"
        assert projected.is_file()
        assert projected.read_bytes() == canonical.read_bytes()
