CREATE TABLE adventures (
    id UUID PRIMARY KEY,
    creator_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE adventure_members (
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'accepted',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (adventure_id, user_id),
    CONSTRAINT adventure_members_status_check CHECK (status IN ('accepted', 'removed'))
);

CREATE TABLE adventure_invites (
    id UUID PRIMARY KEY,
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id),
    recipient_email TEXT NOT NULL,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    CONSTRAINT adventure_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'revoked'))
);

CREATE UNIQUE INDEX adventure_invites_pending_unique
    ON adventure_invites (adventure_id, recipient_email)
    WHERE status = 'pending';
CREATE INDEX adventure_invites_recipient_email_idx
    ON adventure_invites (recipient_email, status);
CREATE INDEX adventure_invites_recipient_user_idx
    ON adventure_invites (recipient_user_id, status);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    adventure_id UUID REFERENCES adventures(id) ON DELETE CASCADE,
    invite_id UUID REFERENCES adventure_invites(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_idx
    ON notifications (recipient_user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
    ON notifications (recipient_user_id, read_at)
    WHERE read_at IS NULL;
