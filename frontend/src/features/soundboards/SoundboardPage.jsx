import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { canManageUsers } from "../../utils/permissions";
import Button from "../../components/Button/Button";
import {
	attachLibraryTrack,
	createSoundLabel,
	createSoundBoard,
	createSoundPlaylist,
	createSoundSource,
	deleteLibraryTrack,
	deleteSound,
	deleteSoundBoard,
	deleteSoundSource,
	deleteSoundPlaylist,
	detachLibraryTrack,
	getSoundBoard,
	libraryMediaUrl,
	listSoundBoards,
	listSoundLabels,
	listSoundLibrary,
	listSoundPlaylists,
	listSoundSources,
	soundMediaUrl,
	updateLibraryLabels,
	updateSoundPlaylist,
	updateSoundSource,
	uploadLibraryTrack,
} from "./soundboardApi";
import {
	createPlayerSound,
	useSoundPlayerStore,
} from "./soundboardStore";
import { fisherYatesShuffle } from "./soundboardUtils";
import styles from "./SoundboardPage.module.css";

const LABEL_PRESETS = ["ambiance", "music", "minimal music"];
const emptyTrack = {
	name: "",
	labels: "",
	audioUrl: "",
	imageUrl: "",
	sourceId: "",
	audioMode: "upload",
};

export default function SoundboardPage() {
	const { user } = useAuth();
	const play = useSoundPlayerStore((state) => state.play);
	const addToQueue = useSoundPlayerStore((state) => state.addToQueue);
	const launchSequence = useSoundPlayerStore((state) => state.launchSequence);
	const [boards, setBoards] = useState([]);
	const [sources, setSources] = useState([]);
	const [library, setLibrary] = useState([]);
	const [labels, setLabels] = useState([]);
	const [playlists, setPlaylists] = useState([]);
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
	const [newLabel, setNewLabel] = useState("");
	const [state, setState] = useState({
		loading: true,
		detailLoading: false,
		error: "",
		message: "",
	});
	const selectedIdRef = useRef("");
	const detailRequestGeneration = useRef(0);
	const workspaceRequestGeneration = useRef(0);
	const workspaceMutationGeneration = useRef(0);
	const workspaceMutationsInFlight = useRef(0);
	const labelRequestGenerations = useRef(new Map());
	const playlistRequestGenerations = useRef(new Map());
	const labelSavePending = useRef(new Set());
	const playlistMutationPending = useRef(new Set());
	const [pendingLabelTrackIds, setPendingLabelTrackIds] = useState(new Set());
	const [pendingPlaylistIds, setPendingPlaylistIds] = useState(new Set());

	const invalidateWorkspaceRequests = () => {
		workspaceRequestGeneration.current += 1;
	};
	const beginWorkspaceMutation = () => {
		workspaceMutationGeneration.current += 1;
		workspaceMutationsInFlight.current += 1;
		invalidateWorkspaceRequests();
	};
	const endWorkspaceMutation = () => {
		workspaceMutationGeneration.current += 1;
		workspaceMutationsInFlight.current = Math.max(
			0,
			workspaceMutationsInFlight.current - 1,
		);
		return workspaceMutationsInFlight.current === 0;
	};
	const selectBoard = (nextId) => {
		selectedIdRef.current = nextId;
		setSelectedId(nextId);
	};
	const loadWorkspace = async (preferredId) => {
		const requestGeneration = ++workspaceRequestGeneration.current;
		const mutationGeneration = workspaceMutationGeneration.current;
		setState((current) => ({ ...current, loading: true, error: "" }));
		try {
			const [nextBoards, nextSources, nextLibrary, nextLabels, nextPlaylists] =
				await Promise.all([
				listSoundBoards(),
				listSoundSources(),
				listSoundLibrary(),
				listSoundLabels(),
				listSoundPlaylists(),
				]);
			if (
				workspaceRequestGeneration.current !== requestGeneration ||
				workspaceMutationGeneration.current !== mutationGeneration ||
				workspaceMutationsInFlight.current > 0
			)
				return false;
			setBoards(nextBoards);
			setSources(nextSources);
			setLibrary(nextLibrary);
			setLabels(nextLabels);
			setPlaylists(nextPlaylists);
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
			if (
				workspaceRequestGeneration.current === requestGeneration &&
				workspaceMutationGeneration.current === mutationGeneration &&
				workspaceMutationsInFlight.current === 0
			) {
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
			[
				...labels.map((label) => label.name),
				...library.flatMap((track) =>
					(track.labels || []).map((label) => label.name),
				),
			],
		);
		if (labelFilter && !availableLabels.has(labelFilter)) setLabelFilter("");
		if (sourceFilter && !sources.some((source) => source.id === sourceFilter))
			setSourceFilter("");
		if (boardFilter && !boards.some((item) => item.id === boardFilter))
			setBoardFilter("");
		if (
			trackForm.sourceId &&
			!sources.some((source) => source.id === trackForm.sourceId)
		) {
			setTrackForm((current) => ({ ...current, sourceId: "" }));
		}
		if (
			editingSourceId &&
			!sources.some((source) => source.id === editingSourceId)
		) {
			setEditingSourceId("");
			setSourceForm({ name: "", website_url: "", description: "" });
		}
	}, [
		boards,
		boardFilter,
		editingSourceId,
		labelFilter,
		library,
		labels,
		sourceFilter,
		sources,
		trackForm.sourceId,
	]);
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
			[
				...labels.map((label) => label.name),
				...library.flatMap((track) =>
					(track.labels || []).map((label) => label.name),
				),
			],
		),
	].sort((a, b) => a.localeCompare(b));
	const normalizedSearch = searchTerm.trim().toLowerCase();
	const filteredLibrary = library.filter((track) => {
		const labels = (track.labels || []).map((label) =>
			label.name.toLowerCase(),
		);
		const searchable = [track.name, track.source_name, ...labels]
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
		setLibrary((current) =>
			current.map((track) => {
				if (track.id !== trackId) return track;
				const boardIds = track.board_ids || [];
				return {
					...track,
					board_ids: attached
						? [...new Set([...boardIds, boardId])]
						: boardIds.filter((id) => id !== boardId),
				};
			}),
		);
	};
	const saveTrackLabels = async (trackId, labelIds) => {
		if (labelSavePending.current.has(trackId)) return false;
		labelSavePending.current.add(trackId);
		setPendingLabelTrackIds((current) => new Set(current).add(trackId));
		beginWorkspaceMutation();
		const requestGeneration =
			(labelRequestGenerations.current.get(trackId) || 0) + 1;
		labelRequestGenerations.current.set(trackId, requestGeneration);
		let mutationError = "";
		try {
			const updated = await updateLibraryLabels(trackId, labelIds);
			if (labelRequestGenerations.current.get(trackId) !== requestGeneration)
				return;
			setLibrary((current) =>
				current.map((track) => (track.id === trackId ? updated : track)),
			);
			setState((current) => ({ ...current, message: "Labels saved.", error: "" }));
			return true;
		} catch (error) {
			if (labelRequestGenerations.current.get(trackId) === requestGeneration)
				mutationError = error.message;
			return false;
		} finally {
			labelSavePending.current.delete(trackId);
			setPendingLabelTrackIds((current) => {
				const next = new Set(current);
				next.delete(trackId);
				return next;
			});
			if (endWorkspaceMutation()) await loadWorkspace();
			if (mutationError)
				setState((current) => ({ ...current, error: mutationError }));
		}
	};
	const submitLabel = async (event) => {
		event.preventDefault();
		beginWorkspaceMutation();
		let mutationError = "";
		try {
			const created = await createSoundLabel({ name: newLabel });
			setLabels((current) =>
				[created, ...current.filter((label) => label.id !== created.id)].sort(
					(a, b) => a.name.localeCompare(b.name),
				),
			);
			setNewLabel("");
			setState((current) => ({
				...current,
				message: `${created.name} is ready to use on library tracks.`,
				error: "",
			}));
		} catch (error) {
			mutationError = error.message;
		} finally {
			if (endWorkspaceMutation()) await loadWorkspace();
			if (mutationError)
				setState((current) => ({ ...current, error: mutationError }));
		}
	};
	const savePlaylist = async (playlistId, payload) => {
		const pendingKey = playlistId || "new";
		if (playlistMutationPending.current.has(pendingKey)) return null;
		playlistMutationPending.current.add(pendingKey);
		setPendingPlaylistIds((current) => new Set(current).add(pendingKey));
		beginWorkspaceMutation();
		const requestGeneration =
			(playlistRequestGenerations.current.get(pendingKey) || 0) + 1;
		playlistRequestGenerations.current.set(pendingKey, requestGeneration);
		let mutationError = "";
		try {
			const saved = playlistId
				? await updateSoundPlaylist(playlistId, payload)
				: await createSoundPlaylist(payload);
			if (
				playlistRequestGenerations.current.get(pendingKey) !==
				requestGeneration
			)
				return null;
			setPlaylists((current) =>
				playlistId
					? current.some((playlist) => playlist.id === saved.id)
						? current.map((playlist) =>
								playlist.id === saved.id ? saved : playlist,
							)
						: [saved, ...current]
					: [...current, saved],
			);
			setState((current) => ({
				...current,
				message: playlistId ? "Playlist saved." : "Playlist created.",
				error: "",
			}));
			return saved;
		} catch (error) {
			if (
				playlistRequestGenerations.current.get(pendingKey) ===
				requestGeneration
			)
				mutationError = error.message;
			return null;
		} finally {
			playlistMutationPending.current.delete(pendingKey);
			setPendingPlaylistIds((current) => {
				const next = new Set(current);
				next.delete(pendingKey);
				return next;
			});
			if (endWorkspaceMutation()) await loadWorkspace();
			if (mutationError)
				setState((current) => ({ ...current, error: mutationError }));
		}
	};
	const removePlaylist = async (playlist) => {
		if (!window.confirm(`Delete ${playlist.name}?`)) return;
		if (playlistMutationPending.current.has(playlist.id)) return;
		playlistMutationPending.current.add(playlist.id);
		setPendingPlaylistIds((current) => new Set(current).add(playlist.id));
		beginWorkspaceMutation();
		let mutationError = "";
		try {
			await deleteSoundPlaylist(playlist.id);
			setPlaylists((current) =>
				current.filter((item) => item.id !== playlist.id),
			);
			setState((current) => ({ ...current, message: "Playlist deleted.", error: "" }));
		} catch (error) {
			mutationError = error.message;
		} finally {
			playlistMutationPending.current.delete(playlist.id);
			setPendingPlaylistIds((current) => {
				const next = new Set(current);
				next.delete(playlist.id);
				return next;
			});
			if (endWorkspaceMutation()) await loadWorkspace();
			if (mutationError)
				setState((current) => ({ ...current, error: mutationError }));
		}
	};
	const launchPlaylist = (playlist, shuffled) => {
		const tracks = playlist.tracks.map(({ track }) =>
			createPlayerSound(track, {
				audioSource:
					track.audio_url ||
					(track.has_audio_upload ? libraryMediaUrl(track.id, "audio") : ""),
				imageSource:
					track.image_url ||
					(track.has_image_upload ? libraryMediaUrl(track.id, "image") : ""),
				boardName: `Playlist: ${playlist.name}`,
				boardId: `playlist:${playlist.id}`,
				sourceKind: "playlist",
				sourceId: `${playlist.id}:${track.id}`,
			}),
		);
		const launchTracks = shuffled ? fisherYatesShuffle(tracks) : tracks;
		launchSequence(launchTracks);
		setState((current) => ({
			...current,
			message: `${playlist.name} launched ${shuffled ? "randomly" : "in order"}. The current queue was kept.`,
			error: "",
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
		formData.append("source_id", trackForm.sourceId);
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
									if (item.id === selectedId)
										refreshBoard(item.id).catch(() => {});
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
												labelIds={labels}
												onSaveLabels={saveTrackLabels}
							sourceFilter={sourceFilter}
							setSourceFilter={setSourceFilter}
							sources={sources}
							boardFilter={boardFilter}
							setBoardFilter={setBoardFilter}
							boards={boards}
						/>
						<LabelManager
							newLabel={newLabel}
							setNewLabel={setNewLabel}
							onSubmit={submitLabel}
							labels={labelOptions}
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
							</div>
							<Button type="submit">Add to library</Button>
						</form>
						<PlaylistSection
							playlists={playlists}
							library={library}
							pendingPlaylistIds={pendingPlaylistIds}
							onSave={savePlaylist}
							onDelete={removePlaylist}
							onLaunch={launchPlaylist}
						/>
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
										labelOptions={labelOptions}
										labelIds={labels}
										onSaveLabels={saveTrackLabels}
												pendingLabelSave={pendingLabelTrackIds.has(track.id)}
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
				<select
					value={labelFilter}
					onChange={(event) => setLabelFilter(event.target.value)}
				>
					<option value="">All labels</option>
					{labelOptions.map((label) => (
						<option key={label} value={label}>
							{label}
						</option>
					))}
				</select>
			</label>
			<label>
				Named source
				<select
					value={sourceFilter}
					onChange={(event) => setSourceFilter(event.target.value)}
				>
					<option value="">All sources</option>
					{sources.map((source) => (
						<option key={source.id} value={source.id}>
							{source.name}
						</option>
					))}
				</select>
			</label>
			<label>
				Soundboard
				<select
					value={boardFilter}
					onChange={(event) => setBoardFilter(event.target.value)}
				>
					<option value="">All soundboards</option>
					{boards.map((board) => (
						<option key={board.id} value={board.id}>
							{board.name}
						</option>
					))}
				</select>
			</label>
			{hasFilters && (
				<button
					className={styles.clearFilters}
					type="button"
					onClick={() => {
						setSearchTerm("");
						setLabelFilter("");
						setSourceFilter("");
						setBoardFilter("");
					}}
				>
					Clear filters
				</button>
			)}
		</div>
	);
}

function LabelManager({ newLabel, setNewLabel, onSubmit, labels }) {
	return (
		<section className={styles.labelManager} aria-labelledby="sound-labels-heading">
			<div>
				<p className="eyebrow">LABELS</p>
				<h3 id="sound-labels-heading">Your sound labels</h3>
				<p className={styles.hint}>
					Create labels once, then tick them on any library track.
				</p>
			</div>
			<form className={styles.labelForm} onSubmit={onSubmit}>
				<input
					value={newLabel}
					onChange={(event) => setNewLabel(event.target.value)}
					placeholder="e.g. tense"
					maxLength={40}
					required
					aria-label="New label name"
				/>
				<button type="submit">Create label</button>
			</form>
			{labels.length > 0 && (
				<p className={styles.labelList}>
					Existing: {labels.join(", ")}
				</p>
			)}
		</section>
	);
}

function PlaylistSection({
	playlists,
	library,
	pendingPlaylistIds,
	onSave,
	onDelete,
	onLaunch,
}) {
	const [selectedId, setSelectedId] = useState("");
	const [name, setName] = useState("");
	const [trackIds, setTrackIds] = useState([]);
	const [trackToAdd, setTrackToAdd] = useState("");
	const [saving, setSaving] = useState(false);
	const hydratedPlaylistId = useRef("");
	const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedId);
	const playlistPending =
		saving || pendingPlaylistIds.has(selectedId || "new");
	const isDirty = selectedPlaylist
		? name !== selectedPlaylist.name ||
			trackIds.join(",") !== selectedPlaylist.tracks.map(({ track }) => track.id).join(",")
		: name !== "" || trackIds.length > 0;
	useEffect(() => {
		if (selectedId && !selectedPlaylist) setSelectedId("");
	}, [selectedId, selectedPlaylist]);
	useEffect(() => {
		const playlistId = selectedPlaylist?.id || "";
		if (hydratedPlaylistId.current === playlistId) return;
		hydratedPlaylistId.current = playlistId;
		if (selectedPlaylist) {
			setName(selectedPlaylist.name);
			setTrackIds(selectedPlaylist.tracks.map(({ track }) => track.id));
		} else {
			setName("");
			setTrackIds([]);
		}
	}, [selectedPlaylist]);
	const startNew = () => {
		setSelectedId("");
		setName("");
		setTrackIds([]);
	};
	const save = async (event) => {
		event.preventDefault();
		if (saving) return;
		setSaving(true);
		try {
			const saved = await onSave(selectedId, { name, track_ids: trackIds });
			if (saved) {
				setSelectedId(saved.id);
				setName(saved.name);
				setTrackIds(saved.tracks.map(({ track }) => track.id));
			}
		} finally {
			setSaving(false);
		}
	};
	const addTrack = () => {
		if (trackToAdd && !trackIds.includes(trackToAdd)) {
			setTrackIds((current) => [...current, trackToAdd]);
			setTrackToAdd("");
		}
	};
	const moveTrack = (index, direction) => {
		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= trackIds.length) return;
		setTrackIds((current) => {
			const next = [...current];
			[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
			return next;
		});
	};
	const playlistForLaunch = selectedPlaylist;
	return (
		<section className={styles.playlistSection} aria-labelledby="sound-playlists-heading">
			<div className={styles.sectionHeading}>
				<div>
					<p className="eyebrow">PLAYLISTS</p>
					<h3 id="sound-playlists-heading">Saved playback sequences</h3>
					<p className={styles.hint}>
						Launch replaces the active sequence only; your current queue stays intact.
					</p>
				</div>
				<button className={styles.attachButton} type="button" onClick={startNew} disabled={playlistPending}>
					New playlist
				</button>
			</div>
			{playlists.length > 0 && (
				<label className={styles.playlistPicker}>
					Saved playlist
					<select
						value={selectedId}
						onChange={(event) => setSelectedId(event.target.value)}
						disabled={playlistPending}
					>
						<option value="">New playlist</option>
						{playlists.map((playlist) => (
							<option key={playlist.id} value={playlist.id}>
								{playlist.name}
							</option>
						))}
					</select>
				</label>
			)}
			<form className={styles.playlistEditor} onSubmit={save}>
				<label>
					Playlist name
					<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={playlistPending} />
				</label>
				<div className={styles.playlistAdd}>
					<label>
						Add library track
						<select value={trackToAdd} onChange={(event) => setTrackToAdd(event.target.value)} disabled={playlistPending}>
							<option value="">Choose a track</option>
							{library
								.filter((track) => !trackIds.includes(track.id))
								.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
						</select>
					</label>
					<button className={styles.attachButton} type="button" onClick={addTrack} disabled={playlistPending || !trackToAdd}>Add track</button>
				</div>
				<ol className={styles.playlistTracks}>
					{trackIds.map((trackId, index) => {
						const track = library.find((item) => item.id === trackId);
						return (
							<li key={trackId}>
								<span>{track?.name || "Track unavailable"}</span>
								<div>
									<button type="button" onClick={() => moveTrack(index, -1)} disabled={playlistPending || index === 0} aria-label={`Move ${track?.name || "track"} up`} title="Move up">↑</button>
									<button type="button" onClick={() => moveTrack(index, 1)} disabled={playlistPending || index === trackIds.length - 1} aria-label={`Move ${track?.name || "track"} down`} title="Move down">↓</button>
									<button type="button" onClick={() => setTrackIds((current) => current.filter((id) => id !== trackId))} disabled={playlistPending} aria-label={`Remove ${track?.name || "track"}`}>Remove</button>
								</div>
							</li>
						);
					})}
				</ol>
				<div className={styles.playlistActions}>
					<button className={styles.playButton} type="submit" disabled={playlistPending}>{saving ? "Saving playlist" : selectedId ? "Save playlist" : "Create playlist"}</button>
					<button className={styles.attachButton} type="button" disabled={playlistPending || !playlistForLaunch || isDirty} onClick={() => onLaunch(playlistForLaunch, false)}>Launch in order</button>
					<button className={styles.attachButton} type="button" disabled={playlistPending || !playlistForLaunch || isDirty} onClick={() => onLaunch(playlistForLaunch, true)}>Launch randomly</button>
					{selectedPlaylist && <button className={styles.deleteBoard} type="button" disabled={playlistPending} onClick={() => onDelete(selectedPlaylist)}>Delete playlist</button>}
				</div>
			</form>
		</section>
	);
}

function LibraryCard({
	track,
	board,
	attached,
	canAttach,
	labelOptions,
	labelIds,
	onSaveLabels,
	pendingLabelSave,
	onPlay,
	onToggle,
	onDelete,
}) {
	const [labelsOpen, setLabelsOpen] = useState(false);
	const [selectedLabelIds, setSelectedLabelIds] = useState(
		track.labels.map((label) => label.id),
	);
	useEffect(() => {
		if (!labelsOpen) setSelectedLabelIds(track.labels.map((label) => label.id));
	}, [labelsOpen, track.labels]);
	const audioSource =
		track.audio_url ||
		(track.has_audio_upload ? libraryMediaUrl(track.id, "audio") : "");
	const imageSource =
		track.image_url ||
		(track.has_image_upload ? libraryMediaUrl(track.id, "image") : "");
	const playerSound = createPlayerSound(track, {
		audioSource,
		imageSource,
		boardName: board?.name || "Sound library",
		boardId: board?.id || "library",
		sourceKind: "library",
	});
	return (
		<article className={styles.soundCard}>
			<div className={styles.soundArtwork}>
				{imageSource ? (
					<img className={styles.soundImage} src={imageSource} alt="" />
				) : (
					<div className={styles.soundImagePlaceholder}>LIBRARY</div>
				)}
				<button
					className={styles.artworkPlay}
					type="button"
					onClick={() => onPlay(playerSound)}
					disabled={!audioSource}
					aria-label={`Play ${track.name}`}
				>
					Play
				</button>
			</div>
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
				<button
					className={styles.labelEdit}
					type="button"
					onClick={() => setLabelsOpen((open) => !open)}
					aria-expanded={labelsOpen}
					disabled={pendingLabelSave}
				>
					{labelsOpen ? "Close labels" : "Edit labels"}
				</button>
				{labelsOpen && (
					<div className={styles.labelEditor}>
						{labelOptions.length === 0 ? (
							<span className={styles.hint}>Create a label above first.</span>
						) : labelOptions.map((labelName) => {
							const label = labelIds.find((item) => item.name === labelName);
							if (!label) return null;
							return (
								<label className={styles.labelChoice} key={label.id}>
									<input
										type="checkbox"
										checked={selectedLabelIds.includes(label.id)}
										disabled={pendingLabelSave}
										onChange={() => setSelectedLabelIds((current) => current.includes(label.id) ? current.filter((id) => id !== label.id) : [...current, label.id])}
									/>
									{label.name}
								</label>
							);
						})}
						<button className={styles.attachButton} type="button" disabled={pendingLabelSave || selectedLabelIds.length > 12} onClick={async () => { if (await onSaveLabels(track.id, selectedLabelIds)) setLabelsOpen(false); }}>{pendingLabelSave ? "Saving labels" : "Save labels"}</button>
					</div>
				)}
				<div className={styles.soundActions}>
					<button
						className={styles.playButton}
						type="button"
						onClick={() => onPlay(playerSound)}
						disabled={!audioSource}
					>
						Play now
					</button>
					<button
						className={styles.attachButton}
						type="button"
						onClick={() => useSoundPlayerStore.getState().addToQueue(playerSound)}
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
	const playerSound = createPlayerSound(sound, {
		audioSource,
		imageSource,
		boardName: board.name,
		boardId: board.id,
		sourceKind: sound.library_track_id ? "library" : "direct",
		sourceId: sound.library_track_id || sound.id,
	});
	return (
		<article className={styles.soundCard}>
			<div className={styles.soundArtwork}>
				{imageSource ? (
					<img className={styles.soundImage} src={imageSource} alt="" />
				) : (
					<div className={styles.soundImagePlaceholder}>SOUND</div>
				)}
				<button
					className={styles.artworkPlay}
					type="button"
					onClick={() => onPlay(playerSound)}
					disabled={!audioSource}
					aria-label={`Play ${sound.name}`}
				>
					Play
				</button>
			</div>
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
						onClick={() => onPlay(playerSound)}
						disabled={!audioSource}
					>
						Play now
					</button>
					<button
						className={styles.attachButton}
						type="button"
						onClick={() => onQueue(playerSound)}
						disabled={!audioSource}
					>
						Add to queue
					</button>
				</div>
				{sound.source_name && (
					<small className={styles.cardCredit}>{sound.source_name}</small>
				)}
			</div>
		</article>
	);
}
