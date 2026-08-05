import { useAuth } from '../../hooks/useAuth';
import { ACCESS_LEVELS } from '../../utils/permissions';
import styles from './DashboardPage.module.css';

// Authed landing page - future Daggerheart features (characters, campaigns) mount here
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className={styles.panel}>
      <p className="eyebrow">WELCOME BACK</p>
      <h2>{user.name}</h2>
      <p className="muted">{user.email}</p>
      <div className={styles.accessBox}>
        <span className={styles.statusDot} />
        <div>
          <strong>Adventure access granted</strong>
          <p className={styles.accessNote}>Access level: {user.access_level}</p>
        </div>
      </div>
      {user.access_level === ACCESS_LEVELS.NOTHING && (
        <p className="muted">Your account is waiting for an administrator to grant gameplay access.</p>
      )}
    </section>
  );
}
