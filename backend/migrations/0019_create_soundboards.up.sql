CREATE TABLE sound_boards (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sound_boards_visibility_idx
    ON sound_boards (shared, updated_at DESC);

CREATE TABLE sounds (
    id UUID PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES sound_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    audio_url TEXT,
    audio_data BYTEA,
    audio_mime_type TEXT,
    image_url TEXT,
    image_data BYTEA,
    image_mime_type TEXT,
    creator_name TEXT,
    source_name TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sounds_audio_source_check CHECK (
        (audio_url IS NOT NULL AND audio_data IS NULL)
        OR (audio_url IS NULL AND audio_data IS NOT NULL)
    ),
    CONSTRAINT sounds_audio_mime_check CHECK (
        (audio_data IS NULL AND audio_mime_type IS NULL)
        OR (audio_data IS NOT NULL AND audio_mime_type IS NOT NULL)
    ),
    CONSTRAINT sounds_image_mime_check CHECK (
        (image_data IS NULL AND image_mime_type IS NULL)
        OR (image_data IS NOT NULL AND image_mime_type IS NOT NULL)
    )
);

CREATE INDEX sounds_board_idx ON sounds (board_id, created_at, id);

CREATE TABLE sound_labels (
    id UUID PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES sound_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

CREATE UNIQUE INDEX sound_labels_board_name_idx
    ON sound_labels (board_id, lower(name));

CREATE TABLE sound_label_links (
    sound_id UUID NOT NULL REFERENCES sounds(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES sound_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (sound_id, label_id)
);