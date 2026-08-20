import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import NoteManager from "../notes/NoteManager";
import {
	createCharacterNote,
	createCharacterNoteSection,
	deleteCharacterNote,
	deleteCharacterNoteSection,
	getCharacter,
	listCharacterNotes,
	updateCharacterNote,
	updateCharacterNoteSection,
} from "./characterApi";
import styles from "./CharacterNotesPage.module.css";

export default function CharacterNotesPage() {
	const { characterId } = useParams();
	const [character, setCharacter] = useState(null);
	const [characterState, setCharacterState] = useState({
		loading: true,
		error: "",
	});
	const [notesData, setNotesData] = useState({
		role: "unavailable",
		sections: [],
		notes: [],
	});
	const [notesState, setNotesState] = useState({
		loading: true,
		saving: false,
		error: "",
		message: "",
	});
	const characterRequestRef = useRef(0);
	const notesRequestRef = useRef(0);

	useEffect(() => {
		const requestGeneration = ++characterRequestRef.current;
		let active = true;
		setCharacter(null);
		setCharacterState({ loading: true, error: "" });
		getCharacter(characterId)
			.then((nextCharacter) => {
				if (active && characterRequestRef.current === requestGeneration) {
					setCharacter(nextCharacter);
					setCharacterState({ loading: false, error: "" });
				}
			})
			.catch((error) => {
				if (active && characterRequestRef.current === requestGeneration)
					setCharacterState({ loading: false, error: error.message });
			});
		return () => {
			active = false;
			if (characterRequestRef.current === requestGeneration)
				characterRequestRef.current += 1;
		};
	}, [characterId]);

	useEffect(() => {
		const requestGeneration = characterRequestRef.current;
		const notesRequest = ++notesRequestRef.current;
		let active = true;
		setNotesData({ role: "unavailable", sections: [], notes: [] });
		setNotesState({ loading: true, saving: false, error: "", message: "" });
		listCharacterNotes(characterId)
			.then((data) => {
				if (
					active &&
					characterRequestRef.current === requestGeneration &&
					notesRequestRef.current === notesRequest
				) {
					setNotesData(data);
					setNotesState({
						loading: false,
						saving: false,
						error: "",
						message: "",
					});
				}
			})
			.catch((error) => {
				if (
					active &&
					characterRequestRef.current === requestGeneration &&
					notesRequestRef.current === notesRequest
				) {
					setNotesState({
						loading: false,
						saving: false,
						error: error.message,
						message: "",
					});
				}
			});
		return () => {
			active = false;
		};
	}, [characterId]);

	const isCurrent = (requestGeneration) =>
		characterRequestRef.current === requestGeneration;

	const refreshNotes = async (
		requestGeneration,
		successMessage,
		errorPrefix,
	) => {
		const notesRequest = ++notesRequestRef.current;
		try {
			const nextData = await listCharacterNotes(characterId);
			if (
				!isCurrent(requestGeneration) ||
				notesRequestRef.current !== notesRequest
			)
				return false;
			setNotesData(nextData);
			setNotesState({
				loading: false,
				saving: false,
				error: "",
				message: successMessage,
			});
			return nextData;
		} catch (error) {
			if (
				isCurrent(requestGeneration) &&
				notesRequestRef.current === notesRequest
			)
				setNotesState({
					loading: false,
					saving: false,
					error: `${errorPrefix}, but the list could not be refreshed: ${error.message}`,
					message: "",
				});
			return false;
		}
	};

	const saveNote = async (draft) => {
		const requestGeneration = characterRequestRef.current;
		const notesRequest = notesRequestRef.current;
		setNotesState((current) => ({
			...current,
			saving: true,
			error: "",
			message: "",
		}));
		try {
			const payload = {
				title: draft.title,
				body: draft.body,
				section_id: draft.section_id,
				position: draft.position,
			};
			const saved = draft.id
				? await updateCharacterNote(characterId, draft.id, payload)
				: await createCharacterNote(characterId, payload);
			if (
				!isCurrent(requestGeneration) ||
				notesRequestRef.current !== notesRequest
			)
				return null;
			setNotesData((current) => ({
				...current,
				notes: draft.id
					? current.notes.map((note) => (note.id === saved.id ? saved : note))
					: [...current.notes, saved],
			}));
			const refreshed = await refreshNotes(
				requestGeneration,
				"Note saved.",
				"Note saved",
			);
			return refreshed?.notes?.find((note) => note.id === saved.id) || null;
		} catch (error) {
			if (isCurrent(requestGeneration))
				setNotesState((current) => ({
					...current,
					saving: false,
					error: error.message,
					message: "",
				}));
			return null;
		}
	};

	const removeNote = async (noteId) => {
		const requestGeneration = characterRequestRef.current;
		const notesRequest = notesRequestRef.current;
		setNotesState((current) => ({
			...current,
			saving: true,
			error: "",
			message: "",
		}));
		try {
			await deleteCharacterNote(characterId, noteId);
			if (
				!isCurrent(requestGeneration) ||
				notesRequestRef.current !== notesRequest
			)
				return false;
			setNotesData((current) => ({
				...current,
				notes: current.notes.filter((note) => note.id !== noteId),
			}));
			const refreshed = await refreshNotes(
				requestGeneration,
				"Note deleted.",
				"Note deleted",
			);
			return refreshed || true;
		} catch (error) {
			if (isCurrent(requestGeneration))
				setNotesState((current) => ({
					...current,
					saving: false,
					error: error.message,
					message: "",
				}));
			return false;
		}
	};

	const createSection = async (name) => {
		const requestGeneration = characterRequestRef.current;
		setNotesState((current) => ({
			...current,
			saving: true,
			error: "",
			message: "",
		}));
		try {
			const created = await createCharacterNoteSection(characterId, { name });
			if (!isCurrent(requestGeneration)) return null;
			setNotesData((current) => ({
				...current,
				sections: [...current.sections, created],
			}));
			await refreshNotes(
				requestGeneration,
				"Section created.",
				"Section created",
			);
			return isCurrent(requestGeneration) ? created : null;
		} catch (error) {
			if (isCurrent(requestGeneration))
				setNotesState((current) => ({
					...current,
					saving: false,
					error: error.message,
					message: "",
				}));
			return null;
		}
	};

	const renameSection = async (sectionId, name) => {
		const requestGeneration = characterRequestRef.current;
		setNotesState((current) => ({
			...current,
			saving: true,
			error: "",
			message: "",
		}));
		try {
			const updated = await updateCharacterNoteSection(characterId, sectionId, {
				name,
			});
			if (!isCurrent(requestGeneration)) return;
			setNotesData((current) => ({
				...current,
				sections: current.sections.map((section) =>
					section.id === updated.id ? updated : section,
				),
			}));
			await refreshNotes(
				requestGeneration,
				"Section renamed.",
				"Section renamed",
			);
		} catch (error) {
			if (isCurrent(requestGeneration))
				setNotesState((current) => ({
					...current,
					saving: false,
					error: error.message,
					message: "",
				}));
		}
	};

	const deleteSection = async (sectionId) => {
		const requestGeneration = characterRequestRef.current;
		setNotesState((current) => ({
			...current,
			saving: true,
			error: "",
			message: "",
		}));
		try {
			await deleteCharacterNoteSection(characterId, sectionId);
			if (!isCurrent(requestGeneration)) return null;
			const notesRequest = ++notesRequestRef.current;
			try {
				const nextData = await listCharacterNotes(characterId);
				if (
					!isCurrent(requestGeneration) ||
					notesRequestRef.current !== notesRequest
				)
					return null;
				if (
					!Array.isArray(nextData.sections) ||
					nextData.sections.some((section) => section?.id === sectionId) ||
					!nextData.sections.some(
						(section) => section?.id && section.id !== sectionId,
					)
				)
					throw new Error(
						"The refreshed section list was not canonical after deletion.",
					);
				setNotesData(nextData);
				setNotesState({
					loading: false,
					saving: false,
					error: "",
					message: "Section deleted.",
				});
				return { deleted: true, sections: nextData.sections };
			} catch (error) {
				if (
					isCurrent(requestGeneration) &&
					notesRequestRef.current === notesRequest
				)
					setNotesState({
						loading: false,
						saving: false,
						error: `Section deleted, but the list could not be refreshed: ${error.message}`,
						message: "",
					});
				return isCurrent(requestGeneration) &&
					notesRequestRef.current === notesRequest
					? { deleted: true, deletedSectionId: sectionId, sections: null }
					: null;
			}
		} catch (error) {
			if (isCurrent(requestGeneration))
				setNotesState((current) => ({
					...current,
					saving: false,
					error: error.message,
					message: "",
				}));
			return false;
		}
	};

	const retryNotes = async () => {
		const requestGeneration = characterRequestRef.current;
		setNotesState((current) => ({
			...current,
			loading: true,
			error: "",
			message: "",
		}));
		return refreshNotes(requestGeneration, "Notes refreshed.", "Notes refresh");
	};

	const moveNote = (note, sectionId, position) =>
		saveNote({ ...note, section_id: sectionId, position });

	if (characterState.loading)
		return <p className="muted">Loading character notes...</p>;
	if (!character)
		return (
			<section className={styles.page}>
				<p className={styles.error}>
					{characterState.error || "Character not found."}
				</p>
				<Link to="/characters" className={styles.back}>
					Back to character vault
				</Link>
			</section>
		);

	return (
		<section className={styles.page}>
			<div className={styles.topBar}>
				<Link to={`/characters/${characterId}`} className={styles.back}>
					Back to character sheet
				</Link>
				{notesData.role === "owner" && (
					<Link to={`/characters/${characterId}/edit`} className={styles.back}>
						Edit character
					</Link>
				)}
			</div>
			<header className={styles.heading}>
				<div>
					<p className="eyebrow">CHARACTER NOTEBOOK</p>
					<h2>{character.name} notes</h2>
					<p className="muted">
						Keep the details that belong to this character together.
					</p>
				</div>
			</header>
			<NoteManager
				key={characterId}
				title="Character notes"
				eyebrow="CHARACTER NOTEBOOK"
				sections={notesData.sections}
				notes={notesData.notes}
				loading={notesState.loading}
				saving={notesState.saving}
				error={notesState.error}
				message={notesState.message}
				readOnly={notesData.role !== "owner"}
				onSaveNote={saveNote}
				onDeleteNote={removeNote}
				onCreateSection={createSection}
				onRenameSection={renameSection}
				onDeleteSection={deleteSection}
				onMoveNote={moveNote}
				onRetry={retryNotes}
			/>
		</section>
	);
}
