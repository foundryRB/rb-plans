"""Is the vendored renderer still the playbook's current one?

Fetches every file PINNED.json pins - ``plan-renderer.js``, its stylesheet and the faces -
from ``bootstrap-plan``'s ``renderer/`` at a ref (default ``main``) and byte-compares them
with the vendored copies beside this script.

The gap it reports: the pin can go stale in silence. The playbook's renderer gains a fix,
the vendored copy keeps the old one, and every plan this engine renders or exports runs the
old renderer - which is the drift ADR-001 exists to prevent, arriving by a slower road.

**Operator-run, on the caller's own credential. Never CI.** This is the read-only twin of
``update-vendored-renderer.sh`` beside it, which already reaches the playbook the same way:
a person who legitimately holds access to both repos asks the question and decides. Wiring
it into CI is the mistake this comment exists to prevent: it would make this pipeline
depend on another repo and need a cross-repo secret, which is the exact coupling the
vendored copy exists to remove - the pin is here so the build is hermetic. A pin bump is a
deliberate act. ``tests/test_vendor_pin.py`` asserts no workflow reaches the playbook.

Stdlib only, and it talks to the REST API directly rather than shelling out to ``gh``, so
it runs from any Python without extra tooling.

    GH_TOKEN=$(gh auth token) python3 renderer/check_pin_drift.py [ref]

Exit codes: 0 in sync; 1 drifted (with the refresh command); 2 could not ask upstream.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_API = "https://api.github.com"
_HERE = Path(__file__).resolve().parent

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")


def _token() -> str:
    for name in ("GH_TOKEN", "GITHUB_TOKEN"):
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def _get(path: str, token: str) -> dict:
    request = urllib.request.Request(
        f"{_API}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "vf-plans-renderer-pin",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    ref = sys.argv[1] if len(sys.argv) > 1 else "main"
    manifest_path = _HERE / "PINNED.json"
    if not manifest_path.is_file():
        print(f"check-pin-drift: {manifest_path} is missing - the pin has no recorded home", file=sys.stderr)
        return 2
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repo, source, pinned = manifest["repo"], manifest["source"], manifest["ref"]

    token = _token()
    if not token:
        # No credential is an UNANSWERED question, never a pass: the playbook is private,
        # so an anonymous read cannot distinguish "in sync" from "cannot see it".
        print(
            "check-pin-drift: no GH_TOKEN/GITHUB_TOKEN in the environment; the playbook "
            "repo is private and cannot be read anonymously",
            file=sys.stderr,
        )
        return 2

    try:
        upstream = _get(f"/repos/{repo}/commits/{ref}", token)["sha"]
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError) as exc:
        print(
            f"check-pin-drift: cannot read {repo} at {ref} - the token needs contents:read "
            f"on the playbook repo ({exc})",
            file=sys.stderr,
        )
        return 2

    drifted: list[str] = []
    for name in sorted(manifest["files"]):
        try:
            blob = _get(f"/repos/{repo}/contents/{source}/{name}?ref={ref}", token)
            current = base64.b64decode(blob["content"])
        except (urllib.error.HTTPError, urllib.error.URLError, KeyError) as exc:
            print(f"check-pin-drift: cannot read {source}/{name} from {repo}@{ref} ({exc})", file=sys.stderr)
            return 2
        if current == (_HERE / name).read_bytes():
            print(f"ok       renderer/{name} matches {repo}@{ref}")
        else:
            print(f"DRIFTED  renderer/{name} differs from {repo}@{ref}", file=sys.stderr)
            drifted.append(f"renderer/{name}")

    if drifted:
        print(
            f"\nThe vendored renderer is behind {repo}@{ref} "
            f"(pinned at {pinned}, upstream {upstream}): {', '.join(drifted)}.\n"
            f"Every file moves together. Refresh and commit the bump:\n"
            f"  renderer/update-vendored-renderer.sh {ref}",
            file=sys.stderr,
        )
        return 1

    print(f"in sync: pinned {pinned}, {ref} is {upstream}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
