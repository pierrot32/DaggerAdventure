import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { canManageUsers } from "../../utils/permissions";
import Button from "../../components/Button/Button";
import {
  attachLibraryTrack,
  createSoundBoard,
  createSoundSource,
  deleteLibraryTrack,
  deleteSound,
  deleteSoundBoard,
  deleteSoundSource,
  detachLibraryTrack,
  getSoundBoard,
  libraryMediaUrl,
  listSoundBoards,
  listSoundLibrary,
  listSoundSources,
  soundMediaUrl,
  updateSoundSource,
  uploadLibraryTrack,
} from "./soundboardApi";
import { useSoundPlayerStore } from "./soundboardStore";
import styles from "./SoundboardPage.module.css";

const LABEL_PRESETS = ["ambiance", "music", "minimal music"];
const emptyTrack = {
  name: "",
  labels: "",
  audioUrl: "",
  imageUrl: "",
  creatorName: "",
  sourceId: "",
  sourceCredit: "",
  audioMode: "upload",
};

export default function SoundboardPage() {
  const { user } = useAuth();
  const play = useSoundPlayerStore((state) => state.play);
  const addToQueue = useSoundPlayerStore((state) => state.addToQueue);
  const [boards, setBoards] = useState([]);
  const [sources, setSources] = useState([]);
  const [library, setLibrary] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [trackForm, setTrackForm] = useState(emptyTrack);
  const [boardForm, setBoardForm] = useState({
    name: "",
    description: "",
    shared: false,
  });
  const [sourceForm, setSourceForm] = useState({
    name: "",
    website_url: "",
    description: "",
  });
  const [editingSourceId, setEditingSourceId] = useState("");
  const [state, setState] = useState({
    loading: true,
    detailLoading: false,
    error: "",
    message: "",
  });
  const selectedIdRef = useRef("");
  const detailRequestGeneration = useRef(0);
  const workspaceRequestGeneration = useRef(0);

  const invalidateWorkspaceRequests = () => {
    workspaceRequestGeneration.current += 1;
  };
  const selectBoard = (nextId) => {
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
  };
  const loadWorkspace = async (preferredId) => {
    const requestGeneration = ++workspaceRequestGeneration.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [nextBoards, nextSources, nextLibrary] = await Promise.all([
        listSoundBoards(),
        listSoundSources(),
        listSoundLibrary(),
      ]);
      if (workspaceRequestGeneration.current !== requestGeneration)
        return false;
      setBoards(nextBoards);
      setSources(nextSources);
      setLibrary(nextLibrary);
      const nextSelectedId =
        preferredId !== undefined
          ? nextBoards.some((board) => board.id === preferredId)
            ? preferredId
            : nextBoards[0]?.id || ""
          : nextBoards.some((board) => board.id === selectedIdRef.current)
            ? selectedIdRef.current
            : nextBoards[0]?.id || "";
      selectBoard(nextSelectedId);
      setState((current) => ({ ...current, loading: false, error: "" }));
      return true;
    } catch (error) {
      if (workspaceRequestGeneration.current === requestGeneration) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message,
        }));
      }
      return false;
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);
  useEffect(() => {
    const availableLabels = new Set(
      library.flatMap((track) => (track.labels || []).map((label) => label.name)),
    );
    if (labelFilter && !availableLabels.has(labelFilter)) setLabelFilter("");
    if (sourceFilter && !sources.some((source) => source.id === sourceFilter)) setSourceFilter("");
    if (boardFilter && !boards.some((item) => item.id === boardFilter)) setBoardFilter("");
    if (trackForm.sourceId && !sources.some((source) => source.id === trackForm.sourceId)) {
      setTrackForm((current) => ({ ...current, sourceId: "" }));
    }
    if (editingSourceId && !sources.some((source) => source.id === editingSourceId)) {
      setEditingSourceId("");
      setSourceForm({ name: "", website_url: "", description: "" });
    }
  }, [boards, boardFilter, editingSourceId, labelFilter, library, sourceFilter, sources, trackForm.sourceId]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    const requestGeneration = ++detailRequestGeneration.current;
    setDetail(null);
    if (!selectedId) {
      setState((current) => ({ ...current, detailLoading: false }));
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, detailLoading: true, error: "" }));
    getSoundBoard(selectedId)
      .then((response) => {
        if (
          active &&
          selectedIdRef.current === selectedId &&
          detailRequestGeneration.current === requestGeneration
        ) {
          setDetail(response);
          setState((current) => ({ ...current, detailLoading: false }));
        }
      })
      .catch((error) => {
        if (
          active &&
          selectedIdRef.current === selectedId &&
          detailRequestGeneration.current === requestGeneration
        ) {
          setState((current) => ({
            ...current,
            detailLoading: false,
            error: error.message,
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const detailBelongsToSelection = detail?.board?.id === selectedId;
  const board = detailBelongsToSelection ? detail.board : null;
  const canEditBoard = board?.owner_id === user?.id;
  const attachedIds = new Set(
    (detail?.sounds || [])
      .filter((sound) => sound.library_track_id)
      .map((sound) => sound.library_track_id),
  );
  const labelOptions = [
    ...new Set(
      library.flatMap((track) =>
        (track.labels || []).map((label) => label.name),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredLibrary = library.filter((track) => {
    const labels = (track.labels || []).map((label) =>
      label.name.toLowerCase(),
    );
    const searchable = [
      track.name,
      track.source_name,
      ...labels,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!normalizedSearch || searchable.includes(normalizedSearch)) &&
      (!labelFilter || labels.includes(labelFilter.toLowerCase())) &&
      (!sourceFilter || track.source_id === sourceFilter) &&
      (!boardFilter || (track.board_ids || []).includes(boardFilter))
    );
  });
  const refreshBoard = async (boardId = board?.id) => {
    if (!boardId || selectedIdRef.current !== boardId) return false;
    invalidateWorkspaceRequests();
    const requestGeneration = ++detailRequestGeneration.current;
    setState((current) => ({
      ...current,
      loading: false,
      detailLoading: true,
    }));
    try {
      const refreshed = await getSoundBoard(boardId);
      if (
        selectedIdRef.current !== boardId ||
        detailRequestGeneration.current !== requestGeneration
      )
        return false;
      setDetail(refreshed);
      setBoards((current) =>
        current.map((item) =>
          item.id === refreshed.board.id ? refreshed.board : item,
        ),
      );
      setState((current) => ({ ...current, detailLoading: false }));
      return true;
    } catch (error) {
      if (
        selectedIdRef.current === boardId &&
        detailRequestGeneration.current === requestGeneration
      ) {
        setState((current) => ({
          ...current,
          detailLoading: false,
          error: error.message,
        }));
      }
      throw error;
    }
  };
  const updateLibraryBoardMembership = (trackId, boardId, attached) => {
    setLibrary((current) => current.map((track) => {
      if (track.id !== trackId) return track;
      const boardIds = track.board_ids || [];
      return { ...track, board_ids: attached ? [...new Set([...boardIds, boardId])] : boardIds.filter((id) => id !== boardId) };
    }));
  };

  const submitBoard = async (event) => {
    event.preventDefault();
    try {
      const created = await createSoundBoard(boardForm);
      setBoardForm({ name: "", description: "", shared: false });
      if (await loadWorkspace(created.id))
        setState((current) => ({
          ...current,
          message: `${created.name} created. Add tracks from your library below.`,
          error: "",
        }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const submitSource = async (event) => {
    event.preventDefault();
    try {
      const saved = editingSourceId
        ? await updateSoundSource(editingSourceId, sourceForm)
        : await createSoundSource(sourceForm);
      invalidateWorkspaceRequests();
      setSources((current) =>
        editingSourceId
          ? current.map((source) => (source.id === saved.id ? saved : source))
          : [saved, ...current],
      );
      setSourceForm({ name: "", website_url: "", description: "" });
      setEditingSourceId("");
      if (await loadWorkspace())
        setState((current) => ({
          ...current,
          message: "Source saved.",
          error: "",
        }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const submitTrack = async (event) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("name", trackForm.name);
    formData.append("labels", trackForm.labels);
    formData.append("image_url", trackForm.imageUrl);
    formData.append("creator_name", trackForm.creatorName);
    formData.append("source_id", trackForm.sourceId);
    formData.append("source_credit", trackForm.sourceCredit);
    if (trackForm.audioMode === "upload" && audioFile)
      formData.append("audio", audioFile);
    if (trackForm.audioMode === "url")
      formData.append("audio_url", trackForm.audioUrl);
    if (imageFile) formData.append("image", imageFile);
    try {
      const created = await uploadLibraryTrack(formData);
      invalidateWorkspaceRequests();
      setLibrary((current) => [created, ...current]);
      setTrackForm(emptyTrack);
      setAudioFile(null);
      setImageFile(null);
      event.target.reset();
      if (await loadWorkspace())
        setState((current) => ({
          ...current,
          message:
            "Track added to your library. Attach it to any private board.",
          error: "",
        }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const removeSource = async (source) => {
    if (
      !window.confirm(`Delete ${source.name}? Tracks will keep their credit.`)
    )
      return;
    try {
      await deleteSoundSource(source.id);
      invalidateWorkspaceRequests();
      setSources((current) => current.filter((item) => item.id !== source.id));
      setTrackForm((current) =>
        current.sourceId === source.id ? { ...current, sourceId: "" } : current,
      );
      await loadWorkspace();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const removeTrack = async (track) => {
    if (!window.confirm(`Delete ${track.name} from your library?`)) return;
    const selectedBoardId = board?.id;
    try {
      await deleteLibraryTrack(track.id);
      invalidateWorkspaceRequests();
      setLibrary((current) => current.filter((item) => item.id !== track.id));
      await loadWorkspace();
      if (selectedBoardId) {
        try {
          await refreshBoard(selectedBoardId);
        } catch (refreshError) {
          setState((current) => ({ ...current, error: refreshError.message }));
        }
      }
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const toggleAttachment = async (track) => {
    if (!board || selectedId !== board.id) return;
    const boardId = board.id;
    const wasAttached = attachedIds.has(track.id);
    try {
      if (wasAttached) await detachLibraryTrack(boardId, track.id);
      else await attachLibraryTrack(boardId, track.id);
      updateLibraryBoardMembership(track.id, boardId, !wasAttached);
      if (await refreshBoard(boardId)) {
        setState((current) => ({
          ...current,
          message: wasAttached ? "Track detached." : "Track attached.",
          error: "",
        }));
      }
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const removeSound = async (sound) => {
    if (
      !board ||
      selectedId !== board.id ||
      !window.confirm(`Remove ${sound.name} from this board?`)
    )
      return;
    const boardId = board.id;
    try {
      if (sound.library_track_id)
        await detachLibraryTrack(boardId, sound.library_track_id);
      else await deleteSound(boardId, sound.id);
      if (sound.library_track_id)
        updateLibraryBoardMembership(sound.library_track_id, boardId, false);
      await refreshBoard(boardId);
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const removeBoard = async () => {
    if (!board || !window.confirm(`Delete ${board.name}?`)) return;
    try {
      await deleteSoundBoard(board.id);
      if (await loadWorkspace("")) {
        setDetail(null);
        setState((current) => ({
          ...current,
          message: "Soundboard deleted.",
          error: "",
        }));
      }
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };
  const addPreset = (preset) => {
    const labels = trackForm.labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    if (!labels.includes(preset))
      setTrackForm((current) => ({
        ...current,
        labels: [...labels, preset].join(", "),
      }));
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <p className="eyebrow">GM SOUND LIBRARY</p>
        <h2>Soundboards</h2>
        <p className="muted">
          Build a reusable collection once, then bring the right atmosphere to
          every table.
        </p>
      </header>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className={styles.message} role="status">
          {state.message}
        </p>
      )}
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>
            <h3>Boards</h3>
            <span>{boards.length}</span>
          </div>
          <div className={styles.boardList}>
            {boards.map((item) => (
              <button
                className={`${styles.boardButton} ${item.id === selectedId ? styles.selected : ""}`}
                type="button"
                key={item.id}
                onClick={() => {
                  if (item.id === selectedId) refreshBoard(item.id).catch(() => {});
                  else selectBoard(item.id);
                }}
                aria-pressed={item.id === selectedId}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.shared ? "Shared GM board" : "Private board"} ·{" "}
                  {item.sound_count} tracks
                </span>
              </button>
            ))}
            {!state.loading && boards.length === 0 && (
              <p className="muted">No boards yet.</p>
            )}
          </div>
          <form className={styles.boardForm} onSubmit={submitBoard}>
            <p className={styles.formEyebrow}>NEW BOARD</p>
            <label>
              Name
              <input
                value={boardForm.name}
                onChange={(event) =>
                  setBoardForm({ ...boardForm, name: event.target.value })
                }
                required
                maxLength={120}
              />
            </label>
            <label>
              Description
              <textarea
                value={boardForm.description}
                onChange={(event) =>
                  setBoardForm({
                    ...boardForm,
                    description: event.target.value,
                  })
                }
                rows="3"
                maxLength={800}
              />
            </label>
            {canManageUsers(user) && (
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={boardForm.shared}
                  onChange={(event) =>
                    setBoardForm({ ...boardForm, shared: event.target.checked })
                  }
                />{" "}
                Share with every GM
              </label>
            )}
            <Button type="submit">Create board</Button>
          </form>
        </aside>
        <main className={styles.main}>
          <section className={styles.librarySection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">YOUR COLLECTION</p>
                <h3>Library</h3>
              </div>
              <span>{library.length}</span>
            </div>
            <LibraryFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              labelFilter={labelFilter}
              setLabelFilter={setLabelFilter}
              labelOptions={labelOptions}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              sources={sources}
              boardFilter={boardFilter}
              setBoardFilter={setBoardFilter}
              boards={boards}
            />
            <form className={styles.soundForm} onSubmit={submitTrack}>
              <div className={styles.formHeading}>
                <div>
                  <p className={styles.formEyebrow}>ADD TRACK</p>
                  <h3>Add once, reuse everywhere</h3>
                </div>
                <span className={styles.limit}>
                  Audio up to 50 MB · artwork up to 5 MB
                </span>
              </div>
              <div className={styles.formGrid}>
                <label>
                  Track name
                  <input
                    value={trackForm.name}
                    onChange={(event) =>
                      setTrackForm({ ...trackForm, name: event.target.value })
                    }
                    required
                    maxLength={160}
                    placeholder="Rain on the shutters"
                  />
                </label>
                <label>
                  Labels
                  <input
                    value={trackForm.labels}
                    onChange={(event) =>
                      setTrackForm({ ...trackForm, labels: event.target.value })
                    }
                    placeholder="ambiance, music"
                  />
                  <span className={styles.hint}>
                    Comma-separated; up to 12 labels.
                  </span>
                  <span className={styles.presets}>
                    {LABEL_PRESETS.map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => addPreset(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </span>
                </label>
                <fieldset>
                  <legend>Audio source</legend>
                  <div className={styles.modeSwitch}>
                    <button
                      type="button"
                      className={
                        trackForm.audioMode === "upload"
                          ? styles.activeMode
                          : ""
                      }
                      onClick={() =>
                        setTrackForm({ ...trackForm, audioMode: "upload" })
                      }
                    >
                      Upload file
                    </button>
                    <button
                      type="button"
                      className={
                        trackForm.audioMode === "url" ? styles.activeMode : ""
                      }
                      onClick={() =>
                        setTrackForm({ ...trackForm, audioMode: "url" })
                      }
                    >
                      External URL
                    </button>
                  </div>
                  {trackForm.audioMode === "upload" ? (
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) =>
                        setAudioFile(event.target.files?.[0] || null)
                      }
                      required
                    />
                  ) : (
                    <input
                      value={trackForm.audioUrl}
                      onChange={(event) =>
                        setTrackForm({
                          ...trackForm,
                          audioUrl: event.target.value,
                        })
                      }
                      placeholder="https://..."
                      type="url"
                      required
                    />
                  )}
                </fieldset>
                <fieldset>
                  <legend>Artwork or logo</legend>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setImageFile(event.target.files?.[0] || null)
                    }
                  />
                  <input
                    value={trackForm.imageUrl}
                    onChange={(event) =>
                      setTrackForm({
                        ...trackForm,
                        imageUrl: event.target.value,
                      })
                    }
                    placeholder="Optional artwork URL"
                    type="url"
                  />
                </fieldset>
                <label>
                  Creator
                  <input
                    value={trackForm.creatorName}
                    onChange={(event) =>
                      setTrackForm({
                        ...trackForm,
                        creatorName: event.target.value,
                      })
                    }
                    maxLength={160}
                    placeholder="Creator or studio"
                  />
                </label>
                <label>
                  Named source
                  <select
                    value={trackForm.sourceId}
                    onChange={(event) =>
                      setTrackForm({
                        ...trackForm,
                        sourceId: event.target.value,
                      })
                    }
                  >
                    <option value="">No named source</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.wide}>
                  Source credit
                  <input
                    value={trackForm.sourceCredit}
                    onChange={(event) =>
                      setTrackForm({
                        ...trackForm,
                        sourceCredit: event.target.value,
                      })
                    }
                    maxLength={800}
                    placeholder="License, creator credit, or attribution"
                  />
                </label>
              </div>
              <Button type="submit">Add to library</Button>
            </form>
            {library.length === 0 ? (
              <p className="muted">
                Your library is empty. Add a track above before choosing a
                board.
              </p>
            ) : filteredLibrary.length === 0 ? (
              <p className="muted">No sounds match these filters.</p>
            ) : (
              <div className={styles.soundGrid}>
                {filteredLibrary.map((track) => (
                  <LibraryCard
                    key={track.id}
                    track={track}
                    board={board}
                    attached={attachedIds.has(track.id)}
                    canAttach={canEditBoard}
                    onPlay={play}
                    onToggle={toggleAttachment}
                    onDelete={removeTrack}
                  />
                ))}
              </div>
            )}
          </section>
          <section className={styles.sourceSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">CREDITS</p>
                <h3>Named sources</h3>
              </div>
              <span>{sources.length}</span>
            </div>
            <form className={styles.sourceForm} onSubmit={submitSource}>
              <input
                value={sourceForm.name}
                onChange={(event) =>
                  setSourceForm({ ...sourceForm, name: event.target.value })
                }
                required
                maxLength={160}
                placeholder="Tabletop Audio"
                aria-label="Source name"
              />
              <input
                value={sourceForm.website_url}
                onChange={(event) =>
                  setSourceForm({
                    ...sourceForm,
                    website_url: event.target.value,
                  })
                }
                required
                type="url"
                placeholder="https://tabletopaudio.com"
                aria-label="Source website URL"
              />
              <input
                value={sourceForm.description}
                onChange={(event) =>
                  setSourceForm({
                    ...sourceForm,
                    description: event.target.value,
                  })
                }
                maxLength={800}
                placeholder="Credit or description"
                aria-label="Source credit or description"
              />
              <Button type="submit">
                {editingSourceId ? "Save source" : "Add source"}
              </Button>
              {editingSourceId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSourceId("");
                    setSourceForm({
                      name: "",
                      website_url: "",
                      description: "",
                    });
                  }}
                >
                  Cancel
                </button>
              )}
            </form>
            {sources.length === 0 ? (
              <p className="muted">No named sources yet.</p>
            ) : (
              <div className={styles.sourceList}>
                {sources.map((source) => (
                  <article key={source.id}>
                    <div>
                      <strong>{source.name}</strong>
                      <a
                        href={source.website_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.website_url}
                      </a>
                      <p>{source.description || "No description."}</p>
                    </div>
                    <div className={styles.sourceActions}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSourceId(source.id);
                          setSourceForm({
                            name: source.name,
                            website_url: source.website_url,
                            description: source.description,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSource(source)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          {state.loading || (!board && state.detailLoading) ? (
            <p className="muted">Loading soundboard...</p>
          ) : !board ? (
            <div className={styles.empty}>
              <p className="eyebrow">READY ROOM</p>
              <h3>Create a board when you are ready</h3>
              <p className="muted">
                Your library and sources are independent from boards, so no
                upload is required here.
              </p>
            </div>
          ) : (
            <BoardDetail
              board={board}
              detail={detail}
              canEdit={canEditBoard}
              onPlay={play}
              onQueue={addToQueue}
              onDelete={removeSound}
              onDeleteBoard={removeBoard}
            />
          )}
        </main>
      </div>
    </section>
  );
}

function LibraryFilters({
  searchTerm,
  setSearchTerm,
  labelFilter,
  setLabelFilter,
  labelOptions,
  sourceFilter,
  setSourceFilter,
  sources,
  boardFilter,
  setBoardFilter,
  boards,
}) {
  const hasFilters = searchTerm || labelFilter || sourceFilter || boardFilter;
  return (
    <div className={styles.libraryFilters}>
      <label className={styles.searchField}>
        Search sounds
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by name, label, or named source"
        />
      </label>
      <label>
        Label
        <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
          <option value="">All labels</option>
          {labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
        </select>
      </label>
      <label>
        Named source
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="">All sources</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <label>
        Soundboard
        <select value={boardFilter} onChange={(event) => setBoardFilter(event.target.value)}>
          <option value="">All soundboards</option>
          {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
        </select>
      </label>
      {hasFilters && <button className={styles.clearFilters} type="button" onClick={() => { setSearchTerm(""); setLabelFilter(""); setSourceFilter(""); setBoardFilter(""); }}>Clear filters</button>}
    </div>
  );
}

function LibraryCard({
  track,
  board,
  attached,
  canAttach,
  onPlay,
  onToggle,
  onDelete,
}) {
  const audioSource =
    track.audio_url ||
    (track.has_audio_upload ? libraryMediaUrl(track.id, "audio") : "");
  const imageSource =
    track.image_url ||
    (track.has_image_upload ? libraryMediaUrl(track.id, "image") : "");
  return (
    <article className={styles.soundCard}>
      {imageSource ? (
        <img className={styles.soundImage} src={imageSource} alt="" />
      ) : (
        <div className={styles.soundImagePlaceholder}>LIBRARY</div>
      )}
      <div className={styles.soundBody}>
        <div className={styles.soundTitle}>
          <h4>{track.name}</h4>
          <button
            className={styles.removeSound}
            type="button"
            onClick={() => onDelete(track)}
            aria-label={`Delete ${track.name}`}
            title="Delete from library"
          >
            ×
          </button>
        </div>
        <div className={styles.labels}>
          {track.labels.map((label) => (
            <span key={label.id}>{label.name}</span>
          ))}
        </div>
        <div className={styles.soundActions}>
          <button
            className={styles.playButton}
            type="button"
            onClick={() =>
              onPlay({
                ...track,
                audioSource,
                imageSource,
                boardName: board?.name || "Sound library",
              })
            }
            disabled={!audioSource}
          >
            Play now
          </button>
          <button
            className={styles.attachButton}
            type="button"
            onClick={() =>
              useSoundPlayerStore
                .getState()
                .addToQueue({
                  ...track,
                  audioSource,
                  imageSource,
                  boardName: board?.name || "Sound library",
                })
            }
            disabled={!audioSource}
          >
            Add to queue
          </button>
        </div>
        {canAttach && board && (
          <button
            className={styles.attachButton}
            type="button"
            onClick={() => onToggle(track)}
          >
            {attached ? "Detach from board" : "Add to board"}
          </button>
        )}
        <small className={styles.cardCredit}>
          {track.source_name || "No named source"}
        </small>
      </div>
    </article>
  );
}

function BoardDetail({
  board,
  detail,
  canEdit,
  onPlay,
  onQueue,
  onDelete,
  onDeleteBoard,
}) {
  const credits = detail.sounds.filter((sound) => sound.source_name);
  return (
    <>
      <div className={styles.boardHeading}>
        <div>
          <p className="eyebrow">
            {board.shared ? "SHARED GM BOARD" : "PRIVATE GM BOARD"}
          </p>
          <h3>{board.name}</h3>
          <p className="muted">{board.description || "No description yet."}</p>
        </div>
        {canEdit && (
          <button
            className={styles.deleteBoard}
            type="button"
            onClick={onDeleteBoard}
          >
            Delete board
          </button>
        )}
      </div>
      <section className={styles.soundSection}>
        <div className={styles.sectionHeading}>
          <h3>Attached tracks</h3>
          <span>{detail.sounds.length}</span>
        </div>
        {detail.sounds.length === 0 ? (
          <p className="muted">
            This board is quiet. Add a library track above.
          </p>
        ) : (
          <div className={styles.soundGrid}>
            {detail.sounds.map((sound) => (
              <BoardSoundCard
                key={`${sound.library_track_id || "direct"}-${sound.id}`}
                sound={sound}
                board={board}
                canEdit={canEdit}
                onPlay={onPlay}
                onQueue={onQueue}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>
      {credits.length > 0 && (
        <section className={styles.credits}>
          <p className="eyebrow">CREDITS</p>
          <h3>Track sources</h3>
          {credits.map((sound) => (
            <p key={`${sound.id}-credit`}>
              {sound.source_name && sound.source_url ? (
                <a href={sound.source_url} target="_blank" rel="noreferrer">
                  {sound.source_name}
                </a>
              ) : (
                sound.source_name
              )}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

function BoardSoundCard({ sound, board, canEdit, onPlay, onQueue, onDelete }) {
  const audioSource =
    sound.audio_url ||
    (sound.has_audio_upload ? soundMediaUrl(board.id, sound.id, "audio") : "");
  const imageSource =
    sound.image_url ||
    (sound.has_image_upload ? soundMediaUrl(board.id, sound.id, "image") : "");
  return (
    <article className={styles.soundCard}>
      {imageSource ? (
        <img className={styles.soundImage} src={imageSource} alt="" />
      ) : (
        <div className={styles.soundImagePlaceholder}>SOUND</div>
      )}
      <div className={styles.soundBody}>
        <div className={styles.soundTitle}>
          <h4>{sound.name}</h4>
          {canEdit && (
            <button
              className={styles.removeSound}
              type="button"
              onClick={() => onDelete(sound)}
              aria-label={`Remove ${sound.name}`}
              title="Remove sound"
            >
              ×
            </button>
          )}
        </div>
        <div className={styles.labels}>
          {sound.labels.map((label) => (
            <span key={label.id}>{label.name}</span>
          ))}
        </div>
        <div className={styles.soundActions}>
          <button
            className={styles.playButton}
            type="button"
            onClick={() =>
              onPlay({
                ...sound,
                audioSource,
                imageSource,
                boardName: board.name,
              })
            }
            disabled={!audioSource}
          >
            Play now
          </button>
          <button
            className={styles.attachButton}
            type="button"
            onClick={() =>
              onQueue({
                ...sound,
                audioSource,
                imageSource,
                boardName: board.name,
              })
            }
            disabled={!audioSource}
          >
            Add to queue
          </button>
        </div>
        {sound.source_name && (
          <small className={styles.cardCredit}>
            {sound.source_name}
          </small>
        )}
      </div>
    </article>
  );
}
