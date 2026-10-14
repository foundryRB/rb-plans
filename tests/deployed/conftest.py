"""The in-cluster verification suite's fixtures
(INT-PLANS-042). This suite runs ONLY inside the verification Job the
run applies with `kubectl apply -f -`; it is excluded from CI
(`pytest tests --ignore=tests/deployed`) and needs eight inputs the Job
passes as environment variables - the whole interface, and an input not
on this list is a defect in the Job's spec, not something to invent here:

  REALM_ADMIN_DIR      - where the realm-scoped admin credential is mounted
  REALM_ADMIN_USER_KEY - the file name (under REALM_ADMIN_DIR) holding the
                          admin username (password grant) or client id
                          (client_credentials grant)
  REALM_ADMIN_SECRET_KEY - the file name holding the admin password or
                          client secret
  REALM_ADMIN_GRANT    - "password" or "client_credentials"
  REALM_ADMIN_URL      - the issuer with everything from "/realms/" cut off
                          (keeps any path prefix the provider is served
                          under)
  REALM_NAME           - the realm name
  VERIFY_TARGET_URL    - the app's public origin, https://<host>
  VERIFY_REALM_USER    - the realm-local test user's name ("e2e")

Nothing here reads a credential the platform minted out of the cluster
(REF-CSD.md section 6): the admin credential is read from the mounted
volume inside this same pod, never returned or logged, and the verdict
this suite reaches is exactly what `pytest_sessionfinish` below prints.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Any

import httpx
import pytest

_REQUIRED_ENV = (
    "REALM_ADMIN_DIR",
    "REALM_ADMIN_USER_KEY",
    "REALM_ADMIN_SECRET_KEY",
    "REALM_ADMIN_GRANT",
    "REALM_ADMIN_URL",
    "REALM_NAME",
    "VERIFY_TARGET_URL",
    "VERIFY_REALM_USER",
)


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is unset: tests/deployed/ runs only from the verification "
            f"Job, which "
            f"passes all eight named inputs. An unset one is a defect in that "
            f"Job's own spec, never something this suite invents or skips over."
        )
    return value


def _resolve_user_or_client(admin_dir: Path, value: str) -> str:
    """REALM_ADMIN_USER_KEY names a file under REALM_ADMIN_DIR when the
    admin identity is itself a mounted secret (a client id, in the
    client_credentials shape). This install's realm grant mints a
    password-grant admin whose *password* is a secret key
    (`realmAdminPassword`) but whose *username* is a fixed, non-secret
    literal fixed by the realm's own rendered config
    (`vf-plans-admin`) - there is no file to read for it. Try the file
    first (keeps the client_credentials shape working unchanged); fall
    back to the value itself as a literal when no such file exists.
    """
    candidate = admin_dir / value
    if candidate.is_file():
        return candidate.read_text(encoding="utf-8").strip()
    return value


@pytest.fixture(scope="session")
def verify_inputs() -> dict[str, str]:
    for name in _REQUIRED_ENV:
        _env(name)
    admin_dir = Path(_env("REALM_ADMIN_DIR"))
    admin_user_or_client = _resolve_user_or_client(admin_dir, _env("REALM_ADMIN_USER_KEY"))
    secret_key_file = admin_dir / _env("REALM_ADMIN_SECRET_KEY")
    if not secret_key_file.is_file():
        raise RuntimeError(
            f"the realm admin secret is not mounted where REALM_ADMIN_DIR "
            f"says: {admin_dir}. The merged Keycloak grant PR's rendered "
            f"manifest names the Secret and its keys."
        )
    return {
        "admin_user_or_client": admin_user_or_client,
        "admin_secret": secret_key_file.read_text(encoding="utf-8").strip(),
        "grant": _env("REALM_ADMIN_GRANT"),
        "admin_url": _env("REALM_ADMIN_URL").rstrip("/"),
        "realm": _env("REALM_NAME"),
        "target_url": _env("VERIFY_TARGET_URL").rstrip("/"),
        "test_user": _env("VERIFY_REALM_USER"),
    }


@pytest.fixture(scope="session", autouse=True)
def _reachability_probe(verify_inputs: dict[str, str]) -> None:
    """The Job's opening act: a network
    failure reaching either host is an egress failure, not a defect
    - so this probe runs before any other fixture or test, and its failure
    message is prefixed distinctly so the Job's logs name which host was
    unreachable rather than reading as an ordinary test failure.
    """
    app_probe_url = f"{verify_inputs['target_url']}/oauth2/start"
    discovery_url = (
        f"{verify_inputs['admin_url']}/realms/{verify_inputs['realm']}"
        "/.well-known/openid-configuration"
    )
    for label, url in (("the app's public host", app_probe_url), ("the identity provider's host", discovery_url)):
        try:
            httpx.get(url, timeout=15, follow_redirects=True)
        except httpx.TransportError as exc:
            raise RuntimeError(
                f"EGRESS-UNREACHABLE: could not reach {label} ({url}): {exc}. "
                f"This is an egress failure, not a defect in "
                f"this suite or in the app - report it as such, never as a "
                f"claim-042 failure to fix."
            ) from exc


def _admin_token(inputs: dict[str, str]) -> str:
    token_url = f"{inputs['admin_url']}/realms/{inputs['realm']}/protocol/openid-connect/token"
    if inputs["grant"] == "password":
        data = {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": inputs["admin_user_or_client"],
            "password": inputs["admin_secret"],
        }
    elif inputs["grant"] == "client_credentials":
        data = {
            "grant_type": "client_credentials",
            "client_id": inputs["admin_user_or_client"],
            "client_secret": inputs["admin_secret"],
        }
    else:
        raise RuntimeError(f"REALM_ADMIN_GRANT must be 'password' or 'client_credentials', got {inputs['grant']!r}")
    resp = httpx.post(token_url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def realm_test_user_password(verify_inputs: dict[str, str]) -> str:
    """Ensure the realm-local test user exists and set its password to a
    freshly generated value (create-or-reset, so a surviving user and a
    stale stored password can never disagree). The password never leaves
    this process.
    """
    token = _admin_token(verify_inputs)
    headers = {"Authorization": f"Bearer {token}"}
    admin_base = f"{verify_inputs['admin_url']}/admin/realms/{verify_inputs['realm']}"
    username = verify_inputs["test_user"]

    resp = httpx.get(f"{admin_base}/users", params={"username": username, "exact": "true"}, headers=headers, timeout=15)
    resp.raise_for_status()
    users: list[dict[str, Any]] = resp.json()

    if users:
        user_id = users[0]["id"]
    else:
        create_resp = httpx.post(
            f"{admin_base}/users",
            headers=headers,
            timeout=15,
            json={
                "username": username,
                "enabled": True,
                "emailVerified": True,
                "email": f"{username}@vf-plans.invalid",
                "firstName": "Deployed",
                "lastName": "Verification",
                "requiredActions": [],
            },
        )
        create_resp.raise_for_status()
        location = create_resp.headers.get("Location", "")
        user_id = location.rstrip("/").rsplit("/", 1)[-1]

    password = secrets.token_urlsafe(24)
    reset_resp = httpx.put(
        f"{admin_base}/users/{user_id}/reset-password",
        headers=headers,
        timeout=15,
        json={"type": "password", "value": password, "temporary": False},
    )
    reset_resp.raise_for_status()
    return password


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """The Job's status IS the verdict, because this hook makes it one:
    a skipped suite (0 passed) cannot report success, and the printed
    VERDICT line is what the run reads back alongside the Job's own
    status.
    """
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    stats = reporter.stats if reporter else {}
    passed = len(stats.get("passed", []))
    failed = len(stats.get("failed", []))
    skipped = len(stats.get("skipped", []))
    errors = len(stats.get("error", []))
    print(f"VERDICT passed={passed} failed={failed} skipped={skipped} errors={errors}")
    if passed >= 1 and failed == 0 and skipped == 0 and errors == 0:
        session.exitstatus = 0
    else:
        session.exitstatus = 1
