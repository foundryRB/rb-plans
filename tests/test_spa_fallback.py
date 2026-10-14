"""A client-side route asked of the SERVER is the app's page, not a 404.

Opening a plan's address directly, a shared link, a refresh on a plan page: each
asks the server for a path that is no file. The dev server answers those itself,
so only the built bundle behind the real app shows the gap.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.adapters.http.spa import SpaStaticFiles


def _app(tmp_path: Path) -> TestClient:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>cockpit</title>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    app.mount("/", SpaStaticFiles(directory=str(tmp_path), html=True), name="static")
    return TestClient(app)


def test_a_client_side_route_is_served_the_app(tmp_path: Path) -> None:
    client = _app(tmp_path)
    for path in ("/plans/some-plan", "/plans/some-plan/versions", "/plans/some-plan/new-item/track"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert "<title>cockpit</title>" in response.text, path
        assert response.headers["cache-control"] == "no-store", path


def test_real_files_and_the_root_still_serve_themselves(tmp_path: Path) -> None:
    client = _app(tmp_path)
    root = client.get("/")
    assert "<title>cockpit</title>" in root.text
    assert root.headers["cache-control"] == "no-store"
    asset = client.get("/assets/app.js")
    assert asset.text == "console.log(1)"
    assert asset.headers.get("cache-control") != "no-store"


def test_a_missing_asset_and_a_mistyped_machine_path_stay_not_found(tmp_path: Path) -> None:
    client = _app(tmp_path)
    # a browser that asked for a script must not be handed a page
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/logo-mark.svg").status_code == 404
    # the machine doors keep their own 404s: never a 200 full of markup
    assert client.get("/api/no-such-route").status_code == 404
    assert client.get("/mcp-typo/x").status_code == 200  # not a machine door: an app route like any other
    assert client.get("/api/health").json() == {"ok": True}
