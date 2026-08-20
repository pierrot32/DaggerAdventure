import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { verifyEmail } from "../../api/authApi";
import styles from "./Auth.module.css";

export default function VerifyEmailPage() {
	const token = useRef(
		new URLSearchParams(window.location.hash.slice(1)).get("token"),
	).current;
	const verificationRequest = useRef(null);
	const [state, setState] = useState({ loading: true, success: false, error: "" });

	useEffect(() => {
		if (!token) {
			setState({
				loading: false,
				success: false,
				error: "This verification link is missing its token.",
			});
			return;
		}

		window.history.replaceState({}, document.title, window.location.pathname);
		let active = true;
		if (!verificationRequest.current) {
			verificationRequest.current = verifyEmail(token);
		}
		verificationRequest.current
			.then(() => {
				if (active) setState({ loading: false, success: true, error: "" });
			})
			.catch((error) => {
				if (active)
					setState({ loading: false, success: false, error: error.message });
			});
		return () => {
			active = false;
		};
	}, [token]);

	return (
		<main className={styles.shell}>
			<div className={styles.panel}>
				<p className="eyebrow">EMAIL VERIFICATION</p>
				{state.loading ? (
					<>
						<h2>Checking your link</h2>
						<p className="muted">Please wait while we verify your email.</p>
					</>
				) : state.success ? (
					<>
						<h2>Email verified</h2>
						<p className="muted">
							Your account is ready for sign in. Administrator approval is still
							required for gameplay access.
						</p>
						<Link to="/login" className={styles.switchLink}>
							Continue to sign in
						</Link>
					</>
				) : (
					<>
						<h2>Verification failed</h2>
						<p className={styles.error} role="alert">
							{state.error}
						</p>
						<p className="muted">
							Verification links expire after one hour and can only be used once.
						</p>
						<Link to="/login" className={styles.switchLink}>
							Return to sign in
						</Link>
					</>
				)}
			</div>
		</main>
	);
}