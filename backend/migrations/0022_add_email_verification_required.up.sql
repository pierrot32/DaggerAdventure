ALTER TABLE users
    ADD COLUMN email_verification_required BOOLEAN NOT NULL DEFAULT false;