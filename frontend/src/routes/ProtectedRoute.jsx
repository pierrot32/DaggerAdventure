import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { hasAccessLevel } from "../utils/permissions";
import styles from "./ProtectedRoute.module.css";

// Gates a route behind login, and optionally behind access levels
export default function ProtectedRoute({ children, allowedAccessLevels = [] }) {
	const { user, status } = useAuth();

	if (status === "loading") {
		return (
			<main className={styles.loading} aria-live="polite">
				<p>Restoring your session...</p>
			</main>
		);
	}
	if (!user) return <Navigate to="/login" replace />;
	if (
		allowedAccessLevels.length > 0 &&
		!hasAccessLevel(user, ...allowedAccessLevels)
	) {
		return <Navigate to="/dashboard" replace />;
	}

	return children;
}
