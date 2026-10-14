"""The vendored renderer is a checkable pin, not a copy someone promises not to edit.

ADR-001 names one canonical REF-Plan renderer. It lives in the playbook's ``bootstrap-plan``
skill, outside this app's delivery grant, so this repo holds a byte-identical committed copy
rather than fetching it: that is what keeps the build hermetic, with no cross-repo secret in
CI and no pipeline that fails when another repo moves.

A pin drifts two ways, and they need different mechanisms:

* the vendored copy is edited in place - offline, free, and asserted here on every push;
* upstream moves and the pin does not - needs the playbook, so it lives in
  ``renderer/check_pin_drift.py``, run by an operator on their own credential.

This file owns the first and asserts that the second exists and is wired.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]
_RENDERER = _REPO / "renderer"


@intent("INT-PLANS-004")
def test_the_vendored_renderer_still_matches_its_recorded_pin() -> None:
    manifest = json.loads((_RENDERER / "PINNED.json").read_text(encoding="utf-8"))

    # The manifest is the SINGLE home for the pin: repo, source, commit, and a hash per
    # file. A second copy of the commit elsewhere is a second thing to forget.
    assert manifest["repo"] == "VFPT-VODAFONE-FOUNDRY/adf-playbook"
    assert manifest["source"] == "galaxies/press/skills/bootstrap-plan/renderer"
    assert len(manifest["ref"]) == 40 and all(c in "0123456789abcdef" for c in manifest["ref"])

    # The script, the stylesheet and the page frame move together. A sheet one commit ahead
    # of the script it styles is a render that agrees with neither, and the frame is the page
    # an export is; the identity's faces travel inside the frame, so no face file is pinned.
    files = manifest["files"]
    assert {"plan-renderer.js", "plan-renderer.css", "plan-page.html"} <= set(files)
    assert not [name for name in files if name.endswith(".woff2")], "a face file outside the sheet"

    # The bytes on disk ARE the pin. A hand-edit of a vendored file is a re-implementation
    # wearing a pin's clothes, which is the fork ADR-001 exists to prevent.
    for name, recorded in files.items():
        actual = hashlib.sha256((_RENDERER / name).read_bytes()).hexdigest()
        assert actual == recorded, (
            f"renderer/{name} does not match its recorded pin. Do not hand-edit a vendored "
            f"file - fix it upstream in the playbook, then refresh: "
            f"renderer/update-vendored-renderer.sh"
        )


@intent("INT-PLANS-004")
def test_the_pinned_bytes_are_held_unconverted_on_every_platform() -> None:
    """A byte-exact pin needs the checkout to hand back the bytes the repo holds.

    With core.autocrlf on (the Windows default) git translates line endings on checkout, so
    every recorded hash misses on a Windows clone and the guard above reports drift on a
    tree that has none. The attributes file is what keeps the hashes describing the same
    file everywhere, so it is asserted here beside the pin it protects rather than left as
    a setting someone might tidy away.
    """
    rules = [
        line.split("#", 1)[0].split()
        for line in (_REPO / ".gitattributes").read_text(encoding="utf-8").splitlines()
    ]
    unconverted = {parts[0] for parts in rules if len(parts) > 1 and "-text" in parts}
    assert {"renderer/*", "renderer/**"} & unconverted, (
        "renderer/ holds files pinned by SHA-256, so .gitattributes must hold them "
        "unconverted - a translated checkout makes every recorded hash miss"
    )


@intent("INT-PLANS-004")
def test_the_upstream_question_is_asked_by_an_operator_and_carries_its_own_fix() -> None:
    drift = (_RENDERER / "check_pin_drift.py").read_text(encoding="utf-8")
    assert "PINNED.json" in drift                        # it reads the same single home
    assert "return 2" in drift                           # a credential problem is its own outcome, not "in sync"
    assert "update-vendored-renderer.sh" in drift        # a drift report carries its own fix
    assert "urllib" in drift and "subprocess" not in drift   # stdlib, runs from any Python

    # And the refresh script is the only writer of the manifest, from the bytes it just
    # wrote - so the recorded hashes can never describe a different file than the one on
    # disk, which is the failure the guard above would otherwise only half-catch.
    refresh = (_RENDERER / "update-vendored-renderer.sh").read_text(encoding="utf-8")
    assert "PINNED.json" in refresh
    assert "hashlib.sha256" in refresh


@intent("INT-PLANS-004")
def test_no_workflow_makes_this_repo_depend_on_the_playbook() -> None:
    """The pin exists so the build is HERMETIC.

    ``renderer/`` holds a byte-identical copy precisely because the playbook repo is
    private and this pipeline holds no cross-repo credential; that is the property, not a
    workaround for it. Asking whether the pin is stale is an operator's act on their own
    credential (``check_pin_drift.py``), never a pipeline's. So the ABSENCE of that
    dependency is the claim, asserted here - a machine gate on the architecture rather
    than a comment hoping someone remembers it.
    """
    for workflow in (_REPO / ".github" / "workflows").glob("*.yml"):
        body = workflow.read_text(encoding="utf-8")
        assert "VFPT-VODAFONE-FOUNDRY/adf-playbook" not in body, (
            f"{workflow.name} reaches the playbook repo. The vendored pin exists so this "
            f"build is hermetic; checking it against upstream is an operator act "
            f"(renderer/check_pin_drift.py), not a pipeline's."
        )
