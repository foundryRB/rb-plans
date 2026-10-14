"""The Export Composer (ADR-004, ADR-001): produces the standalone,
self-contained HTML file both the export endpoint (API-003) and the
cockpit's Plan Render view display (INT-PLANS-017 - both serve the
one artifact this module produces, because the cockpit embeds this exact
output rather than re-rendering the dataset itself).

Assembly is string templating, not server-side JS execution: the
renderer stays a browser-executed, framework-free script exactly as
REF-Plan.md section 6 requires ("render-on-load from the dataset"). This
module fills the renderer's own page frame (renderer/plan-page.html) with
the dataset, the script and the stylesheet, exactly as the skill that
scaffolds a plan does, so an export and a scaffolded plan are the same page.
The identity's faces (inlined) and its stage arrive in the frame, so the file
issues no request.
"""

from __future__ import annotations

import json
from functools import lru_cache
from html import escape
from pathlib import Path

__all__ = ["compose_export_html", "RENDERER_DIR"]

# backend/adapters/export/composer.py -> parents[3] is the repo layout's
# "backend" directory; its sibling "renderer" is the canonical source in
# both a source checkout (dev/CI) and the released image, which mirrors
# the same backend/ + renderer/ sibling layout under /app (devops/Dockerfile).
RENDERER_DIR = Path(__file__).resolve().parents[3] / "renderer"


@lru_cache(maxsize=1)
def _renderer_js() -> str:
    return (RENDERER_DIR / "plan-renderer.js").read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _renderer_css() -> str:
    return (RENDERER_DIR / "plan-renderer.css").read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _page_frame() -> str:
    return (RENDERER_DIR / "plan-page.html").read_text(encoding="utf-8")


def compose_export_html(dataset: dict) -> bytes:
    meta = dataset.get("meta", {})
    name = meta.get("title", meta.get("id", "Untitled plan"))
    version = meta.get("version", "")
    title = escape(f"{name} . {version}" if version else f"{name}")
    # "</" inside a string value would otherwise close the embedding tag early
    # (REF-Plan.md section 6, textContent discipline applied to the embedding itself).
    body = json.dumps(dataset, indent=2, ensure_ascii=False).replace("</", "<\\/")
    # The dataset goes in last, so nothing a plan says is ever read as a slot.
    html = (
        _page_frame()
        .replace("__TITLE__", title)
        .replace("/*__RENDERER_CSS__*/", _renderer_css())
        .replace("/*__RENDERER_JS__*/", _renderer_js())
        .replace("__DATASET__", body)
    )
    return html.encode("utf-8")
