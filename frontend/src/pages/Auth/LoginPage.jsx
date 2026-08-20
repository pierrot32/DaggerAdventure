import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import TextField from "../../components/TextField/TextField";
import Button from "../../components/Button/Button";
import styles from "./Auth.module.css";

// Login form - separate from RegisterPage so each stays simple and independently extensible
export default function LoginPage() {
	const { user, status, login, resendVerification } = useAuth();
	const navigate = useNavigate();
	const [form, setForm] = useState({ email: "", password: "" });
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [resending, setResending] = useState(false);
	const [resendMessage, setResendMessage] = useState("");

	if (status === "ready" && user) return <Navigate to="/dashboard" replace />;

	const submit = async (event) => {
		event.preventDefault();
		setSubmitting(true);
		setError("");
		setResendMessage("");
		try {
			await login(form.email, form.password);
			navigate("/dashboard");
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
				<p className="eyebrow">MEMBER ACCESS</p>
				<h2>Continue your journey</h2>
				<p className="muted">Use your email and password to sign in.</p>
				<form className={styles.form} onSubmit={submit}>
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
						autoComplete="current-password"
						value={form.password}
						onChange={(event) =>
							setForm({ ...form, password: event.target.value })
						}
					/>
					{error && <p className={styles.error}>{error}</p>}
					{error && (
						<div>
							<Button
								type="button"
								variant="text"
								disabled={resending || !form.email}
								onClick={resend}
							>
								{resending ? "Requesting link..." : "Resend verification email"}
							</Button>
							{resendMessage && <p className="muted">{resendMessage}</p>}
						</div>
					)}
					<Button type="submit" disabled={submitting} className={styles.submit}>
						{submitting ? "Signing in..." : "Sign in"}
					</Button>
				</form>
				<Link
					to="/register"
					className={`${styles.switch} ${styles.switchLink}`}
				>
					Need an account? Create one
				</Link>
			</div>
		</main>
	);
}
