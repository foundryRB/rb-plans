"""INT-PLANS-042: a person signs in through the app's own identity
realm and reaches the Plan Cockpit, attested against the deployed realm.

Drives the standard browser-facing authorization-code flow with httpx's
cookie jar and redirect follower rather than a real browser: Keycloak's
login page is a plain server-rendered HTML form with no JS required to
submit it, and oauth2-proxy's callback is a normal HTTP redirect chain.
"""

from __future__ import annotations

import re

import httpx
import pytest
from pytest_intent import intent

_LOGIN_FORM_ACTION_RE = re.compile(r'<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"')


@pytest.mark.deployed
@intent("INT-PLANS-042")
def test_a_person_signs_in_through_the_realm_and_reaches_the_cockpit(
    verify_inputs: dict[str, str], realm_test_user_password: str
) -> None:
    target = verify_inputs["target_url"]
    username = verify_inputs["test_user"]

    with httpx.Client(follow_redirects=True, timeout=30) as client:
        start = client.get(f"{target}/oauth2/start", params={"rd": "/"})
        assert start.status_code == 200, f"unexpected status from the sign-in start: {start.status_code}"

        match = _LOGIN_FORM_ACTION_RE.search(start.text)
        assert match, "no Keycloak login form found - the redirect chain did not reach a login page"
        action_url = match.group(1).replace("&amp;", "&")

        submitted = client.post(
            action_url,
            data={"username": username, "password": realm_test_user_password},
        )
        assert submitted.status_code == 200, f"the login submission answered {submitted.status_code}"

        # A wrong credential re-serves the login form; a correct one lands
        # back on the app. Distinguish by absence of the login form.
        assert not _LOGIN_FORM_ACTION_RE.search(submitted.text), (
            "still on the Keycloak login page after submitting - the realm "
            "refused the test user's credential"
        )

        # The Plan Cockpit's own shell, not a login page or an error page.
        assert "Vodafone Plans" in submitted.text or 'id="root"' in submitted.text, (
            "signed in, but the served page is not the Plan Cockpit shell"
        )
