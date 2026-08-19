CREATE TABLE sound_sources (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sound_sources_owner_name_idx
    ON sound_sources (owner_id, lower(name));

CREATE TABLE sound_library_tracks (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    audio_url TEXT,
    audio_data BYTEA,
    audio_mime_type TEXT,
    image_url TEXT,
    image_data BYTEA,
    image_mime_type TEXT,
    creator_name TEXT,
    source_id UUID REFERENCES sound_sources(id) ON DELETE SET NULL,
    source_credit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sound_library_audio_source_check CHECK (
        (audio_url IS NOT NULL AND audio_data IS NULL)
        OR (audio_url IS NULL AND audio_data IS NOT NULL)
    ),
    CONSTRAINT sound_library_audio_mime_check CHECK (
        (audio_data IS NULL AND audio_mime_type IS NULL)
        OR (audio_data IS NOT NULL AND audio_mime_type IS NOT NULL)
    ),
    CONSTRAINT sound_library_image_mime_check CHECK (
        (image_data IS NULL AND image_mime_type IS NULL)
        OR (image_data IS NOT NULL AND image_mime_type IS NOT NULL)
    )
);

CREATE INDEX sound_library_tracks_owner_idx
    ON sound_library_tracks (owner_id, created_at, id);

CREATE TABLE sound_library_labels (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

CREATE UNIQUE INDEX sound_library_labels_owner_name_idx
    ON sound_library_labels (owner_id, lower(name));

CREATE TABLE sound_library_label_links (
    track_id UUID NOT NULL REFERENCES sound_library_tracks(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES sound_library_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (track_id, label_id)
);

CREATE TABLE sound_board_library_tracks (
    board_id UUID NOT NULL REFERENCES sound_boards(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES sound_library_tracks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (board_id, track_id)
);

CREATE INDEX sound_board_library_tracks_track_idx
    ON sound_board_library_tracks (track_id, board_id);