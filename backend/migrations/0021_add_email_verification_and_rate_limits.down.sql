DROP TABLE auth_rate_limit_buckets;
DROP TABLE email_verification_tokens;
ALTER TABLE users DROP COLUMN email_verified_at;