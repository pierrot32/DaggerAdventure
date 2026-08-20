import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import TextField from "../../components/TextField/TextField";
import Button from "../../components/Button/Button";
import styles from "./Auth.module.css";

// Registration form - kept separate from LoginPage per user/route, not a shared "mode" toggle
export default function RegisterPage() {
	const { user, status, register, resendVerification } = useAuth();
	const [form, setForm] = useState({ email: "", name: "", password: "" });
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [pendingMessage, setPendingMessage] = useState("");
	const [resending, setResending] = useState(false);
	const [resendMessage, setResendMessage] = useState("");

	if (status === "ready" && user) return <Navigate to="/dashboard" replace />;

	const submit = async (event) => {
		event.preventDefault();
		setSubmitting(true);
		setError("");
		try {
			const result = await register(form);
			setPendingMessage(result.message);
			setResendMessage("");
		} catch (err) {
			setError(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const resend = async () => {
		setResending(true);
		setResendMessage("");
		try {
			const result = await resendVerification(form.email);
			setResendMessage(result.message);
		} catch (err) {
			setResendMessage(err.message);
		} finally {
			setResending(false);
		}
	};

	return (
		<main className={styles.shell}>
			<div className={styles.panel}>
				<p className="eyebrow">NEW ACCOUNT</p>
				<h2>Create your account</h2>
				<p className="muted">
					Your name will identify you inside the application.
				</p>
				{pendingMessage ? (
					<section className={styles.form} aria-live="polite">
						<p>{pendingMessage}</p>
						<p className="muted">
							No session was created. Verify your email first, then sign in. Gameplay
							access still requires administrator approval.
						</p>
						{resendMessage && <p className={styles.error}>{resendMessage}</p>}
						<Button
							type="button"
							disabled={resending}
							onClick={resend}
							className={styles.submit}
						>
							{resending ? "Requesting link..." : "Resend verification email"}
						</Button>
					</section>
				) : (
				<form className={styles.form} onSubmit={submit}>
					<TextField
						label="Name"
						required
						maxLength="80"
						autoComplete="name"
						value={form.name}
						onChange={(event) => setForm({ ...form, name: event.target.value })}
					/>
					<TextField
						label="Email address"
						type="email"
						required
						autoComplete="email"
						value={form.email}
						onChange={(event) =>
							setForm({ ...form, email: event.target.value })
						}
					/>
					<TextField
						label="Password"
						type="password"
						required
						autoComplete="new-password"
						value={form.password}
						onChange={(event) =>
							setForm({ ...form, password: event.target.value })
						}
					/>
					{error && <p className={styles.error}>{error}</p>}
					<Button type="submit" disabled={submitting} className={styles.submit}>
						{submitting ? "Creating account..." : "Create account"}
					</Button>
				</form>
				)}
				<Link to="/login" className={`${styles.switch} ${styles.switchLink}`}>
					Already have an account? Sign in
				</Link>
			</div>
		</main>
	);
}
