import { useState } from "react";
import Button from "../../components/Button/Button";
import { importBook } from "../characters/characterApi";
import styles from "./BookImportPage.module.css";

export default function BookImportPage() {
	const [file, setFile] = useState(null);
	const [dragging, setDragging] = useState(false);
	const [state, setState] = useState({ busy: false, error: "", message: "" });

	const chooseFile = (candidate) => {
		if (!candidate) return;
		if (!candidate.name.toLowerCase().endsWith(".json")) {
			setFile(null);
			setState({
				busy: false,
				error: "Choose a .json book file.",
				message: "",
			});
			return;
		}
		setFile(candidate);
		setState({ busy: false, error: "", message: "" });
	};

	const handleDrop = (event) => {
		event.preventDefault();
		setDragging(false);
		chooseFile(event.dataTransfer.files[0]);
	};

	const submit = async (event) => {
		event.preventDefault();
		if (!file) return;
		setState({ busy: true, error: "", message: "" });
		try {
			const book = JSON.parse(await file.text());
			const imported = await importBook(book);
			setState({
				busy: false,
				error: "",
				message: `${imported.title} ${imported.version} imported successfully.`,
			});
		} catch (error) {
			setState({
				busy: false,
				error:
					error instanceof SyntaxError
						? "The selected file is not valid JSON."
						: error.message,
				message: "",
			});
		}
	};

	return (
		<section className={styles.page}>
			<p className="eyebrow">CONTENT LIBRARY</p>
			<h2>Upload or update a book</h2>
			<p className="muted">
				Drop a book JSON file here to add it to the library or update the
				existing book with the same ID.
			</p>
			<form onSubmit={submit} className={styles.form}>
				<label
					className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
					onDragEnter={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragOver={(event) => event.preventDefault()}
					onDragLeave={(event) => {
						if (event.currentTarget === event.target) setDragging(false);
					}}
					onDrop={handleDrop}
				>
					<span className={styles.dropTitle}>
						{file ? file.name : "Drop a .json book file here"}
					</span>
					<span className={styles.dropHint}>
						{file ? "Ready to import" : "or click to browse your files"}
					</span>
					<input
						type="file"
						accept="application/json,.json"
						onChange={(event) => chooseFile(event.target.files[0])}
					/>
				</label>
				<Button type="submit" disabled={!file || state.busy}>
					{state.busy ? "Uploading book..." : "Upload / update book"}
				</Button>
			</form>
			{state.error && <p className={styles.error}>{state.error}</p>}
			{state.message && <p className={styles.message}>{state.message}</p>}
		</section>
	);
}
