#!/usr/bin/env bash
# Refresh the vendored renderer from the playbook (a private repo, so this uses the
# caller's authenticated gh). Byte-identical imports of the true files, never a hand-port;
# PINNED.json records the pinned commit.
#
# WHY A COPY AND NOT A READ. `bootstrap-plan` owns the one REF-Plan renderer (ADR-001), and
# it lives in the playbook repo, outside this app's delivery grant. A build that fetched it
# would need a cross-repo secret in CI and would fail whenever the playbook moved, which is
# the coupling this directory exists to remove: the committed copy is what keeps the build
# hermetic. A pin bump is a deliberate act by someone who already holds access to both
# repos, never a pipeline's business - tests/test_vendor_pin.py asserts no workflow here
# reaches the playbook.
#
# EVERY file moves together, from ONE ref. The script and the stylesheet are one contract:
# a sheet one commit ahead of the script it styles is a render that agrees with neither.
#
# This is the ONLY writer of PINNED.json. The manifest it emits is what makes the pin
# checkable: tests/test_vendor_pin.py re-hashes the files against it offline on every push,
# and check_pin_drift.py re-fetches upstream against it.
#
# PLAYBOOK_CLONE bootstraps a pin whose commit is not yet on the remote: it reads the bytes
# from a local playbook checkout and takes the ref from its git. The recorded SHA is the
# commit's real one either way, so such a pin becomes checkable the moment that commit is
# pushed - and check_pin_drift.py is what says whether it has been.
#
#   renderer/update-vendored-renderer.sh [ref]
#   PLAYBOOK_CLONE=../playbook renderer/update-vendored-renderer.sh
set -euo pipefail

ref="${1:-main}"
repo="VFPT-VODAFONE-FOUNDRY/adf-playbook"
skill="galaxies/press/skills/bootstrap-plan/renderer"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "${here}/.." && pwd)"
clone="${PLAYBOOK_CLONE:-}"

# The renderer source, whole: the script, its stylesheet, and the page frame every standalone
# plan file fills (whose palette block carries the identity's own faces, inlined). The
# Export Composer reads all three; project-to-frontend.mjs projects the first two.
files=(
  plan-renderer.js
  plan-renderer.css
  plan-page.html
)

# Resolve a WORKING interpreter before touching anything. On Git Bash `python3` is on PATH
# as the Microsoft Store alias stub: it resolves, then prints an ad and exits non-zero. If
# that surfaced only after the fetch loop, the files would be bumped and PINNED.json stale
# - the one inconsistency this script exists to make impossible. So probe each candidate by
# running it, never by asking whether it exists.
py=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "" >/dev/null 2>&1; then
    py="$candidate"
    break
  fi
done
if [ -z "$py" ]; then
  echo "no working python on PATH (tried python3, python, py); PINNED.json cannot be written" >&2
  exit 1
fi

for name in "${files[@]}"; do
  mkdir -p "$(dirname "${here}/${name}")"
  if [ -n "$clone" ]; then
    # `git show`, never `cp`: the pin is the bytes the playbook REPO holds, and a working
    # tree checked out under core.autocrlf hands back CRLF. Hashing translated bytes mints
    # a pin that passes on this machine and misses everywhere else.
    git -C "$clone" show "HEAD:${skill}/${name}" > "${here}/${name}"
  else
    gh api "repos/${repo}/contents/${skill}/${name}?ref=${ref}" --jq '.content' | base64 -d > "${here}/${name}"
  fi
  echo "vendored ${skill}/${name} -> renderer/${name}"
done

if [ -n "$clone" ]; then
  sha=$(git -C "$clone" rev-parse HEAD)
else
  sha=$(gh api "repos/${repo}/commits/${ref}" --jq '.sha')
fi

# Rewrite the manifest from the bytes just written, so the recorded hashes can never
# describe a different file than the one on disk.
REPO="$repo" SKILL="$skill" SHA="$sha" TODAY="$(date +%F)" HERE="$here" "$py" - "${files[@]}" <<'PY'
import hashlib, json, os, sys

here = os.environ["HERE"]
manifest = {
    "_comment": (
        "The single home for the vendored renderer pin. update-vendored-renderer.sh writes "
        "this file; check_pin_drift.py and tests/test_vendor_pin.py read it. Never "
        "hand-edit either this or the vendored files - a hand-edit is a re-implementation "
        "wearing a pin's clothes, and the fork ADR-001 exists to prevent."
    ),
    "repo": os.environ["REPO"],
    "source": os.environ["SKILL"],
    "ref": os.environ["SHA"],
    "pinned_on": os.environ["TODAY"],
    "files": {
        name: hashlib.sha256(open(os.path.join(here, name), "rb").read()).hexdigest()
        for name in sys.argv[1:]
    },
}
with open(os.path.join(here, "PINNED.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(manifest, fh, indent=2)
    fh.write("\n")
PY
echo "${#files[@]} files pinned at ${sha} (PINNED.json rewritten)"
