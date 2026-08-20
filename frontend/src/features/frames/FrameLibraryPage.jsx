import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button/Button";
import { listLibraryFrames } from "./frameApi";
import styles from "./FrameLibraryPage.module.css";

export default function FrameLibraryPage() {
	const navigate = useNavigate();
	const [frames, setFrames] = useState([]);
	const [state, setState] = useState({ loading: true, error: "" });

	useEffect(() => {
		listLibraryFrames()
			.then((items) => {
				setFrames(items);
				setState({ loading: false, error: "" });
			})
			.catch((error) => setState({ loading: false, error: error.message }));
	}, []);

	return (
		<section className={styles.page}>
			<div className={styles.heading}>
				<div>
					<p className="eyebrow">GM FRAME LIBRARY</p>
					<h2>Reusable campaign frames</h2>
					<p className="muted">
						Author the shapes of play you want to bring back to future tables.
					</p>
				</div>
				<Button type="button" onClick={() => navigate("/frames/new")}>
					New frame
				</Button>
			</div>
			{state.error && <p className={styles.error}>{state.error}</p>}
			{state.loading ? (
				<p className="muted">Loading frame library...</p>
			) : (
				<div className={styles.layout}>
					<div className={styles.list}>
						{frames.length === 0 && (
							<p className="muted">No reusable frames yet.</p>
						)}
						{frames.map((frame) => (
							<button
								type="button"
								className={styles.card}
								onClick={() => navigate(`/frames/${frame.id}/edit`)}
								key={frame.id}
							>
								<strong>{frame.name}</strong>
								<span>{frame.description || "No description yet."}</span>
								<small>Complexity {frame.complexity_rating}/5</small>
							</button>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
