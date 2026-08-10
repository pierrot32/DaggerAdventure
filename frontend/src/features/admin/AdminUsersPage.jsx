import { useEffect, useState } from 'react';
import { ACCESS_LEVELS } from '../../utils/permissions';
import { useAdminStore } from './adminStore';
import styles from './AdminUsersPage.module.css';

const levels = Object.values(ACCESS_LEVELS);

// Admin user directory: search by email/name, inspect IDs, and grant access
export default function AdminUsersPage() {
  const {
    users, total, loading, error, fetchUsers, changeAccessLevel, changeAiGenerationAccess,
  } = useAdminStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchUsers({ search, access_level: filter, page: 1 });
  }, [fetchUsers, search, filter]);

  const update = async (userId, access_level) => {
    if (window.confirm(`Change this user's access level to ${access_level}?`)) {
      await changeAccessLevel(userId, access_level);
    }
  };

  const updateAiAccess = async (user, enabled) => {
    try {
      await changeAiGenerationAccess(user.id, enabled);
    } catch {
    }
  };

  return (
    <section>
      <p className="eyebrow">ADMINISTRATION</p>
      <h2>User access</h2>
      <p className="muted">{total} account{total === 1 ? '' : 's'} found</p>
      <div className={styles.filters}>
        <input aria-label="Search users" placeholder="Search email or name" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter access level" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All access levels</option>
          {levels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className="muted">Loading users...</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>User ID</th><th>Account</th><th>Access level</th><th>AI generation</th><th>Change</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className={styles.id}>{user.id}</td>
                  <td><strong>{user.name}</strong><span className={styles.email}>{user.email}</span></td>
                  <td>{user.access_level}</td>
                  <td>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={user.ai_generation_enabled}
                        onChange={(event) => updateAiAccess(user, event.target.checked)}
                        aria-label={`AI generation access for ${user.email}`}
                      />
                      <span>{user.ai_generation_enabled ? 'Enabled' : 'Off'}</span>
                    </label>
                  </td>
                  <td>
                    <select aria-label={`Access level for ${user.email}`} value={user.access_level} onChange={(event) => update(user.id, event.target.value)}>
                      {levels.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
