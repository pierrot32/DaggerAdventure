import { useEffect, useState } from "react";
import { ACCESS_LEVELS } from "../../utils/permissions";
import { useAdminStore } from "./adminStore";
import styles from "./AdminUsersPage.module.css";

const levels = Object.values(ACCESS_LEVELS);

// Admin user directory: search by email/name, inspect IDs, and grant access
export default function AdminUsersPage() {
	const {
		users,
		total,
		limit,
		loading,
		mutationLoading,
		error,
		fetchUsers,
		changeAccessLevel,
		changeApproval,
		changeAiGenerationAccess,
	} = useAdminStore();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState("");
	const [page, setPage] = useState(1);

	useEffect(() => {
		fetchUsers({ search, access_level: filter, page });
	}, [fetchUsers, search, filter, page]);

	const totalPages = Math.max(1, Math.ceil(total / limit));
	const visiblePage = Math.min(page, totalPages);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	const currentQuery = { search, access_level: filter, page: visiblePage };

	const update = async (userId, access_level) => {
		if (window.confirm(`Change this user's access level to ${access_level}?`)) {
			await changeAccessLevel(userId, access_level);
		}
	};

	const updateApproval = async (user, accepted) => {
		const action = accepted ? "accept" : "refuse";
		const outcome = accepted ? "basic player access" : "no gameplay access";
		if (
			window.confirm(
				`${action[0].toUpperCase()}${action.slice(1)} ${user.email}? This leaves the account with ${outcome}.`,
			)
		) {
			await changeApproval(user.id, accepted, currentQuery);
		}
	};

	const updateAiAccess = async (user, enabled) => {
		await changeAiGenerationAccess(user.id, enabled);
	};

	return (
		<section>
			<p className="eyebrow">ADMINISTRATION</p>
			<h2>User access</h2>
			<p className="muted">
				{total} account{total === 1 ? "" : "s"} found
			</p>
			<div className={styles.filters}>
				<input
					aria-label="Search users"
					placeholder="Search email or name"
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setPage(1);
					}}
				/>
				<select
					aria-label="Filter access level"
					value={filter}
					onChange={(event) => {
						setFilter(event.target.value);
						setPage(1);
					}}
				>
					<option value="">All access levels</option>
					{levels.map((level) => (
						<option key={level} value={level}>
							{level === ACCESS_LEVELS.NOTHING
								? "Pending approval (no gameplay access)"
								: level}
						</option>
					))}
				</select>
			</div>
			<p className={styles.pendingHelp}>
				Pending accounts have no gameplay access. Accept grants basic player
				access; Refuse keeps the account without gameplay access.
			</p>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{loading ? (
				<p className="muted">Loading users...</p>
			) : (
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>User ID</th>
								<th>Account</th>
								<th>Email verification</th>
								<th>Access level</th>
								<th>Approval</th>
								<th>AI generation</th>
								<th>Change</th>
							</tr>
						</thead>
						<tbody>
							{users.map((user) => (
								<tr key={user.id}>
									<td className={styles.id}>{user.id}</td>
									<td>
										<strong>{user.name}</strong>
										<span className={styles.email}>{user.email}</span>
									</td>
									<td>
										{user.email_verified_at ? "Verified" : "Pending"}
									</td>
									<td>
										{user.access_level === ACCESS_LEVELS.NOTHING ? (
											<>
												<strong className={styles.pendingLabel}>Pending</strong>
												<span className={styles.email}>No gameplay access</span>
											</>
										) : (
											user.access_level
										)}
									</td>
									<td>
										{user.access_level === ACCESS_LEVELS.NOTHING ? (
											<div className={styles.approvalControl}>
												<button
													type="button"
													className={styles.acceptButton}
													onClick={() => updateApproval(user, true)}
													disabled={loading || mutationLoading}
												>
													Accept
												</button>
												<button
													type="button"
													className={styles.refuseButton}
													onClick={() => updateApproval(user, false)}
													disabled={loading || mutationLoading}
												>
													Refuse
												</button>
											</div>
										) : (
											<span className="muted">Not pending</span>
										)}
									</td>
									<td>
										<label className={styles.toggle}>
											<input
												type="checkbox"
												checked={user.ai_generation_enabled}
												onChange={(event) =>
													updateAiAccess(user, event.target.checked)
												}
												disabled={loading || mutationLoading}
												aria-label={`AI generation access for ${user.email}`}
											/>
											<span>
												{user.ai_generation_enabled ? "Enabled" : "Off"}
											</span>
										</label>
									</td>
									<td>
										<select
											aria-label={`Access level for ${user.email}`}
											value={user.access_level}
											onChange={(event) => update(user.id, event.target.value)}
										>
											{levels.map((level) => (
												<option key={level} value={level}>
													{level}
												</option>
											))}
										</select>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<div className={styles.pagination}>
				<button
					type="button"
					onClick={() => setPage((current) => Math.max(1, current - 1))}
					disabled={loading || visiblePage <= 1}
				>
					Previous
				</button>
				<span>
					Page {visiblePage} of {totalPages} ({total} total)
				</span>
				<button
					type="button"
					onClick={() =>
						setPage((current) => Math.min(totalPages, current + 1))
					}
					disabled={loading || visiblePage >= totalPages}
				>
					Next
				</button>
			</div>
		</section>
	);
}
