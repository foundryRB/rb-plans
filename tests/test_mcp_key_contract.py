"""The chart mints the MCP door's key before the app starts (ADR-005).

The mint runs only in-cluster, so no other suite exercises it: these hold the
generator and the Deployment to the same Secret, the same keys, and a sync
order that never starts the pod without its key. The rendered check needs
`helm` and skips without it.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

_REPO = Path(__file__).resolve().parents[1]
_CHART = _REPO / "k8s"
_MINT = _CHART / "templates" / "mcp-key.yaml"
_DEPLOYMENT = _CHART / "templates" / "deployment.yaml"
_WAVE = "argocd.argoproj.io/sync-wave"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def _render(template: str) -> list[dict]:
    rendered = subprocess.run(
        [
            "helm", "template", "vf-plans", str(_CHART), "-n", "vf-plans",
            "-s", f"templates/{template}",
            "--set", "host=vf-plans.invalid",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return [doc for doc in yaml.safe_load_all(rendered) if doc]


def test_the_mint_creates_the_key_only_when_it_is_absent() -> None:
    script = _read(_MINT)
    guard = script.index("if kubectl get secret {{ $secret }}")
    create = script.index("kubectl create secret generic {{ $secret }}")
    assert guard < create and "else" in script[guard:create], (
        "the create is not guarded by the existence check, so a re-sync rotates the live key"
    )
    assert "/dev/urandom" in script
    assert "--from-literal=MCP_USER=" in script
    assert '--from-literal=MCP_PASSWORD="$PASSWORD"' in script


def test_the_deployment_reads_the_minted_secret_by_required_reference() -> None:
    assert '{{- $secret := printf "%s-mcp" .Chart.Name }}' in _read(_MINT)
    deployment = _read(_DEPLOYMENT)
    for key in ("MCP_USER", "MCP_PASSWORD"):
        ref = re.search(
            rf"- name: {key}\n\s+valueFrom:\n\s+secretKeyRef:\n"
            rf"\s+name: (.+)\n\s+key: (.+)\n(\s+optional: true\n)?",
            deployment,
        )
        assert ref, f"the Deployment reads no {key} from a Secret"
        assert (ref.group(1), ref.group(2)) == ("{{ .Chart.Name }}-mcp", key)
        assert ref.group(3) is None, f"{key} is optional, so the pod can start without its key"


@pytest.mark.skipif(shutil.which("helm") is None, reason="helm is not installed, and this check is about what the chart renders")
def test_the_rendered_mint_runs_ahead_of_the_deployment_scoped_to_its_one_secret() -> None:
    docs = {doc["kind"]: doc for doc in _render("mcp-key.yaml")}
    job = docs["Job"]
    assert job["metadata"]["annotations"]["argocd.argoproj.io/hook"] == "Sync"
    job_wave = int(job["metadata"]["annotations"][_WAVE])
    for kind in ("ServiceAccount", "Role", "RoleBinding"):
        assert int(docs[kind]["metadata"]["annotations"][_WAVE]) < job_wave, kind

    deployment = next(doc for doc in _render("deployment.yaml") if doc["kind"] == "Deployment")
    deployment_wave = int((deployment["metadata"].get("annotations") or {}).get(_WAVE, 0))
    assert job_wave < deployment_wave, "the key is minted after the Deployment applies"

    pod = job["spec"]["template"]["spec"]
    assert pod["serviceAccountName"] == docs["ServiceAccount"]["metadata"]["name"]
    assert "kubectl create secret generic vf-plans-mcp -n vf-plans" in pod["containers"][0]["args"][0]
    named = [rule for rule in docs["Role"]["rules"] if rule.get("resourceNames")]
    assert named == [
        {"apiGroups": [""], "resources": ["secrets"], "resourceNames": ["vf-plans-mcp"], "verbs": ["get", "patch"]}
    ]
