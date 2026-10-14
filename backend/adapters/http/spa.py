"""The cockpit bundle as a single-page app.

`StaticFiles(html=True)` answers a directory with its index.html and nothing
else, so a client-side route is a 404 the moment a browser asks the SERVER for
it: opening a plan's address directly, a shared link, a refresh on any plan
page. The dev server hides this (it has the fallback built in), which is why
the e2e suite, which runs against it, never saw it.

A path that is no file and looks like a page (no extension) is the app's to
route, so it gets index.html. A missing ASSET stays a 404: answering it with
HTML would hand a browser a page where it asked for a script. The machine
doors keep their own 404s: a mistyped /api or /mcp path must not come back as
a 200 full of markup.
"""

from __future__ import annotations

from pathlib import PurePosixPath

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

__all__ = ["SpaStaticFiles"]

_MACHINE_DOORS = ("api", "mcp")


class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not _is_page(path):
                raise
            response = await super().get_response("index.html", scope)
        if response.status_code == 404 and _is_page(path):
            response = await super().get_response("index.html", scope)
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-store"
        return response


def _is_page(path: str) -> bool:
    parts = PurePosixPath(path.replace("\\", "/")).parts
    if parts and parts[0] in _MACHINE_DOORS:
        return False
    return PurePosixPath(path).suffix == ""
