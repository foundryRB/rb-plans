-- The version store: append-only, immutable rows (VER-001/VER-002,
-- INT-PLANS-021/022). Applied idempotently at startup
-- (backend.adapters.store.postgres.ensure_schema); this is a migration in
-- the sense that it is safe to re-run, not a versioned migration chain -
-- the app is v1 and there is exactly one shape so far.

CREATE TABLE IF NOT EXISTS plans (
    plan_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS plan_versions (
    plan_id TEXT NOT NULL REFERENCES plans (plan_id),
    version INTEGER NOT NULL,
    dataset JSONB NOT NULL,
    ephemeral BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, version)
);

-- No UPDATE and no DELETE statement is ever issued against plan_versions
-- by this app (INT-PLANS-022); the rule is enforced in
-- backend/adapters/store/postgres.py, not by a database trigger, because
-- the owner role the platform grants is this app's only writer.
