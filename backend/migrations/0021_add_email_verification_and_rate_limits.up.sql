ALTER TABLE users
    ADD COLUMN email_verified_at TIMESTAMPTZ;

CREATE TABLE email_verification_tokens (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_tokens_user_idx
    ON email_verification_tokens (user_id, expires_at);

CREATE TABLE auth_rate_limit_buckets (
    scope TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, bucket_key)
);

CREATE INDEX auth_rate_limit_buckets_updated_idx
    ON auth_rate_limit_buckets (updated_at);