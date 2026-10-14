"""Domain errors. No adapter, no framework import here (INT-PLANS-028)."""

from __future__ import annotations

__all__ = ["DomainError", "ValidationError", "NotFoundError", "ConfigError"]


class DomainError(Exception):
    """Base for every error the domain/usecases layer raises."""


class ValidationError(DomainError):
    """A dataset, or a piece of one, does not conform to REF-Plan section 3.

    Carries every reason found, not just the first: a refused import
    (INT-PLANS-026) reports the whole conformance gap in one pass.
    """

    def __init__(self, reasons: list[str]) -> None:
        self.reasons = reasons
        super().__init__("; ".join(reasons))


class NotFoundError(DomainError):
    """No plan, version, or item exists at the given id."""


class ConfigError(DomainError):
    """A required piece of runtime configuration is missing or unusable.

    Raised at startup, never masked: INT-PLANS-044 names the one case
    this exists for (an unset store owner role on the discrete-settings
    path), but the type is general so config.py can use it for any other
    fail-loud case.
    """
