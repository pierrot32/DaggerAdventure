import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Button from "../../components/Button/Button";
import styles from "./HomePage.module.css";

// Public marketing page explaining the app, with sign in/up entry points
export default function HomePage() {
	const { user, status } = useAuth();

	if (status === "ready" && user) return <Navigate to="/dashboard" replace />;

	return (
		<main className={styles.shell}>
			<p className="eyebrow">DAGGER ADVENTURE</p>
			<h1>Your story starts here.</h1>
			<p className={`muted ${styles.intro}`}>
				A companion app for running and playing campaigns - characters,
				campaigns, and tools for your table, all in one private space.
			</p>
			<div className={styles.actions}>
				<Link to="/login">
					<Button>Sign in</Button>
				</Link>
				<Link to="/register">
					<Button variant="text">Create an account</Button>
				</Link>
			</div>
			<div className={styles.sigil} aria-hidden="true">
				✦
			</div>
		</main>
	);
}
