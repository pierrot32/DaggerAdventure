CREATE TABLE sound_playlists (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sound_playlists_owner_name_idx
    ON sound_playlists (owner_id, lower(name));

CREATE TABLE sound_playlist_tracks (
    playlist_id UUID NOT NULL REFERENCES sound_playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES sound_library_tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (playlist_id, track_id),
    UNIQUE (playlist_id, position)
);

CREATE INDEX sound_playlist_tracks_track_idx
    ON sound_playlist_tracks (track_id, playlist_id);