import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button/Button";
import { useAuth } from "../../hooks/useAuth";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
	const navigate = useNavigate();
	const { user, updateProfile, deleteAccount } = useAuth();
	const [name, setName] = useState(user?.name || "");
	const [state, setState] = useState({
		saving: false,
		deleting: false,
		error: "",
		message: "",
	});

	const saveName = async (event) => {
		event.preventDefault();
		setState({ saving: true, deleting: false, error: "", message: "" });
		try {
			await updateProfile(name);
			setState({
				saving: false,
				deleting: false,
				error: "",
				message: "Your display name was updated.",
			});
		} catch (error) {
			setState({
				saving: false,
				deleting: false,
				error: error.message,
				message: "",
			});
		}
	};

	const removeAccount = async () => {
		if (
			window.prompt(
				"Type DELETE to permanently remove your account and its owned data.",
			) !== "DELETE"
		)
			return;
		setState({ saving: false, deleting: true, error: "", message: "" });
		try {
			await deleteAccount();
			navigate("/", { replace: true });
		} catch (error) {
			setState({
				saving: false,
				deleting: false,
				error: error.message,
				message: "",
			});
		}
	};

	if (!user) return null;

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div>
					<p className="eyebrow">ACCOUNT</p>
					<h2>Settings</h2>
					<p className="muted">
						Keep your profile details current and manage your account.
					</p>
				</div>
			</header>

			<div className={styles.layout}>
				<form className={styles.panel} onSubmit={saveName}>
					<div className={styles.panelHeading}>
						<div>
							<p className="eyebrow">PROFILE</p>
							<h3>Personal details</h3>
						</div>
						<span className={styles.status}>Signed in</span>
					</div>
					<label>
						Display name
						<input
							required
							maxLength="80"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
					<label>
						Email
						<input value={user.email} readOnly />
					</label>
					<label>
						Access level
						<input value={user.access_level} readOnly />
					</label>
					<div className={styles.actions}>
						<Button type="submit" disabled={state.saving || state.deleting}>
							{state.saving ? "Saving..." : "Save name"}
						</Button>
					</div>
				</form>

				<section className={`${styles.panel} ${styles.dangerPanel}`}>
					<div className={styles.panelHeading}>
						<div>
							<p className="eyebrow">DANGER ZONE</p>
							<h3>Delete account</h3>
						</div>
					</div>
					<p>
						Deleting your account removes your characters, frame library,
						invitations, and adventures you own. This cannot be undone.
					</p>
					<Button
						type="button"
						variant="text"
						disabled={state.saving || state.deleting}
						onClick={removeAccount}
					>
						{state.deleting ? "Deleting account..." : "Delete my account"}
					</Button>
				</section>
			</div>
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
		</section>
	);
}
